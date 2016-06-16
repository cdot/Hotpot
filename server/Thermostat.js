/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Talks to DS18x20 thermometers and raises events when the measured
 * temperature passes into or out of a target window.
 *
 * Two events are supported, "above" when the temperature increases
 * above the window, and below, when the temperature drops below the window.
 * Also supports measuring the immediate temperature of the thermometer,
 * independent of the event loop.
 *
 * A thermostat also has a list of rules functions that are run in
 * order to adjust the target settings at each poll. The rules functions
 * are numbered and are run starting at 0. If a rules function returns
 * true, the evaluation of rules stops.
 */
const Rule = require("./Rule.js");

// Thermostat poll
const POLL_INTERVAL = 1; // seconds

// Singleton interface to DS18x20 thermometers
var ds18x20;

// Known unlikely temperature value
const K0 = -273.25; // 0K

/**
 * Construct a thermostat
 * @param name {String} name by which the caller identifies the thermostat
 * @param {Controller} controller Controller this thermostat is part of
 * @param config configuration for the pin, a Config object
 * @class
 */
function Thermostat(name, controller, config) {
    "use strict";

    if (!ds18x20) {
        ds18x20 = require("ds18x20");
        if (!ds18x20.isDriverLoaded()) {
            try {
                ds18x20.loadDriver();
            } catch (err) {
                console.error(err.message);
                console.error("Temperature sensor driver not loaded - falling back to test sensor");
                ds18x20 = require("./TestSupport.js");
            }
        }
    }

    var self = this;
    self.name = name;
    self.id = config.get("id"); // DS18x20 device ID
    self.target = 15;    // target temperature
    self.window = 4;     // slack window
    self.rule = [];     // activation rules, array of Rule
    self.active_rule = "none"; // the currently active rule
    self.live = true; // True until destroyed
    
    if (config.has("target"))
        self.set("target", config.get("target"));
    if (config.has("window"))
        self.set("window", config.get("window"));

    self.last_temp = K0; // Temperature measured in last poll

    if (typeof ds18x20.mapID !== "undefined")
        ds18x20.mapID(config.get("id"), name);

    if (config.has("rule")) {
        var rules = config.getConfig("rule");
        self.clear_rules();
        rules.each(function() {
            self.insert_rule(new Rule(this.name, this.test));
        });
    }

    // Don't start polling until after a timeout even because otherwise
    // the event emitter won't work
    setTimeout(function() {
        console.TRACE("thermostat", self.name + " "
                      + self.low() + " < T < " + self.high() + " started");
        self.poll(controller);
    }, 10);
}
module.exports = Thermostat;

/**
 * Release all resources used by the object
 */
