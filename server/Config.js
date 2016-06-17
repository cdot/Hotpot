/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
const Fs = require("fs");
const serialize = require("serialize-javascript");
const Utils = require("./Utils");

const TAG = "Config";

/**
 * Hierarchical configuration object
 * @param file_or_data either a string filename to load the config from, or
 * a structure to turn into a config block.
 * @class
 */
function Config(file) {
    "use strict";
    if (typeof file === "string") {
        this.file = file;
        var data = Fs.readFileSync(Utils.expandEnvVars(file), "utf8");
        var config;
        eval("config=" + data);
        console.TRACE(TAG, "Configured from " + file);
        this.data = config;
    } else if (typeof file === "object" )
        this.data = file;
    else if (typeof file === "undefined")
        this.data = {};
    else throw "WTF " + new Error().stack;
}
module.exports = Config;

/**
 * Save the configuration back
 * @param {String} file pathname of a file to write to. If undefined, will
 * use the file it was loaded from (if defined)
 */
Config.prototype.save = function(file) {
    "use strict";
    if (typeof file === "undefined")
        file = this.file;
    if (typeof file !== "string")
        throw "Cannot save this level of config; no file";
    Fs.writeFileSync(Utils.expandEnvVars(file), serialize(this.data, 2), "utf8");
    console.log(file + " updated");
};

/**
 * Determine if a there is a configuration for the given key.
 * @param {String} key name of the entry to get
 * @return {boolean} true if the key is present
 */
Config.prototype.has = function(key) {
    "use strict";
    return typeof this.data[key] !== "undefined";
};

/**
 * Get a configuration item or sub-block, but without converting it to a Config
 * @param {String} key name of the entry to get
 * @return the value of the key
 */
Config.prototype.get = function(key) {
    "use strict";
    return this.data[key];
};

/**
 * Get a sub-block.
 * @param {String} key name of the entry to get
 * @return {Config} the value of the key
 */
Config.prototype.getConfig = function(key) {
    "use strict";
    if (typeof this.data[key] !== "object")
        throw "Missing " + key + " in config";
    return new Config(this.data[key]);
};

/**
 * Get a configuration item or sub-block.
 * @param {String} key name of the entry to get
 * @param {object} or data item, value for the entry
 */
Config.prototype.set = function(key, data) {
    "use strict";
    this.data[key] = data;
};

/**
 * Call a function on each member.
 * @param {function} callback, signature(this=the key value, key=key name)
 */
Config.prototype.each = function(callback) {
    "use strict";
    for (var k in this.data) {
        callback.call(this.data[k], k);
    }
};
