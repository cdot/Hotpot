/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);
const writeFile = Q.denodeify(Fs.writeFile);

const Utils = require("../common/Utils.js");

const TAG = "Rule";

// We need this to be gloabl (outside the scope of the node module)
// so the module can't be strict
/** @ignore */
Time = require("../common/Time.js"); // for executing rules

/**
 * A rule governing when/if a function is to be turned on/off based on the
 * state of one or more thermostats.
 * @param {string} name name of the rule
 * @param {string} path pathname of a file that stores the test function
 * @protected
 * @class
 */
function Rule(name) {
    "use strict";

    this.index = -1;
    /**
     * Name of the rule
     * @type {string}
     * @public
     */
    this.name = name;
    /**
     * Test function
     * @type {function}
     * @public
     */
    this.testfn = undefined;

    /**
     * Source of the rule
     */
    this.from_file = undefined;

    // private
    this.write_block = 0;
}
module.exports = Rule;

/**
 * Construct a new rule from a function read from a file
 * @param {string} name name of the rule
 * @param {string} file pathname of the file
 * @return {Promise} a promise
 */
Rule.prototype.fromFile = function(file) {
    var self = this;

    self.from_file = file;

    return readFile(Utils.expandEnvVars(file), "utf8")

    .then(function(text) {
        Utils.TRACE(TAG, "'", self.name, "' loaded from ", self.from_file);
        self.write_block++; // prevent race
        return self.setTest(text)

        .finally(function() {
            self.write_block--;
        });
    });
};

/**
 * Set the test function for this rule
 * @param {function} fn the function (may be a string)
 * @return {Promise} a promise
 * @protected
 */
Rule.prototype.setTest = function(fn) {
    "use strict";

    var promise = Q();

    if (typeof fn !== "function") {
        // Compile the function
        try {
            var rule_function;
            fn = eval("rule_function=" + fn);
        } catch (e) {
            if (e instanceof SyntaxError)
                console.ERROR(TAG, "Syntax error in '" + this.name
                              + "': " + e);
            else
                console.ERROR(TAG, "'" + this.name
                              + "' compilation failed: " + e);
            if (typeof e.stack !== "undefined")
                Utils.TRACE(TAG, e.stack);
        }
        if (typeof this.testfn !== "undefined"
            && this.testfn.toString() === fn.toString()) {
            Utils.TRACE(TAG, this.name, " unchanged");
            return promise; // Unchanged, nothing to be done
        }
    }
    this.testfn = fn;

    if (typeof this.from_file === "undefined"
        || this.write_block > 0)
        return promise;

    var self = this;

    self.write_block++;
    return writeFile(Utils.expandEnvVars(this.from_file),
                     this.testfn.toString())

    .then(function() {
        Utils.TRACE(TAG, "Wrote '", this.from_file, "'");
    })

    .catch(function(e) {
        console.ERROR(TAG, "Write ", this.from_file, " failed: " + e);
    })

    .finally(function() {
        self.write_block--;
    });
};

/**
 * Get a serialisable version of the rule
 * @return {object} a serialisable structure
 * @protected
 */
Rule.prototype.getAjaxableConfig = function() {
    "use strict";
};

/**
 * Get a serialisable version of the rule
 * @param {boolean} ajax true if config will be sent using ajax
 * @return {object} a serialisable structure
 * @protected
 */
Rule.prototype.getSerialisableConfig = function(ajax) {
    "use strict";
    if (ajax)
        return {
            name: this.name,
            test: this.testfn
        };

    var data = {
        name: this.name,
        from_file: this.from_file
    };
    if (ajax)
        data.test = this.testfn;

    return data;
};