Thermostat.prototype.DESTROY = function() {
    "use strict";
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 */
Thermostat.prototype.getConfig = function() {
    "use strict";

    return {
        id: this.id,
        target: this.target,
        window: this.window,
        rule: this.rule.map(function(rule) {
            return rule.getConfig();
        })
    };
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 */
Thermostat.prototype.getState = function() {
    "use strict";
    return {
        temperature: this.temperature(),
        last_temp: this.last_temp,
	active_rule: this.active_rule
    };
};

/**
 * Set a field.
 * @param {string} field field to set
 * @param {float} value value to set it to
 */
Thermostat.prototype.set = function(field, value) {
    "use strict";
    if (value !== this[field])
        console.TRACE("thermostat", this.name + " " + field + " changed to "
                      + value);
    this[field] = value;
};

/**
 * Get the lower bound of the temperature window
 */
Thermostat.prototype.low = function() {
    "use strict";
    return this.target - this.window / 2;
};

/**
 * Get the upper bound of the temperature window
 */
Thermostat.prototype.high = function() {
    "use strict";
    return this.target + this.window / 2;
};

/**
 * Function for polling thermometers
 * @param controller Controller object that is notified when the temperature
 * crosses a threshold.
 * @private
 */
Thermostat.prototype.poll = function(controller) {
    "use strict";

    if (!this.live)
	return; // shut down the poll loop

    var self = this;
    ds18x20.get(this.id, function(err, temp) {
        var i;
        if (err !== null) {
            console.error("ERROR: " + err);
        } else {
            // Test each of the rules in order until one fires,
            // then stop testing. This will leave us with the
            // appropriate low/high state.
            var remove = [];
            self.active_rule = "none";
            for (i = 0; i < self.rule.length; i++) {
                var rule = self.rule[i];
                var result;
                try {
                    result = rule.test(self, controller);
                } catch (e) {
                    console.TRACE("Rule " + i + " call failed: " + e.message);
                }
                if (typeof result === "string") {
                    if (result === "remove")
                        remove.push(i);
                } else if (typeof result === "boolean" && result) {
                    self.active_rule = self.rule[i].name;
                    break;
                }
            }

            // Remove rules flagged for removal
            while (remove.length > 0) {
                i = remove.pop();
                console.TRACE("thermostat", "Remove rule " + i);
                self.rule.splice(i, 1);
                self.renumberRules();
                controller.emit("config_change");
            }

            //console.TRACE("thermostat", self.name + " active rule is "
            //              + self.active_rule
            //              + " current temp " + temp + "C");
            // If rules are not enabled, we leave active_rule at
            // whatever the last setting was.

            if (temp < self.low())
                controller.setPin(self.name, "active rule", 1);
            else if (temp > self.high())
                controller.setPin(self.name, "active_rule", 0);

            self.last_temp = temp;
            setTimeout(function() {
                self.poll(controller);
            }, POLL_INTERVAL * 1000);
        }
    });
};

/**
 * Get the index of a rule specified by name, object or index
 * @private
 */
Thermostat.prototype.getRuleIndex = function(i) {
    "use strict";

    if (typeof i !== "string") {
        for (var j in this.rule) {
            if (this.rule[j].name === i) {
                return j;
            }
        }
    } else if (typeof i === "object") {
        return i.index;
    }
    return i;
};

/**
 * Reset the index of rules
 * @private
 */
Thermostat.prototype.renumberRules = function() {
    "use strict";

    for (var j = 0; j < this.rule.length; j++)
        this.rule[j].index = j;
};

/**
 * Get the current temperature from the device
 * @return {float} the current temperature sensed by the device
 */
Thermostat.prototype.temperature = function() {
    "use strict";
    this.last_temp = ds18x20.get(this.id);
    return this.last_temp;
};

/**
 * Get the last temperature measured from the device, without re-sensing
 * @return {float} the last temperature sensed by the device
 */
Thermostat.prototype.lastTemperature = function() {
    "use strict";
    return this.last_temp;
};

/**
 * Insert a rule at a given position in the order. Positions are
 * numbered from 0 (highest priority). To add a rule at the lowest
 * priority position, pass i=-1 (or i > max rule position)
 * @param rule {Rule} the rule, a hash with name: , test:
 * @param i {integer} the position to insert the rule at, or -1 (or undef) for the end
 * @return {integer} the position the rules was added at
 */
Thermostat.prototype.insert_rule = function(rule, i) {
    "use strict";
    if (typeof i === "undefined" || i < 0 || i > this.rule.length)
        i = this.rule.length;
    if (i === this.rule.length) {
        this.rule.push(rule);
    } else if (i === 0)
        this.rule.unshift(rule);
    else
        this.rule.splice(i, 0, rule);
    this.renumberRules();
    console.TRACE("thermostat", this.name + " rule " + this.rule[i].name
                  + "(" + i + ") inserted at " + rule.index);
    return i;
};

/**
 * Move a rule a specified number of places in the order
 * @param i the number (or name, or rule object) of the rule to delete
 * @param move {integer} number of places to move the rule, negative to move up,
 * positive to move down
 */
Thermostat.prototype.move_rule = function(i, move) {
    "use strict";
    if (move === 0)
        return;
    i = this.getRuleIndex(i);
    var dest = i + move;
    if (dest < 0)
        dest = 0;
    if (dest >= this.rule.length)
        dest = this.rule.length - 1;

    var removed = this.rule.splice(i, 1);
    this.rule.splice(dest, 0, removed[0]);
    this.renumberRules();
    console.TRACE("thermostat", this.name + " rule " + i + " moved to " + dest);
};

/**
* Remove a rule
* @param i the number (or name, or rule object) of the rule to delete
* @return the removed rule function
*/
Thermostat.prototype.remove_rule = function(i) {
    "use strict";
    i = this.getRuleIndex(i);
    var del = this.rule.splice(i, 1);
    this.renumberRules();
    console.TRACE("thermostat", this.name + " rule " + del[0].name
                  + "(" + i + ") removed");
    return del[0];
};

/**
 * Remove all rules
 */
Thermostat.prototype.clear_rules = function() {
    "use strict";
    console.TRACE("thermostat", this.name + " rules cleared");
    this.rule = [];
};
