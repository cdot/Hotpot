/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Useful utilities
 * @namespace
 */
var Utils = {
    trace: ""
};

if (typeof module !== "undefined")
    module.exports = Utils;

/**
 * Expand environment variables in the data string
 * @param {String} data string containing env var references
 * @return {String} data string with env vars expanded
 */
Utils.expandEnvVars = function(data) {
    if (typeof data !== "string") {
        throw "Cannot expand " + (typeof data);
    }
    data = data.replace(/^~/, "$HOME");
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
 * Join arguments with no spaces
 */
Utils.joinArgs = function(args, start) {
    var mess = "";
    if (typeof start === "undefined")
        start = 0;
    for (var i = start; i < args.length; i++) {
        if (typeof args[i] === "object"
            && args[i] !== null
            && (args[i].toString === Object.prototype.toString
                || args[i].toString === Array.prototype.toString))
            mess += Utils.dump(args[i]);
        else if (typeof args[i] === "function") {
            mess += new args[i](args[i + 1]);
            i += 1;
        } else
            mess += args[i];
    }
    return mess;
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
        if (typeof context === "undefined")
            context = "eval";
        m._compile("module.exports=\n" + code + "\n;", context);
        return m.exports;
    }
};
