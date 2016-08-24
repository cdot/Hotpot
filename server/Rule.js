/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const TAG = "Rule";

// We need this to be gloabl (outside the scope of the node module)
// so the module can't be strict
/** @ignore */
Time = require("../common/Time.js"); // for executing rules
Utils = require("../common/Utils.js");

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
Rule.prototype.setTest = function(fn, source) {
    "use strict";

    if (typeof fn !== "function") {
        // Compile the function
        try {
            fn = Utils.eval(fn, source);
        } catch (e) {
            if (e instanceof SyntaxError)
                Utils.ERROR(TAG, "Syntax error in '" + this.name
                              + "': " + e.stack);
            else
                Utils.ERROR(TAG, "'" + this.name
                              + "' compilation failed: " + e.stack);
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

