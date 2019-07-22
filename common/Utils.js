/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Useful utilities
 * @namespace
 */
var Utils = {
    trace: ""
};

module.exports = Utils;

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

/**
 * Expand environment variables in the data string
 * @param {String} data string containing env var references
 * @return {String} data string with env vars expanded
 */
Utils.expandEnvVars = function (data) {
    var rep = function(match, v) {
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
 * Add extend() to Utils namespace - See npm extend
 */
Utils.extend = function () {
    if (typeof jQuery !== "undefined")
        Utils.extend = jQuery.extend;
    else
        Utils.extend = require("extend");
    return Utils.extend.apply(this, arguments);
}

/**
 * Debugging support for dumping a circular structure
 * @param {object} data thing to dump
 * @return {string} dump of data
 */
Utils.dump = function (data, cache) {
    "use strict";

    function indent(s) {
        return " " + s.replace(/\n/g, "\n ");
    }
    if (typeof cache == "undefined")
        cache = [];

    if (cache.indexOf(data) >= 0)
        return "LOOP";
    cache.push(data);

    if (typeof data === "function")
        return "<" + data.name + ">";

    if (typeof data === "string")
        return '"' + data + '"';

    if (typeof data !== "object" || data === null)
        return data;

    var s = "";
    var ob = "{";
    var cb = "}";

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
            return "<" + data.constructor.name + ">" + data;
        } else if (data.constructor.name !== "Object") {
            s += "<" + data.constructor.name + ">";
        }
    }
    if (data.toString !== Object.prototype.toString &&
        data.toString !== Array.prototype.toString) {
        s += data.toString();
    } else {
        s += ob;
        var values = [];
        for (var i in data) {
            var val = Utils.dump(data[i], cache);
            if (ob === "{")
                val = i + ": " + val;
            values.push(indent("" + val))
        }
        s += "\n" + values.join(",\n") + "\n" + cb;
    }
    return s;
};

/**
 * Join arguments with no spaces to create a message, expanding objects
 * using Utils.dump()
 * @param args arguments vector
 * @param start optional point in args to start constructing the message.
 * Without this the whole args vector will be used.
 * @return string dump of the arguments from args[start]
 */
Utils.joinArgs = function (args, start) {
    var mess = "";
    if (typeof start === "undefined")
        start = 0;
    for (var i = start; i < args.length; i++) {
        if (typeof args[i] === "object" && args[i] !== null) {
            mess += Utils.dump(args[i]);
        } else {
            mess += args[i];
        }
    }
    return mess;
};

/**
 * Construct a slightly customised exception object
 * @param name Exception type name
 * @param args remaining args will be
 * @return an Erro object
 */
Utils.exception = function () {
    var e = new Error(Utils.joinArgs(arguments, 1));
    e.name = arguments[0];
    return e;
};

/**
 * Set the string that defines what tags are traced
 */
Utils.setTRACE = function (t) {
    Utils.trace = t;
};

/**
 * Produce a tagged log message, if the tag is included in the string
 * passed to Utils.setTRACE
 */
Utils.TRACE = function () {
    var level = arguments[0];
    if (typeof Utils.trace !== "undefined" &&
        (Utils.trace.indexOf("all") >= 0 ||
            Utils.trace.indexOf(level) >= 0) &&
        (Utils.trace.indexOf("-" + level) < 0)) {
        Utils.LOG(new Date().toISOString(), " ", level, ": ",
            Utils.joinArgs(arguments, 1));
    }
};

Utils.LOG = function () {
    console.log(Utils.joinArgs(arguments));
};

/**
 * Produce a tagged error message.
 */
Utils.ERROR = function () {
    console.error(Utils.joinArgs("*", arguments[0], "*", Utils.joinArgs(arguments, 1)));
};

/**
 * Call a function on each property of an object (but not on inherited
 * properties)
 */
Utils.each = function(object, callback) {
    if (typeof jQuery !== "undefined")
        Utils.each = jQuery.each;
    else
        Utils.each = function(object, callback) {
            for (var key in object) {
                if (object.hasOwnProperty(key))
                    callback(object[key], key);
            }
        }
    return Utils.each(object, callback);
}

/**
 * eval() the code, generating meaningful syntax errors (with line numbers)
 * @param {String} code the code to eval
 * @param {String} context the context of the code e.g. a file name
 */
Utils.eval = function (code, context) {
    if (typeof context === "undefined")
        context = "eval";
    if (context === "browser") {
        var compiled;
        eval("compiled=" + code);
        return compiled;
    } else {
        var Module = require("module");
        var m = new Module();
        m._compile("module.exports=\n" + code + "\n;", context);
        return m.exports;
    }
};

/**
 * Like setTimeout, but run at a given date rather than after
 * a delta. date can be a Date object or a time in ms
 */
Utils.runAt = function (func, date) {
    var now = (new Date()).getTime();
    var then = typeof date === "object" ? date.getTime() : date;
    var diff = Math.max((then - now), 0);
    if (diff > 0x7FFFFFFF) // setTimeout limit is MAX_INT32=(2^31-1)
        setTimeout(function () {
            Utils.runAt(func, date);
        }, 0x7FFFFFFF);
    else
        setTimeout(func, diff);
};
