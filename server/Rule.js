/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * A rule governing when/if a function is to be turned on/off based on the
 * state of one or more thermostats.
 */

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
    if (typeof fn === "string") {
        // Compile the fn function
        try {
            eval("fn=" + fn);
        } catch (e) {
            throw "Bad fn function: " + fn
                + ": " + e.message;
        }
        fn = eval(fn);
    }
    this.index = -1;
    this.name = name;
    this.testfn = fn;
}
module.exports = Rule;

/**
 * Get a serialisable version of the rule
 * @return {object} a serialisable structure
 */
Rule.prototype.getConfig = function() {
    "use strict";
    return {
        name: this.name,
        test: this.testfn
    };
};

/**
 * Call the test function for this rule for the given thermostat and
 * current temperature. Will return true if the rule passes for the
 * given temperature, and false otherwise.
 * @param {Thermostat} thermostat the thermostat that owns the rule
 * @param {Controller} controller the controller
 */
Rule.prototype.test = function(thermostat, controller) {
    "use strict";
    var pass = this.testfn.call(thermostat, controller);
    //console.TRACE("rule", "Test rule '"+ rule.name + "' = " + pass);
    return pass;
};
