/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser,node */

define("common/js/Utils", () => {
	/**
	 * Useful utilities
	 */

	const TOSTRING_TYPES = [
		"Boolean",
		"Number",
		"Date",
		"String",
		"RegExp"
	];

	const STANDARD_TYPES = [
		"Function",
		"Symbol",
		"Error",
		"EvalError",
		"InternalError",
		"RangeError",
		"ReferenceError",
		"SyntaxError",
		"TypeError",
		"URIError",
		"Math",
		"Array",
		"Int8Array",
		"Uint8Array",
		"Uint8ClampedArray",
		"Int16Array",
		"Uint16Array",
		"Int32Array",
		"Uint32Array",
		"Float32Array",
		"Float64Array",
		"Map",
		"Set",
		"WeakMap",
		"WeakSet",
		"ArrayBuffer",
		"SharedArrayBuffer ",
		"Atomics ",
		"DataView",
		"JSON",
		"Promise",
		"Generator",
		"GeneratorFunction",
		"AsyncFunction",
		"Reflect",
		"Proxy",
		"Intl",
		"Intl.Collator",
		"Intl.DateTimeFormat",
		"Intl.NumberFormat",
		"Timeout"
	];

	var TIMERS = {};
	var TIMER_ID = 1;

	class Utils {

		/**
		 * Expand environment variables in the data string
		 * @param {String} data string containing env var references
		 * @return {String} data string with env vars expanded
		 */
		static expandEnvVars(data) {
			let rep = function(match, v) {
				if (typeof process.env[v] !== "undefined")
					return process.env[v];
				return match;
			}
			data = ("" + data).replace(/^~/, "${HOME}");
			return data
			.replace(/\$([A-Z]+)/g, rep)
			.replace(/\$\{([^}]+)\}/g, rep);
		};

		/**
		 * Debugging support for dumping a circular structure
		 * @param {object} data thing to dump
		 * @return {string} dump of data
		 */
		static dump(data, cache) {

			function indent(s) {
				return " " + s.replace(/\n/g, "\n ");
			}
			if (typeof cache == "undefined")
				cache = [];

			if (cache.indexOf(data) >= 0)
				return "LOOP";
			cache.push(data);

			if (typeof data === "function")
				return `<${data.name}>`;

			if (typeof data === "string")
				return `"${data}"`;

			if (typeof data !== "object" || data === null)
				return data;

			let s = "";
			let ob = "{";
			let cb = "}";

			if (typeof data.constructor !== "undefined") {
				if (data.constructor.name === "Array") {
					ob = "[";
					cb = "]";
				} else if (data.constructor.name === "String") {
					return '"' + data + '"';
				} else if (TOSTRING_TYPES.indexOf(data.constructor.name) >= 0) {
					// Use toString
					return data;
				} else if (STANDARD_TYPES.indexOf(data.constructor.name) >= 0) {
					// Use <typed>toString
					return `<${data.constructor.name}>${data}`;
				} else if (data.constructor.name !== "Object") {
					s += `<${data.constructor.name}>`;
				}
			}
			if (data.toString !== Object.prototype.toString &&
				data.toString !== Array.prototype.toString) {
				s += data.toString();
			} else {
				s += ob;
				let values = [];
				for (let i in data) {
					let val = Utils.dump(data[i], cache);
					if (ob === "{")
						val = `${i}: ${val}`;
					values.push(indent("" + val))
				}
				s += `\n${values.join(",\n")}\n${cb}`;
			}
			return s;
		}

		/**
		 * Join arguments with no spaces to create a message, expanding objects
		 * using Utils.dump()
		 * @param args arguments vector
		 * @param start optional point in args to start constructing the message.
		 * Without this the whole args vector will be used.
		 * @return string dump of the arguments from args[start]
		 */
		static joinArgs(args, start) {
			let mess = "";
			if (typeof start === "undefined")
				start = 0;
			for (let i = start; i < args.length; i++) {
				if (typeof args[i] === "object" && args[i] !== null) {
					mess += Utils.dump(args[i]);
				} else {
					mess += args[i];
				}
			}
			return mess;
		}

		/**
		 * Promisify requirejs. Require a single module.
		 */
		static require(mod) {
			return new Promise((resolve, reject) => {
				requirejs(
					[mod],
					function () {
						resolve(arguments[0]);
					},
					function (err) {
						reject(err);
					});
			});
		}

		/**
		 * Construct a slightly customised exception object
		 * @param name Exception type name
		 * @param args remaining args will be
		 * @return an Error object
		 */
		static exception() {
			let e = new Error(Utils.joinArgs(arguments, 1));
			e.name = arguments[0];
			return e;
		}

		/**
		 * Set the string that defines what tags are traced.
		 * @param t comma-separated string with module names
		 * e.g. "Rules,Controller" or "all,-DataModel"
		 */
		static TRACEfilter(t) {
			Utils.traceFilter = t.split(",");
			console.log(`TRACE set to ${t}`);
		}

		/**
		 * Determine if tracing is enabled for the given module
		 */
		static TRACEing(module) {
			return typeof Utils.traceFilter !== "undefined"
			&& (Utils.traceFilter.indexOf(module) >= 0
				|| (Utils.traceFilter.indexOf("all") >= 0
					&& Utils.traceFilter.indexOf(`-${module}`) < 0));
		}

		/**
		 * Produce a tagged log message. The first parameter is interpreted
		 * as a tag and TRACEing is checked
		 */
		static TRACE() {
			var args = [].slice.call(arguments);
			let module = args.shift();
			if (Utils.TRACEing(module)) {
				args.unshift(new Date().toISOString(), " ", module, ": ");
				Utils.writeTrace(Utils.joinArgs(args));
			}
		}

		/**
		 * Set where to write trace output to. Requires fs, so not available
		 * on browsers.
		 * @param {string} where path to the file to use for logging
		 */
		static TRACEto(where) {
			if (typeof where === "undefined") {
				Utils.writeTrace = console.log;
				return;
			}
			requirejs(["fs"], function (fs) {
				Utils.writeTrace = async function (s) {
					await fs.promises.writeFile(
						where, `${s}\n`, { encoding: "utf8", flag: "a+"});
				}
			});
		}

		/**
		 * eval() the code, generating meaningful syntax errors
		 * (with line numbers)
		 * @param {String} code the code to eval
		 */
		static eval(code) {
			let compiled;
			eval(`compiled=${code}`);
			return compiled;
		}

		/**
		 * Like setTimeout, but run at a given date rather than after
		 * a delta. date can be a Date object or a time in ms
		 */
		static runAt(func, date) {
			let now = (new Date()).getTime();
			let then = typeof date === "object" ? date.getTime() : date;
			let diff = Math.max((then - now), 0);
			if (diff > 0x7FFFFFFF) // setTimeout limit is MAX_INT32=(2^31-1)
				Utils.startTimer("runAt", () => Utils.runAt(func, date), 0x7FFFFFFF);
			else
				Utils.startTimer("runAt", func, diff);
		}

		static startTimer(descr, fn, timeout) {
			let id = `${descr}:${TIMER_ID++}`;
			//Utils.TRACE(id, "started");
			TIMERS[id] = {
				timer: setTimeout(() => {
					//Utils.TRACE(id, "fired");
					delete TIMERS[id];
					fn();
				}, timeout),
				when: Date.now() + timeout
			};
			return id;
		}

		static cancelTimer(id) {
			if (typeof TIMERS[id] === "undefined")
				throw new Error(`No such timer ${id}!`);
			//Utils.TRACE(id, "cancelled");
			clearTimeout(TIMERS[id].timer);
			delete TIMERS[id];
		}

		static getTimers() {
			return TIMERS;
		}
	}

	if (typeof jQuery !== "undefined")
		Utils.extend = jQuery.extend;
	else
		Utils.extend = require("extend");

	// Mail handler
	//Utils.sendMail = undefined;

	// Private function to write tracing info
	Utils.writeTrace = console.log;

	Utils.trace = "";

	// 'until' values that indicate commands
	Utils.BOOST = -274;
	Utils.CLEAR = -275;

	return Utils;
});
