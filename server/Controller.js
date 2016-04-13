/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
const Fs = require("fs");

const Thermostat = require("./Thermostat.js");
const PinController = require("./PinController.js");
const Time = require("./Time.js"); // for rules

/**
 * @param config configuration data, including the following fields:
 * valve_return - Y-plan valve spring return time, in seconds
 * device - hash of device ids, one per thermostat
 * gpio - hash of gpio pins, usually one per thermostat
 * temperature - hash of initial target temperature, per thermostat
 * window - hash of initial windows, one per thermostat
 * @param when_ready callback function for when the controller is
 * initialised and ready to accept commands
 */
function Controller(config, when_ready) {
    "use strict";

    var self = this, k;

    // Create pin controllers
    self.pin = {};
    for (k in config.gpio) {
        self.pin[k] = new PinController(k, config.gpio[k]);
    }

    // Create thermostats
    self.thermostat = {};
    var switch_on = function(id, cur) {
        console.TRACE(1, id + " ON, " + cur + " < "
                    + (config.temperature[id]
                       + config.window[id] / 2));
        self.set(id, true);
    };
    var switch_off = function(id, cur) {
        console.TRACE(1, id + " OFF, " + cur + " > "
                    + (config.temperature[id]
                       - config.window[id] / 2));
        self.set(id, false);
    };

    for (k in config.device) {
        var th = new Thermostat(k,
                                config.device[k],
                                config.temperature[k],
                                config.window[k]);
        th.on("below", switch_on);
        th.on("above", switch_off);
        self.thermostat[k] = th;
    }

    // Load rules for thermostats
    for (k in config.rules) {
        console.TRACE(0, "Loading rules for " + k + " from "
                      + config.rules[k]);
        var data = Fs.readFileSync(config.rules[k], "utf8");
        try {
            var rules = eval(data);
            self.thermostat[k].clear_rules();
            for (var i in rules)
                self.thermostat[k].insert_rule(rules[i], i);
        } catch (e) {
            console.error("Failed to load rules from "
                          + config.rules[k] + ": " + e.message);
        }
    }

    // When we start, turn heating OFF and hot water ON to ensure
    // the valve returns to the A state. Once the valve has settled,
    // turn off hot water. The grey wire will be high but the valve
    // won"t be listening to it.

    // Assume worst-case valve configuration i.e. grey wire live holding
    // valve. Reset to no-power state by turning HW on to turn off the
    // grey wire and waiting for the valve spring to relax.
    console.info("- Resetting valve");
    self.pin.HW.set(1);
    self.pin.CH.set(0);
    self.set("HW", false, function() {
        when_ready.call(self);
    });
}
module.exports = Controller;

Controller.prototype.DESTROY = function() {
    for (k in this.pin) {
        this.pin[k].DESTROY();
    }

    for (k in this.thermostat) {
        this.thermostat[k].DESTROY();
    }
};

/**
 * @private
 * Set the on/off state of the system.
 * @param channel "HW" or "CH"
 * @param state true or false (on or off)
 * @param respond function called when state is set, parameters
 * are (self=Server, channel, state)
 */
Controller.prototype.set = function(channel, on, respond) {
    "use strict";

    var self = this;
    if (this.pending) {
        console.TRACE(2, "Request backing off");
        setTimeout(function() {
            console.TRACE(2, "Backed off awakens");
            self.set(channel, on, respond);
        }, this.valve_return * 1000);
    }

    // Y-plan systems have a state where if the heating is on but the
    // hot water is off, and the heating is turned off, then the grey
    // wire to the valve (the "hot water off" signal) is held high,
    // stalling the motor and consuming power pointlessly. We need some
    // special processing to avoid this state.
    // If heating only on, and it's going off, switch on HW
    // to kill the grey wire. This allows the spring to fully
    // return. Then after a timeout, set the desired state.
    if (channel === "CH" && !on
        && this.pin.HW.state === 1 && this.pin.HW.state === 0) {
        this.pin.CH.set(0);
        this.pin.HW.set(1);
        self.pending = true;
        setTimeout(function() {
            self.pending = false;
            self.set(channel, on, respond);
        }, this.valve_return * 1000);
    } else {
        // Otherwise this is a simple state transition, just
        // set the appropriate pin
        this.pin[channel].set(on ? 1 : 0);
        if (respond)
            respond.call(self, channel, on);
    }
};

/**
 * Command handler to get the status of the controller. Status information
 * is returned for each controlled thermostat and pin
 */
Controller.prototype.get_status = function() {
    "use strict";

    var struct = {
	time: new Date().toGMTString()
    };

    var serialize = function(cv) {
        return "" + cv;
    };
    for (var k in this.thermostat) {
        var th = this.thermostat[k];
        struct[th.name] = {};
        struct[th.name].temperature = th.temperature();
        struct[th.name].window = th.window;
        struct[th.name].target = th.target;
        struct[th.name].state = this.pin[th.name].state;
        struct[th.name].rules_enabled = th.rules_enabled;
        struct[th.name].rules = th.rules.map(serialize);
    }
    return struct;
};

/**
 * Command handler for a command that modifies the configuration
 * of the controller.
 * @param struct structure comtaining the command e.g.
 * { command: "disable_rules", thermostat: "name" }
 * { command: "enable_rules", thermostat: "name" }
 * { command: "insert_rule", thermostat: "name", name: "rule name", test: "function text" }
 * { command: "remove_rule", thermostat: "name", name: "rule name" }
 * { command: "set_window", thermostat: "name", number: width }
 * { command: "set_target", thermostat: "name", number: temp }
 */
Controller.prototype.execute_command = function(struct) {
    "use strict";

    var self = this;

    for (var k in struct) {
        var command = struct[k];
        var th = self.thermostat[command.thermostat];
        switch (command.command) {
        case "disable_rules":
            th.enable_rules(false);
            break;
        case "enable_rules":
            th.enable_rules(true);
            break;
        case "remove_rule":
            th.remove_rule(command.name);
            break;
        case "insert_rule":
            var test;
            try {
                eval("test=" + command.test);
            } catch (e) {
                throw "Bad test function: " + command.test
                    + ": " + e.message;
            };
            th.insert_rule({
                name: command.name,
                test: test
            }, command.number);
            break;
        case "set_window":
            th.set_window(command.number);
            break;
        case "set_target":
            th.set_target(command.number);
            break;
        default:
            throw "Fuck off";
        }
    }
};
