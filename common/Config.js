/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);
const writeFile = Q.denodeify(Fs.writeFile);
const serialize = require("serialize-javascript");

const Utils = require("../common/Utils.js");

const TAG = "Config";

/**
 * Functions involved in managing configuration data
 * @namespace
 */
var Config = {
    // Module specs; populated by modules
    Specs: {}
};

/**
 * Return a promise to load the configuration
 * @return {Promise} promise that returns the loaded configuration
 * @public
 */
Config.load = function(file) {
    return readFile(file)
    .then(function(code) {
        return Utils.eval(code, file);
    });
};

/**
 * Return a promise to save the configuration to a file
 */
Config.save = function(config, file) {
    "use strict";

    return writeFile(Utils.expandEnvVars(file),
              serialize(config, 2), "utf8")

    .catch(function(e) {
        Utils.ERROR(TAG, "ConfigurationManager save failed: ", e.stack);
    });
};

/**
 * Given a config block and a key, if the key is defined return a promise
 * to get its value. If it's not defined, but key_file is defined, then
 * return a promise to read that file (as text). Otherwise return null.
 */
Config.fileableConfig = function(config, key) {
    if (typeof config[key] !== "undefined")
        return Q.fcall(function() { return config[key]; });
    else if (typeof config[key + "_file"] !== "undefined")
        return readFile(Utils.expandEnvVars(config[key + "_file"]));
    else
        return Q.fcall(function() { return undefined; });
};

/**
 * Given a config block and a key name, return a promise to update the
 * stored data with the value passed.
 * @param {Config} a config block containing [key]
 * @param {String} key the key we are changing
 * @param {String} the value to set
 * @return {Promise} a promise that takes a config_changed parameter that says
 * if the config block was modified. This will be false if the change was handled
 * be storing as an external file.
 */
Config.updateFileableConfig = function(config, key, value) {
    if (typeof config[key + "_file"] !== "undefined")
       return writeFile(Utils.expandEnvVars(config[key + "_file"]),
                        value, "utf8")
        .then(function() {
            Utils.TRACE(TAG, "Updated ", key, "_file");
            return Q(false);
        });
    else {
        config[key] = value;
        return Q(true);
    }
};

/**
 * Process an immutable config structure and generate a version
 * suitable for transmission via Ajax.
 */
Config.getSerialisable = function(config) {

    var res = (config.toString === Array.prototype.toString)
        ? [] : {};

    var promises = Q();

    function addSerialPromise(cfg, key) {
        promises = promises.then(function() {
            return Config.getSerialisable(cfg);
        })
        .then(function(c) {
            res[key] = c;
        });
    }

    function addFilePromise(cfg, key) {
        promises = promises.then(function() {
            return readFile(Utils.expandEnvVars(cfg[key + "_file"]));
        })
        .then(function(val) {
            res[key] = val.toString();
        });
    }

    Utils.forEach(config, function(field, key) {
        if (typeof field === "object")
            addSerialPromise(field, key);
        else {
            var match = /(.*)_file$/.exec(key);
            if (match)
                // If the name of the field in the config ends in "_file"
                // then read the associated file and create the field
                // (string) value
                addFilePromise(config, match[1]);
            else
                res[key] = field;
        }
    });

    return promises.then(function() {
        return res;
    });
};

/**
 * Perform guided checks on a config structure.
 * The spec is a data structure that mirrors the actual config structure
 * and contains directives to support validation.
 * Each level in the structure defines a single level in the config.
 * Keywords, starting with $, are used to control the check. Names that don't
 * start with $ are field names that are expected to be found in the config.
 *
 * For example, given a config for defining a thermostat, which is characterised
 * by an ID, we might have in the config:
 *
 * CH: {
 *   id: "28-0316027f81ff",
 * }
 *
 * this can be checked against the following spec:
 *
 * {
 *   id: {
 *     $type: "string",
 *     $doc: "unique ID used to communicate with this thermostat"
 * }
 *
 * The keywords in the spec define the type of the datum ($type)
 * and a block of documentation ($doc).
 * Keywords exist to modify the spec:
 *   $type - type of the datum (as returned by typeof, defaults to "object")
 *   $doc - a documentation string for the datum
 *   $optional - this datum is optional
 *   $skip - skip deeper checking of this item
 *   $array_of - object is an array of elements, each of which has
 *   this spec.
 * For example,
 *
 *   thermostat: {
 *     $doc: "Set of Thermostats",
 *     $array_of: {
 *       id: {
 *         $type: "string",
 *         $optional: true,
 *         $doc: "Optional ID used to communicate with this thermostat"
 *     }
 *   }
 * @param {string} context The context of the check, used in messages only
 * @param {object} config The config under inspection
 * @param {index} The index of the structure in the parent object. This
 * will be a number for an array entry, or a key for a hash.
 * @param {object} spec A specification that drives the check of the config.
 */
Config.check = function(context, config, index, spec) {
    var i;
    
    if (typeof config === "undefined") {
        if (spec.$optional)
            return;
        throw "Bad config: " + context + " not optional at "
            + Utils.dump(config);
    }
    
    if (spec.$type && typeof config !== spec.$type) {
        throw "Bad config: " + context + " wanted " + spec.$type + " for "
            + index + " but got " + Utils.dump(config);
    }
    
    if (!spec.$type && typeof config !== "object") {
        throw "Bad config: " + context + " expected object at "
            + Utils.dump(config);
    }

    if (spec.$skip)
        return;
    
    if (!spec.$type || spec.$type === "object") {
        if (typeof spec.$array_of !== "undefined") {
            for (var i in config) {
                Config.check(context + "[" + i + "]",
                             config[i], i, spec.$array_of);
            }
        } else {
            for (var i in config) {
                if (!spec[i])
                    throw "Bad config: " + context + " unexpected field '"
                    + i + "' at "
                    + Utils.dump(config)
                    + "\n" + Utils.dump(spec);
            }
            for (var i in spec) {
                if (i.charAt(0) !== '$') {
                    Config.check(context + "." + i, config[i], i, spec[i]);
                }
            }
        }
    } else if (spec.$type === "string" && typeof spec.$file !== "undefined") {
        var mode = Fs.constants.F_OK;
        if (spec.$file.indexOf("r") >= 0)
            mode = mode | Fs.constants.R_OK;
        if (spec.$file.indexOf("w") >= 0)
            mode = mode | Fs.constants.W_OK;
        if (spec.$file.indexOf("x") >= 0)
            mode = mode | Fs.constants.X_OK;
        Fs.access(
            Utils.expandEnvVars(config), mode,
            function(err) {
                if (err)
                    throw "Bad config: " + context + " " + config
                    + spec.$file + " check failed: "
                    + err;
            });
    }
};

Config.help = function(spec, index, preamble) {
    if (typeof preamble === "undefined")
        preamble = "";
    
    var help = "\n" + preamble
        + (index ? index + ": " : "" );
    var ds = (spec.$doc ? "// "
              + (spec.$type ? spec.$type + ", " : "")
              + spec.$doc : "");
    
    if (!spec.$type || spec.$type === "object") {
        if (typeof spec.$array_of !== "undefined") {
            help += "[ " + ds;
            help += Config.help(spec.$array_of, undefined, preamble + " ");
            help += "\n" + preamble + "]";
        } else {
            help += "{ " + ds;
            for (var i in spec) {
                if (i.charAt(0) !== '$') {
                    help += Config.help(spec[i], i, preamble + " ");
                }
            }
            help += "\n" + preamble + "}";
        }
    } else
        help += ds;
     
    return help;
}

module.exports = Config;


