/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const TAG = "Rule";

const DataModel = require("../common/DataModel");

// We need this to be gloabl (outside the scope of the node module)
// so the module can't be strict
/** @ignore */
Time = require("../common/Time.js"); // for executing rules
Utils = require("../common/Utils.js");

/**
 * A rule governing when/if a function is to be turned on/off based on the
 * state of one or more thermostats.
 * @param {object} proto object that configures this object
 * @param {string} name name of the rule
 * @class
 */
function Rule(proto, name) {
    "use strict";

    /**
     * Name of the rule
     * @type {string}
     * @public
     */
    this.name = name;

    /**
     * Test function. () where `this` is the Controller, 
     * @type {function}
     * @public
     */
    this.test = undefined;

    Utils.extend(this, proto);
}
module.exports = Rule;

Rule.Model = {
    $class: Rule,
    test: Utils.extend({}, DataModel.TextOrFile.Model, {
        $doc: "Rule function (Text or File)",
        $mode: "r"
    })
};

/**
 * Promise to initialise a new rule.
 */
Rule.prototype.initialise = function () {
    var self = this;

    return this.test.read()
        .then(function (fn) {
            if (typeof fn !== "function") {
                // Compile the function
                try {
                    fn = Utils.eval(fn);
                } catch (e) {
                    if (e instanceof SyntaxError)
                        Utils.ERROR(TAG, "Syntax error in '" + self.name +
                            "': " + e.stack);
                    else
                        Utils.ERROR(TAG, "'" + self.name +
                            "' compilation failed: " + e.stack);
                }
                if (typeof self.testfn !== "undefined" &&
                    self.testfn === fn) {
                    Utils.TRACE(TAG, self.name, " unchanged");
                    return;
                }
            }
            self.testfn = fn;
            Utils.TRACE(TAG, self.name, " initialised");
        });
};