/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
define("server/js/Rule", ["common/js/Utils", "common/js/Time", "common/js/DataModel"], function(Utils, Time, DataModel) {
    
    const TAG = "Rule";

    /**
     * A rule governing when/if a function is to be turned on/off based on the
     * state of one or more thermostats.
     * @class
     */
    class Rule {
        /**
         * @param {object} proto object that configures this object
         * @param {string} name name of the rule
         */
        constructor(proto, name) {

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

        /**
         * Promise to initialise a new rule.
         */
        initialise() {
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
    }

    Rule.Model = {
        $class: Rule,
        test: Utils.extend({}, DataModel.TextOrFile.Model, {
            $doc: "Rule function (Text or File)",
            $mode: "r"
        })
    };

    return Rule;
});
