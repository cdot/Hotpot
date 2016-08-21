/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);
const writeFile = Q.denodeify(Fs.writeFile);
const serialize = require("serialize-javascript");

const Utils = require("../common/Utils.js");

const TAG = "Config";

var Config = {
    /**
     * Return a promise to load the configuration
     * @return {Promise} promise that returns the loaded configuration
     */
    load: function(file) {
        return readFile(file)
        .then(function(code) {
            return Utils.eval(code, file);
        });
    },

    /**
     * Save the configuration back
     */
    save: function(config, file) {
        "use strict";

        writeFile(Utils.expandEnvVars(file),
                  serialize(config, 2), "utf8")

            .catch(function(e) {
                Utils.ERROR(TAG, "ConfigurationManager save failed: ", e.stack);
            })

                .done(function() {
                    Utils.TRACE(TAG, file, " updated");
                });
    },

    /**
     * Given a config block and a key, if the key is defined return a promise
     * to get its value. If it's not defined, but key_file is defined, then
     * return a promise to read that file (as text). Otherwise return null.
     */
    fileableConfig: function(config, key) {
        if (typeof config[key] !== "undefined")
            return Q.fcall(function() { return config[key]; });
        else if (typeof config[key + "_file"] !== "undefined")
            return readFile(Utils.expandEnvVars(config[key + "_file"]));
        else
            return Q.fcall(function() { return undefined; });
    },

    /**
     * Given a config block and a key name, update the stored data with
     * the value passed.
     */
    updateFileableConfig: function(config, key, value) {
        if (typeof config[key + "_file"] !== "undefined")
            writeFile(Utils.expandEnvVars(config[key + "_file"]),
                      value, "utf8")
        
            .done(function() {
                Utils.TRACE(TAG, "Updated ", key, "_file");
            });
        else
            config[key] = value;
    },

    /**
     * Process an immutable config structure and generate a version
     * suitable for transmission via Ajax.
     */
    getSerialisable: function(config) {

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
    }
};
module.exports = Config;


