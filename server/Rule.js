/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Rule
 *
 * A rule governing when/if a function is to be turned on/off based on the
 * state of one or more thermostats.
 */
const Time = require("./Time.js"); // for executing rules

/**
 * Constructor
 * @param name name of the rule
 * @param fn either a function or a string that will compile to a function.
 * The function is called with this set to a thermostat, and is passed the
 * current temperature, and will return true if the rule passes for that
 * temperature, and false otherwise.
 */
function Rule(name, fn, expiry) {
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
    this.test = fn;
    if (typeof expiry !== "undefined")
        this.expiry = expiry;
}
module.exports = Rule;

Rule.prototype.serialisable = function() {
    "use strict";
    return {
        name: this.name,
        test: this.test,
        expiry: this.expiry
    };
};

/**
 * Call the test function for this rule for the given thermostat and
 * current temperature. Will return true if the rule passes for the
 * given temperature, and false otherwise.
 * @param thermostat a Thermostat object
 * @param temp the current temperature
 */
Rule.prototype.test = function(thermostat, temp) {
    "use strict";
    var pass = this.test.call(thermostat, temp);
    //console.TRACE("rule", "Test rule '"+ rule.name + "' = " + pass);
    return pass;
};

/**
 * Check if the rule has an expiry date and if so, whether it has
 * expired.
 */
Rule.prototype.hasExpired = function() {
    "use strict";
    return (typeof this.expiry !== "undefined"
           && (new Date()).valueOf() > this.expiry.valueOf())
}

