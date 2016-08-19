/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);
const writeFile = Q.denodeify(Fs.writeFile);

const Utils = require("../common/Utils.js");

const Config = require("./Config.js");

const TAG = "Rule";

// We need this to be gloabl (outside the scope of the node module)
// so the module can't be strict
/** @ignore */
Time = require("../common/Time.js"); // for executing rules

/**
 * A rule governing when/if a function is to be turned on/off based on the
 * state of one or more thermostats.
 * @param {string} name name of the rule
 * @protected
 * @class
 */
function Rule(name) {
    "use strict";

    this.index = undefined;
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
}
module.exports = Rule;

/**
 * Set the test function for this rule
 * @param {function} fn the function (may be a string)
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
                Utils.ERROR(TAG, "Syntax error in '" + this.name
                              + "': " + e);
            else
                Utils.ERROR(TAG, "'" + this.name
                              + "' compilation failed: " + e);
            if (typeof e.stack !== "undefined")
                Utils.TRACE(TAG, e.stack);
        }
        if (typeof this.testfn !== "undefined"
            && this.testfn.toString() === fn.toString()) {
            Utils.TRACE(TAG, this.name, " unchanged");
            return;
        }
    }
    this.testfn = fn;
};

Rule.prototype.getConfiguration = function() {
    return {
        name: this.name,
        test: this.testfn.toString()
    };
};

/**
 * Update the config block with the current definition of this rule
 */
Rule.prototype.updateConfiguration = function(config) {
    config.name = this.name;
    Utils.updateFileableConfig(config, "test", this.testfn.toString());
};
