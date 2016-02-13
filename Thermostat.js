/**
 * Thermostat
 *
 * Talks to DS18x20 thermometers and raises events when the measured
 * temp passes a target. Two events are supported, "above" when
 * the temperature increases above the target, and below, when the
 * temperature drops below the target. A slack window can be built into the
 * measurement so that the "below" event doesn't fire until the temperature
 * drops below target-window/2 and above doesn't fire until it rises
 * above target+window/2. The events are passed the current temperature.
 * Also supports measuring the immediate temperature of the thermometer,
 * independent of the event loop.
 */
const EventEmitter = require("events").EventEmitter;  
const util = require("util");
const crontab = require("node-crontab");

// Thermostat poll
const POLL_INTERVAL = 1; // seconds

// Singleton interface to DS18x20 thermometers
var ds18x20 = require("ds18x20");
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
    this.target = target;
    this.low = this.target - this.window / 2;
    this.high = this.target + this.window / 2;
};

/**
 * @param schedule array of arrays of cron specifications. Each has entries
 * [0] minute      0-59
 * [1] hour        0-23
 * [2] date        1-31
 * [3] month       1-12 (or names)
 * [4] dow         0-7 (0 pr 7 is Sun, or use names)#
 * [5] time to run for H or H:M
 * [6] temperature in degrees C, 0 switches off
 * schedule can also be a string. The fields are whitespace separated,
 * lines are newline separated. Comment lines start with #
 *
 * Examples:
 * # Set 18C at 06:30 for 2 hours every day
 * 30 6 * * * 2 18
 * # Set 18C 18:30 for 4.5 hours every day
 * 30 8 * * * 4.5 18
 * # Switch off between 19:00 and 21:30 every Wednesday and Friday
 * 0 19 * * Wed,Fri 2.5 0
 *
 * Schedules are ordered, with the lowest priority, default, schedule at the top.
 * When a higher priority (lower) schedule is in force, the lower priority schedules
 * will continue to run but will have no effect. When the higher priority item completes,
 * the next highest priority active schedule will take over.
 */
Thermostat.prototype.set_schedule = function(schedules) {
    "use strict";
    var self = this;
    var i;

    if (typeof schedules === "string") {
        var lines = schedules.split(/\n/);
        schedules = [];
        for (i in lines) {
            var line = lines[i];
            if (line.charAt(0) === "#" || line.length === 0)
                continue;
            var fields = line.split(/[ \t]+/, 7);
            if (fields.length === 7)
                schedules.push(fields);
            else
                console.error("Error parsing " + self.name
                              + " schedules: Malformed schedule " + lines[i]);
        }
    }

    for (i in self.schedule)
        crontab.cancelJob(self.schedule[i][8]);
    self.schedule = [];

    var dispatch = function(n) {
        self.fire_job(n);
    };

    for (i in schedules) {
        var prio = self.schedule.length;
        var sched = schedules[i];
        self.schedule.push(sched);
        var scheds = sched[0] + " " + sched[1] + " " +
                    sched[2] + " " + sched[3] + " " + sched[4];
        console.log("Schedule " + scheds);
        try {
            var jobid = crontab.scheduleJob(
                scheds,
                dispatch,
                [ i ],
                self,
                true);
            self.schedule[i].push(jobid);
        } catch (e) {
            console.error("Error parsing " + self.name
                          + " schedules: " + e.message);
        }
    }
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
            // Round temp to degress
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
