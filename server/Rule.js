/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);

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
     * Tets function
     * @type {function}
     * @public
     */
    this.testfn = null;

    //this.from_file = undefined;
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

    return readFile(Utils.expandEnvVars(file), "UTF8")

    .then(function(text) {
        console.TRACE(TAG, "'", self.name, "' loaded from ", self.from_file);
        return self.setTest(text);
    });
};

/**
 * Set the test function for this rule
 * @param {function} fn the function (may be a string)
 * @protected
 */
Rule.prototype.setTest = function(fn) {
    "use strict";
    if (typeof fn !== "function") {
        // Compile the function
        try {
            var rule_function;
            fn = eval("rule_function=" + fn);
        } catch (e) {
            if (e instanceof SyntaxError)
                console.error("Syntax error in rule '" + this.name
                              + "': " + e.message);
            else
                console.error("Rule '" + this.name
                              + "' compilation failed: " + e.message);
        }
    }
    this.testfn = fn;
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
        name: this.name
    };
    if (typeof this.from_file !== "undefined") {
        // TODO: this is a hack. It assumes we are going to serialise the
        // config to file.
        Fs.writeFile(this.from_file, this.testfn.toString());
        data.from_file = this.from_file;
    } else
        data.test = this.testfn;

    return data;
};
