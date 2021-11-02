/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

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

	const TAG = "Utils";

    /**
     * Collection of functions that provide useful utilities.
     * @namespace
     */
    class Utils {

        /**
         * Expand environment variables in the data string. Only works
         * under node.js, using `process`.
         * @param {string} data string containing env var references
         * @return {string} argument string with env vars expanded
         */
        static expandEnvVars(data) {
            const rep = function (match, v) {
                if (typeof process.env[v] !== "undefined")
                    return process.env[v];
                return match;
            };
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
                const values = [];
                for (let i of Object.keys(data).sort()) {
                    let val = Utils.dump(data[i], cache);
                    if (ob === "{")
                        val = `${i}: ${val}`;
                    values.push(indent("" + val));
                }
                s += `\n${values.join(",\n")}\n${cb}`;
            }
            return s;
        }

        /**
         * Join arguments with no spaces to create a message, expanding objects
         * using Utils.dump()
         * @param {string[]} args arguments vector
         * @param {number} start optional point in args to start constructing the message.
         * Without this the whole args vector will be used.
         * @return {string} dump of the arguments from args[start]
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
         * @param {string} name Exception type name
         * @param {string[]} args remaining args will be
         * @return {Error} an Error object
         */
        static exception() {
            const e = new Error(Utils.joinArgs(arguments, 1));
            e.name = arguments[0];
            return e;
        }

        /**
         * Set the filter that defines what tags are traced. TRACE
         * statements in the code each have a "trace group id" that is
         * used to determine if the message should be output or
         * not. The filter is a comma-separated list of ids. If an id
         * is present, messages with that id will be output.  For
         * example, setting the filter to `"Rules,Controller"` will
         * enable calls to `Utils.TRACE("Rules",...)` and
         * `Utils.TRACE("Controller",...)`.
         *
         * The special trace group 'all' enables tracing for all ids.
         * When the special id `all` is given, other ids after it in
         * the list can be prefixed with a '-' to selectively disable
         * tracing for those ids.  For example, the trace filter
         * `"all,-DataModel"` will enable tracing for all ids except
         * `DataModel`.
         * @param {string} t comma-separated list of trace group ids.
         */
        static TRACEfilter(t) {
            Utils.traceFilter = t.split(",");
            console.log(`TRACE set to ${t}`);
        }

        /**
         * Determine if tracing is enabled for the given trace group id.
         * See {@link Utils.TRACEfilter} for more.
         * @param {string} id the trace group id
         * @return {boolean} true if the group is enabled
         */
        static TRACEing(module) {
            return typeof Utils.traceFilter !== "undefined" &&
                (Utils.traceFilter.indexOf(module) >= 0 ||
                    (Utils.traceFilter.indexOf("all") >= 0 &&
                        Utils.traceFilter.indexOf(`-${module}`) < 0));
        }

        /**
         * Produce a tagged log message. The first parameter is interpreted
         * as a tag and TRACEing is checked. Trace messages are written
         * using `console.log`, or to a file if {@link Utils.TRACEto} has been
         * called (node.js only). See {@link Utils.TRACEfilter} for more.
         * @param {string} traceid the id of the trace info
         */
        static TRACE() {
            var args = [].slice.call(arguments);
            const module = args.shift();
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
                        where, `${s}\n`, {
                            encoding: "utf8",
                            flag: "a+"
                        });
                };
            });
        }

        /**
         * eval() the code, generating meaningful syntax errors
         * (with line numbers). This is primarily intended for reading
         * 'loose' JSON (without quotes around keys) and must be
         * treated with suspicion as there is no protection against
         * eval'ing code.
         * @param {String} code the code to eval
         */
        static eval(code) {
            let compiled;
            eval(`compiled=${code}`);
            return compiled;
        }

        /**
         * Like setTimeout, but run at a given date rather than after
         * a delta. date can be a Date object or an epoch time in ms
         * @param {function} func the function to run (no arguments)
         * @param {Date|number} date may be a Date object or a time as epoch ms
         */
        static runAt(func, date) {
            const now = (new Date()).getTime();
            const then = (date instanceof Date) ? date.getTime() : date;
            const diff = Math.max((then - now), 0);
            if (diff > 0x7FFFFFFF) // setTimeout limit is MAX_INT32=(2^31-1)
                Utils.startTimer("runAt", () => Utils.runAt(func, date), 0x7FFFFFFF);
            else
                Utils.startTimer("runAt", func, diff);
        }

        /**
         * Start a tracked timer. Tracked timers are used to associate
         * `setTimeout` calls with the time they will fire. Tracked
         * timers recorded as a map from the timer id (returned by
         * this function) to a structure:
         * ```
         * {
         *  timer: (system id of timer),
         *  when: (epoch ms when the timer runs down)
         * }
         * ```
         * @param {String} descr description of the timer
         * @param {function} fn function to run (no parameters)
         * @param {number} timeout delta time to run the function
         * @return {string} a unique id that can be used to refer to the timer
         */
        static startTimer(descr, fn, timeout) {
            const id = `${descr}:${TIMER_ID++}`;
            Utils.TRACE(TAG, `Timer ${id} started`);
            TIMERS[id] = {
                timer: setTimeout(() => {
                    Utils.TRACE(TAG, `Timer ${id} fired`);
                    delete TIMERS[id];
                    fn();
                }, timeout),
                when: Date.now() + timeout
            };
            return id;
        }

        /**
         * Cancel a tracked timer.
         * See {@link Utils.startTimer} for more about tracked timers.
         * @param {string} id as returned by startTimer
         */
        static cancelTimer(id) {
            if (TIMERS[id]) {
				Utils.TRACE(TAG, `Timer ${id} cancelled`);
				clearTimeout(TIMERS[id].timer);
				delete TIMERS[id];
			} else
				Utils.TRACE(TAG, `Timer ${id} ALREADY CANCELLED`);
        }

        /**
         * Get the array of tracked timers
         * See {@link Utils.startTimer} for more about tracked timers.
         * @return {array} tracked timer objects
         */
        static getTimers() {
            return TIMERS;
        }
    }

    /**
     * Neutral interface to jQuery `extend` / `node-extend`
     * Extend one object with one or more others, returning the modified object.
     * @param {boolean} deep (optional) if set, merge becomes recursive
     * @param {object} target the object to extend (will be modified)
     * @param {object} object1 ...objectN, objects to merge
     * @return {object} the merged object
     * @function
     * @memberof Utils
     * @name extend
     */
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
