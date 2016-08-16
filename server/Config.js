/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);
const writeFile = Q.denodeify(Fs.writeFile);
const serialize = require("serialize-javascript");

const Utils = require("../common/Utils");

const TAG = "Config";

/**
 * Hierarchical configuration object
 * @param file_or_data either a string filename to load the config from, or
 * a structure to turn into a config block.
 * @class
 * @protected
 */
function Config(file) {
    switch (typeof file) {
    case "string":
        this.file = file;
        break;
    case "object":
        this.data = file;
        break;
    case "undefined":
        this.data = {};
        break;
    default:
        throw "Invalid parameter " + (typeof file);
    }
}
module.exports = Config;

Config.prototype.load = function() {

    if (typeof this.data !== "undefined")
        return Q();

    var self = this;

    return readFile(Utils.expandEnvVars(this.file), "utf8")

    .then(function(data) {
        var config = Utils.safeEval(data);
        console.TRACE(TAG, "Configured from ", self.file);
        self.data = config;
    });
};

/**
 * Save the configuration back
 * @param {String} file pathname of a file to write to. If undefined, will
 * use the file it was loaded from (if defined)
* @return {Promise} a promise
 */
Config.prototype.save = function(file) {
    "use strict";
    if (typeof file === "undefined")
        file = this.file;

    if (typeof file !== "string")
        throw "Cannot save this config; no file";

    var self = this;

    return writeFile(Utils.expandEnvVars(file), this.toString(), "utf8")

    .then(function() {
        console.TRACE(TAG, self.file, " updated");
    })

    .catch(function(e) {
        console.ERROR(TAG, "Config save failed: " + e.stack);
    });
};

Config.prototype.toString = function() {
    "use strict";
    return serialize(this.data, 2);
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
 * Get a configuration item or sub-block, but without wrapping it in a Config
 * @param {String} key name of the entry to get
 * @return {object} the value of the key
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
 * @param {object} data data item, value for the entry
 */
Config.prototype.set = function(key, data) {
    "use strict";
    this.data[key] = data;
};

/**
 * Call a function on each member.
 * @param {function} callback callback function, (this=the key value, key=key name)
 */
Config.prototype.each = function(callback) {
    "use strict";
    for (var k in this.data) {
        callback.call(this.data[k], k);
    }
};
