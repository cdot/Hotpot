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

// Thermostat poll
const POLL_INTERVAL = 1; // seconds

// Singleton interface to DS18x20 thermometers
var ds18x20;

// Known thermometer ids (get from command-line or config)
const K0 = -273.25; // 0K

/**
 * Construct a thermostat
 * @param name name by which the caller identifies the thermostat
 * @param id device id of the DS18x20 device
 * @param target target temperature (optional)
 * @param window window around target (optional, see set_window)
 */
function Thermostat(name, id, target, window) {
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
    this.id = id;     // DS18x20 device ID
    this.target = K0; // target temperature
    this.low = K0;    // low threshold
    this.high = K0;   // high threshold
    this.window = 0;  // slack window
    if (typeof target !== "undefined")
        this.set_target(target);
    if (typeof window !== "undefined")
        this.set_window(window);

    this.last_temp = K0; // Temperature measured in last poll

    if (typeof ds18x20.mapID !== "undefined")
        ds18x20.mapID[id] = name;

    // Don't start polling until after a timeout even because otherwise
    // the event emitter won't work
    setTimeout(function() {
        console.log("Thermostat " + self.name + " "
                    + self.low + " < T < " + self.high + " started");
        self.poll();
    }, 10);
}
util.inherits(Thermostat, EventEmitter);
module.exports = Thermostat;

/**
 * Set target temperature.
 * Thresholds will be computed based on the current window.
 * @param target target temperature
 */
Thermostat.prototype.set_target = function(target) {
    "use strict";
    if (target == this.target)
        return;
    this.target = target;
    this.low = this.target - this.window / 2;
    this.high = this.target + this.window / 2;
    console.log(this.name + " target changed to " + this.target);
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
};

// Private function for polling thermometers
Thermostat.prototype.poll = function() {
    "use strict";
    var self = this;
    //console.log("Poll " + this.id);
    ds18x20.get(this.id, function(err, temp) {
        if (err !== null) {
            console.log("ERROR: " + err);
        } else {
            // Update the rules
            for (var i in self.rules) {
                console.log("Test rule " + i);
                var rule = self.rules[i];
                if (rule.call(self, temp))
                    break;
            }
            //console.log(self.id + " reads " + temp + "C");
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
 */
Thermostat.prototype.temperature = function() {
    "use strict";
    return ds18x20.get(this.id);
};

/**
 * Insert a rule at a given position in the order. Positions are
 * numbered from 0 (highest priority). To add a rule at the lowest
 * priority position, pass i=-1 (or i > max rule position)
 * @param rule the rule to add
 * @param i the position to insert the rule at, or -1 for the end
 * @return the position the rules was added at
 */
Thermostat.prototype.insert_rule = function(rule, i) {
    "use strict";
    if (i < 0 || i >= this.rules.length) {
        this.rules.push(rule);
        i = this.rules.length - 1;
    } else if (i == 0)
        this.rules.unshift(rule);
    else
        this.rules.splice(i, 0, rule);
    return i;
};

/**
* Remove a rule
* @param i the number of the rule to delete
* @return the removed rule function
*/
Thermostat.prototype.remove_rule = function(i) {
    "use strict";
    var del = this.rules.splice(i, 1);
    return del[0];
};

/**
 * Remove all rules
 */
Thermostat.prototype.clear_rules = function() {
    "use strict";
    this.rules = [];
};
