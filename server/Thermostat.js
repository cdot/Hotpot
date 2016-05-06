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
const EventEmitter = require("events").EventEmitter;  
const util = require("util");
const Fs = require("fs");
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
 * @param config configuration block for the pin, described in README.md
 */
function Thermostat(name, config) {
    "use strict";

    if (!ds18x20) {
        ds18x20 = require("ds18x20");
        if (!ds18x20.isDriverLoaded()) {
            try {
                ds18x20.loadDriver();
            } catch (err) {
                console.error(err.message);
                console.error("Temperature sensor driver not loaded - falling back to test sensor");
                var DS18x20 = require("./TestSupport.js").DS18x20;
                ds18x20 = new DS18x20();
            }
        }
    }

    EventEmitter.call(this);
    var self = this;
    this.name = name;
    this.id = config.id; // DS18x20 device ID
    this.target = 15;    // target temperature
    this.low = 13;       // low threshold
    this.high = 17;      // high threshold
    this.window = 4;     // slack window
    this.rules = [];     // activation rules, array of Rule
    this.rules_enabled = true;

    this.active_rule = "none"; // the currently active rule
    this.live = true; // True until destroyed
    
    if (typeof config.target !== "undefined")
        this.set_target(config.target);
    if (typeof config.window !== "undefined")
        this.set_window(config.window);

    this.last_temp = K0; // Temperature measured in last poll

    if (typeof ds18x20.mapID !== "undefined")
        ds18x20.mapID[config.id] = name;

    if (typeof config.rules !== "undefined") {
        console.TRACE("init", "Loading rules for " + name + " from "
                      + config.rules);
        var data = Fs.readFileSync(config.rules, "utf8");
        try {
            // Not JSON, as it contains functions
            var rules = eval(data);
            self.clear_rules();
            for (var i in rules)
                self.insert_rule(
                    new Rule(rules[i].name,
                             rules[i].test));
        } catch (e) {
            console.error("Failed to load rules from "
                          + config.rules + ": " + e.message);
        }
    }

    // Don't start polling until after a timeout even because otherwise
    // the event emitter won't work
    setTimeout(function() {
        console.TRACE("thermostat", self.name + " "
                      + self.low + " < T < " + self.high + " started");
        self.poll();
    }, 10);
}
util.inherits(Thermostat, EventEmitter);
module.exports = Thermostat;

Thermostat.prototype.DESTROY = function() {
    "use strict";
    this.live = false;
};

/**
 * Set target temperature.
 * Thresholds will be computed based on the current window.
 * @param target target temperature
 */
Thermostat.prototype.set_target = function(target) {
    "use strict";
    this.low = target - this.window / 2;
    this.high = target + this.window / 2;
    if (target !== this.target)
        console.TRACE("thermostat", this.name + " target changed to " + this.target);
    this.target = target;
};

/**
 * Set temperature window.
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

// Private function for polling thermometers
Thermostat.prototype.poll = function() {
    "use strict";

    if (!this.live)
	return; // shut down the poll loop

    var self = this;
    ds18x20.get(this.id, function(err, temp) {
        if (err !== null) {
            console.error("ERROR: " + err);
        } else {
            if (self.rules_enabled) {
                // Test each of the rules in order until one fires,
                // then stop testing. This will leave us with the
                // appropriate low/high state.
                self.active_rule = "none";
                 for (var i in self.rules) {
                    if (self.rules[i].test(self, temp)) {
                        self.active_rule = self.rules[i].name;
                        break;
                    }
                }
            }
            //console.TRACE("thermostat", self.name + " active rule is "
            //              + self.active_rule
            //              + " current temp " + temp + "C");
            // If rules are not enabled, we leave active_rule at
            // whatever the last setting was.

            var init = (self.last_temp === K0);
            if (temp < self.low && (init || self.last_temp >= self.low))
                self.emit("below", self.name, temp);
            else if (temp > self.high && (init || self.last_temp <= self.high))
                self.emit("above", self.name, temp);
            self.last_temp = temp;
            setTimeout(function() {
                self.poll();
            }, POLL_INTERVAL * 1000);
        }
    });
};

/**
 * Get the current temperature
 * @return the current termperature sensed by the device
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
    rule.index = i;
    console.TRACE("thermostat", this.name + " rule " + this.rules[i].name
                  + "(" + i + ") inserted at " + rule.index);
    return i;
};

/**
* Remove a rule
* @param i the number (or name, or rule object) of the rule to delete
* @return the removed rule function
*/
Thermostat.prototype.remove_rule = function(i) {
    "use strict";
    if (typeof i === "string") {
        for (var j in this.rules) {
            if (this.rules[j].name === i) {
                i = j;
                break;
            }
        }
    } else if (typeof i === "object") {
        i = i.index;
    }
    var del = this.rules.splice(i, 1);
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

/**
 * Enable/disable rules
 * @param torf true to enable rules (the default)
 */
Thermostat.prototype.enable_rules = function(torf) {
    "use strict";
    this.rules_enabled = torf;
    console.TRACE("thermostat", this.name + " rules "
                  + (this.rules_enabled ? "en" : "dis") + "abled");
};

/**
 * Construct a report amenable to serialisation
 */
Thermostat.prototype.serialisable = function() {
    "use strict";
    return {
        name: this.name,
        temperature: this.temperature(),
        window: this.window,
        target: this.target,
        rules_enabled: this.rules_enabled,
        active_rule: this.active_rule,
        rules: this.rules.map(function(rule, i) {
            return rule.serialisable(i);
        })
    };
};
