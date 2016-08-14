/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * @module Utils
 */

/**
 * Useful utilities
 * @ignore
 */
var Utils = {};

if (typeof module !== "undefined")
    module.exports = Utils;

/**
 * Expand environment variables in the data string
 * @param {String} data string containing env var references
 * @return {String} data string with env vars expanded
 */
Utils.expandEnvVars = function(data) {
    if (typeof data !== "string")
        throw "Cannot expand " + data;
    return data.replace(
            /(\$[A-Z]+)/g, function(match) {
                var v = match.substring(1);
                if (typeof process.env[v] !== "undefined")
                    return process.env[v];
                return match;
            });
};

/**
 * Debugging support for dumping a circular structure
 * @param {object} data thing to dump
 * @return {string} dump of data
 */
Utils.dump = function(data) {
    "use strict";
    var cache = [];
    return JSON.stringify(data, function(key, value) {
        if (typeof value === "object" && value !== null) {
            if (cache.indexOf(value) !== -1) {
                // Circular reference found, discard key
                return "circular";
            }
            // Store value in our collection
            cache.push(value);
        }
        return value;
    }, 2);
};

/**
 * Return the length of a string encoded as UTF8 in bytes. Useful for
 * canculating content-length.
 * @param {string} str string to measure
 */
Utils.byteLength = function(str) {
    "use strict";
    // returns the byte length of an utf8 string
    var s = str.length;
    for (var i = str.length - 1; i >= 0; i--) {
        var code = str.charCodeAt(i);
        if (code > 0x7f && code <= 0x7ff)
            s++;
        else if (code > 0x7ff && code <= 0xffff)
            s += 2;
        if (code >= 0xDC00 && code <= 0xDFFF)
            i--; // trail surrogate
    }
    return s;
};

Utils.safeEval = function(str) {
    var safeEval_data;
    try {
        eval("safeEval_data=" + str);
        return safeEval_data;
    } catch (e) {
        var mess = "Bad function in safeEval: " + e.message;
        console.TRACE("Utils", mess, " ", e.stack);
        throw mess;
    }
};

Utils.joinArgs = function(args, start) {
    var mess = "";
    if (typeof start === "undefined")
        start = 0;
    for (var i = start; i < args.length; i++) {
        if (typeof args[i] === "object"
            && (args[i].toString === Object.prototype.toString
                || args[i].toString === Array.prototype.toString))
            mess += Utils.dump(args[i]);
        else
            mess += args[i];
    }
    return mess;
};
