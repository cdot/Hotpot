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
Utils.expandEnvVars = function(data) {
    data = ("" + data).replace(/^~/, "$HOME");
    return data.replace(
            /(\$[A-Z]+)/g, function(match) {
                var v = match.substring(1);
                if (typeof process.env[v] !== "undefined")
                    return process.env[v];
                return match;
            });
};

/**
 * Add extend() to Utils namespace - See npm extend
 */
Utils.extend = function() {
    if (typeof $ !== "undefined")
        Utils.extend = $.extend;
    else
        Utils.extend = require("extend");
    return Utils.extend.apply(this, arguments);
}
    
/**
 * Debugging support for dumping a circular structure
 * @param {object} data thing to dump
 * @return {string} dump of data
 */
Utils.dump = function(data, cache) {
    "use strict";
    function indent(s) {
        return " " + s.replace(/\n/g, "\n ");
    }
    if (typeof cache == "undefined")
        cache = [];
    
    if (cache.indexOf(data) >= 0)
        return "LOOP";
    
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

    cache.push(data);
    s += ob;
    var values = [];
    for (var i in data) {
        var val = Utils.dump(data[i], cache);
        if (ob === "{")
            val = i + ": " + val;
        values.push(indent(val))
    }
    return s + "\n" + values.join(",\n") + "\n" + cb;
};

/**
 * Join arguments with no spaces
 */
Utils.joinArgs = function(args, start) {
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

Utils.report = function() {
    return Utils.joinArgs(arguments);
};

/**
 * Set the string that defines what tags are traced
 */
Utils.setTRACE = function(t) {
    Utils.trace = t;
};

/**
 * Produce a tagged log message, if the tag is included in the string
 * passed to Utils.setTRACE
 */
Utils.TRACE = function() {
    var level = arguments[0];
    if (typeof Utils.trace !== "undefined" &&
        (Utils.trace.indexOf("all") >= 0
         || Utils.trace.indexOf(level) >= 0)
        && (Utils.trace.indexOf("-" + level) < 0)) {
        Utils.LOG(new Date().toISOString(), " ", level, ": ",
                  Utils.joinArgs(arguments, 1));
    }
};

Utils.LOG = function() {
    console.log(Utils.joinArgs(arguments));
};

/**
 * Produce a tagged error message.
 */
Utils.ERROR = function() {
    var tag = arguments[0];
    console.error("*" + tag + "*", Utils.joinArgs(arguments, 1));
};

/**
 * Simulate ES6 forEach
 */
Utils.forEach = function(that, callback) {
    for (var i in that) {
        callback(that[i], i, that);
    }
};

/**
 * eval() the code, generating meaningful syntax errors (with line numbers)
 * @param {String} code the code to eval
 * @param {String} context the context of the code e.g. a file name
 */
Utils.eval = function(code, context) {
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
Utils.runAt = function(func, date) {
    var now = (new Date()).getTime();
    var then = typeof date === "object" ? date.getTime() : date;
    var diff = Math.max((then - now), 0);
    if (diff > 0x7FFFFFFF) // setTimeout limit is MAX_INT32=(2^31-1)
        setTimeout(function() {
            Utils.runAt(func, date);
        }, 0x7FFFFFFF);
    else
        setTimeout(func, diff);
};
