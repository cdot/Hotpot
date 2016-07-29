/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const fs = require("fs");
const Utils = require("../common/Utils.js");

// We need this to be gloabl (outside the scope of the node module)
// so the module can't be strict
/** @ignore */
Time = require("../common/Time.js"); // for executing rules

/**
 * A rule governing when/if a function is to be turned on/off based on the
 * state of one or more thermostats.
 * @param {string} name name of the rule
 * @param {string} path pathname of a file that stores the test function
 * @param {function} fnction either a function or a string that will
 * compile to the test function.
 * The testfunction is called with 'this' set to the controller.
 * @protected
 * @class
 */
function Rule(name, fnction) {
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

    this.setTest(fnction);
}
module.exports = Rule;

/**
 * Construct a new rule from a function read from a file
 * @param {string} name name of the rule
 * @param {string} file pathname of the file
 * @return {Rule} the rule
 */
Rule.fromFile = function(name, file) {
    var text = fs.readFileSync(Utils.expandEnvVars(file));
    var r = new Rule(name, text);
    r.from_file = file;
    return r;
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
        fn = Utils.safeEval(fn);
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
        fs.writeFileSync(this.from_file, this.testfn.toString());
        data.from_file = this.from_file;
    } else
        data.test = this.testfn;

    return data;
};
