/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * A rule governing when/if a function is to be turned on/off based on the
 * state of one or more thermostats.
 */

const TAG = "Rule";

// This can't be "var" or "const" because rules can't see it then
Time = require("./Time.js"); // for executing rules

/**
 * Constructor
 * @param {string} name name of the rule
 * @param {function} fn either a function or a string that will compile to a function.
 * The function is called with this set to a thermostat, and is passed the
 * current temperature, and will return true if the rule passes for that
 * temperature, and false otherwise.
 * @class
 */
function Rule(name, fn) {
    "use strict";
    this.index = -1;
    this.name = name;
    this.setTest(fn);
}
module.exports = Rule;

/**
 * Set the test function for this rule
 * @param {string or function} fn the function
 */
Rule.prototype.setTest = function(fn) {
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
 */
Rule.prototype.getSerialisableConfig = function() {
    "use strict";
    return {
        name: this.name,
        test: this.testfn
    };
};

