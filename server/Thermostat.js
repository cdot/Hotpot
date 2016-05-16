/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Thermostat
 *
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
 * @param name name by which the caller identifies the thermostat
 * @param controller Controller this thermostat is part of
 * @param config configuration for the pin, a Config object
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
    self.id = config.id; // DS18x20 device ID
    self.target = 15;    // target temperature
    self.window = 4;     // slack window
    self.rules = [];     // activation rules, array of Rule
    self.rules_enabled = true;
    self.active_rule = "none"; // the currently active rule
    self.live = true; // True until destroyed
    
    if (typeof config.target !== "undefined")
        self.set_target(config.target);
    if (typeof config.window !== "undefined")
        self.set_window(config.window);

    self.last_temp = K0; // Temperature measured in last poll

    if (typeof ds18x20.mapID !== "undefined")
        ds18x20.mapID(config.id, name);

    if (typeof config.rules !== "undefined") {
        var rules = config.rules;
        self.clear_rules();
        for (var i in rules)
            self.insert_rule(
                new Rule(rules[i].name,
                         rules[i].test));
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
 * Release all resources used by the thermostat
 */
Thermostat.prototype.DESTROY = function() {
    "use strict";
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return a serialisable structure
 */
Thermostat.prototype.serialisable = function() {
    "use strict";

    return {
        name: this.name,
        id: this.id,
        target: this.target,
        window: this.window,
	temperature: this.temperature(),
        last_temp: this.last_temp,
	active_rule: this.active_rule,
        rules_enabled: this.rules_enabled,
        rules: this.rules.map(function(rule) {
            return rule.serialisable();
        })
    };
};

/**
 * Set target temperature.
 * @param target target temperature
 */
Thermostat.prototype.set_target = function(target) {
    "use strict";
    if (target !== this.target)
        console.TRACE("thermostat", this.name + " target changed to "
                      + this.target);
    this.target = target;
};

Thermostat.prototype.enable_rules = function(enable) {
    "use strict";
    this.rules_enabled = enable;
};


/**
 * Set the temperature window.
 * Thresholds will be recomputed based on the current target, so
 * that "above" is fired when temperature rises above target+window/2
 * and "below" when temp falls below target-window/2
 * @param window amount of window around the target
 */
Thermostat.prototype.set_window = function(window) {
    "use strict";
    this.window = window;
    this.set_target(this.target);
    console.TRACE("thermostat", this.name + " window changed to " + this.window);
};

/**
 * Get the lower bound of the temperature window
 */
Thermostat.prototype.low = function() {
    "use strict";
    return this.target - this.window / 2;
};

/**
 * Get the upper bound of the termperature window
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
            for (i = 0; i < self.rules.length; i++) {
                var rule = self.rules[i];
                var result;
               try {
                    result = rule.test.call(self, controller);
                } catch (e) {
                    console.TRACE("Rule " + i + " call failed: " + e.message);
                }
                if (typeof result === "string") {
                    if (result === "remove")
                        remove.push(i);
                } else if (typeof result === "boolean" && result) {
                    self.active_rule = self.rules[i].name;
                    break;
                }
            }

            // Remove rules flagged for removal
            while (remove.length > 0) {
                i = remove.pop();
                console.TRACE("thermostat", "Remove rule " + i);
                self.rules.splice(i, 1);
                self.renumber_rules();
                controller.emit("config_change");
            }

            //console.TRACE("thermostat", self.name + " active rule is "
            //              + self.active_rule
            //              + " current temp " + temp + "C");
            // If rules are not enabled, we leave active_rule at
            // whatever the last setting was.

            if (temp < self.low())
                controller.set(self.name, "active rule", true);
            else if (temp > self.high())
                controller.set(self.name, "active_rule", false);

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
Thermostat.prototype.get_rule_index = function(i) {
    "use strict";

    if (typeof i !== "string") {
        for (var j in this.rules) {
            if (this.rules[j].name === i) {
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
Thermostat.prototype.renumber_rules = function() {
    "use strict";

    for (var j = 0; j < this.rules.length; j++)
        this.rules[j].index = j;
};

/**
 * Get the current temperature
 * @return the current temperature sensed by the device
 */
Thermostat.prototype.temperature = function() {
    "use strict";
    return ds18x20.get(this.id);
};

/**
 * Insert a rule at a given position in the order. Positions are
 * numbered from 0 (highest priority). To add a rule at the lowest
 * priority position, pass i=-1 (or i > max rule position)
 * @param rule the rule, a hash with { name: , test: }
 * @param i the position to insert the rule at, or -1 (or undef) for the end
 * @return the position the rules was added at
 */
Thermostat.prototype.insert_rule = function(rule, i) {
    "use strict";
    if (typeof i === "undefined" || i < 0 || i > this.rules.length)
        i = this.rules.length;
    if (i === this.rules.length) {
        this.rules.push(rule);
    } else if (i === 0)
        this.rules.unshift(rule);
    else
        this.rules.splice(i, 0, rule);
    this.renumber_rules();
    console.TRACE("thermostat", this.name + " rule " + this.rules[i].name
                  + "(" + i + ") inserted at " + rule.index);
    return i;
};

/**
 * Move a rule a specified number of places in the order
 * @param i the number (or name, or rule object) of the rule to delete
 * @param move number of places to move the rule, negative to move up,
 * positive to move down
 */
Thermostat.prototype.move_rule = function(i, move) {
    "use strict";
    if (move === 0)
        return;
    i = this.get_rule_index(i);
    var dest = i + move;
    if (dest < 0)
        dest = 0;
    if (dest >= this.rules.length)
        dest = this.rules.length - 1;

    var removed = this.rules.splice(i, 1);
    this.rules.splice(dest, 0, removed[0]);
    this.renumber_rules();
    console.TRACE("thermostat", this.name + " rule " + i + " moved to " + dest);
};

/**
* Remove a rule
* @param i the number (or name, or rule object) of the rule to delete
* @return the removed rule function
*/
Thermostat.prototype.remove_rule = function(i) {
    "use strict";
    i = this.get_rule_index(i);
    var del = this.rules.splice(i, 1);
    this.renumber_rules();
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
    this.rules = [];
};
