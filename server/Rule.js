/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

// We need this to be gloabl (outside the scope of the node module)
// so the module can't be strict
/** @ignore */
Time = require("../common/Time.js"); // for executing rules

const TAG = "Rule";

/**
 * A rule governing when/if a function is to be turned on/off based on the
 * state of one or more thermostats.
 * @param {string} name name of the rule
 * @param {function} fn either a function or a string that will compile to a function.
 * The function is called with this set to a thermostat, and is passed the
 * current temperature, and will return true if the rule passes for that
 * temperature, and false otherwise.
 * @protected
 * @class
 */
function Rule(name, fn) {
    "use strict";
    this.index = -1;
    /**
     * Name of the rule
     * @type {string}
     * @public
     */
    this.name = name;
    /**
     * Tets function
     * @type {function}
     * @public
     */
    this.testfn = null;

    this.setTest(fn);
}
module.exports = Rule;

/**
 * Set the test function for this rule
 * @param {function} fn the function (may be a string)
 * @protected
 */
Rule.prototype.setTest = function(fn) {
    "use strict";
    if (typeof fn === "string") {
        // Compile the function
        try {
            eval("fn=" + fn);
        } catch (e) {
            throw "Bad fn function: " + fn
                + ": " + e.message;
        }
        fn = eval(fn);
    }
    this.testfn = fn;
};

/**
 * Get a serialisable version of the rule
 * @return {object} a serialisable structure
 * @protected
 */
Rule.prototype.getSerialisableConfig = function() {
    "use strict";
    return {
        name: this.name,
        test: this.testfn
    };
};
