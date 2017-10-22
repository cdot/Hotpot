/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const TAG = "Rule";

const Config = require("../common/Config");

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
function Rule(name, config) {
    "use strict";

    this.index = undefined;
    /**
     * Name of the rule
     * @type {string}
     * @public
     */
    this.name = name;

    /**
     * Configuration data
     */
    this.config = Config.check("Rule " + name, config, name, Rule.prototype.Config);
    
    /**
     * Test function
     * @type {function}
     * @public
     */
    this.testfn = undefined;
}
module.exports = Rule;

Rule.prototype.Config = {
    test_file: {
        $doc: "File to read the rule function from",
        $type: "string",
        $file: "r"
    }
};

/**
 * Promise to initialise a new rule, possibly reading rule function
 * from external file.
 */
Rule.prototype.initialise = function() {
    var self = this;

    return Config.fileableConfig(self.config, "test")
    .then(function(fn) {
        self.setTest(fn, self.config.test_file);
        Utils.TRACE(TAG, self.name, " initialised");
    });
};

/**
 * Set the test function for this rule
 * @param {function} fn the function (may be a string)
 * @private
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

