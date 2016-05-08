/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
/**
 * Singleton controller for a number of pins and thermostats. Controls the
 * hardware state.
 */
const EventEmitter = require("events").EventEmitter;  
const util = require("util");
const Fs = require("fs");
const Thermostat = require("./Thermostat.js");
const PinController = require("./PinController.js");
const Rule = require("./Rule.js");

// Time to wait for the multiposition valve to return to the discharged
// state, in ms
const VALVE_RETURN = 10000;

/**
 * @param config Config object
 * @param when_ready callback function for when the controller is
 * initialised and ready to accept commands
 */
function Controller(config, when_ready) {
    "use strict";

    console.TRACE("init", "Creating Controller");

    var self = this, k;
    self.last_changed_by = "initialisation";
    self.config = config;

    EventEmitter.call(self);
    // Create pin controllers
    self.pin = {};
    for (k in config.pins) {
        self.pin[k] = new PinController(k, config.pins[k]);
    }

    // Event handlers
    var thermostat_on = function(id, cur) {
        // Thermostat requested change
        console.TRACE("change", id + " ON, " + cur + " < "
                    + self.thermostat[id].low);
        self.set(id, "active rule", true);
    };
    var thermostat_off = function(id, cur) {
        // Thermostat requested change
        console.TRACE("change", id + " OFF, " + cur + " > "
                    + self.thermostat[id].high);
        self.set(id, "active rule", false);
    };
    
    // Create thermostats
    self.thermostat = {};
    for (k in config.thermostats) {
        var th = new Thermostat(k, config.thermostats[k]);
        th.on("below", thermostat_on);
        th.on("above", thermostat_off);
        self.thermostat[k] = th;
    }

    // When we start, turn heating OFF and hot water ON to ensure
    // the valve returns to the A state. Once the valve has settled,
    // turn off hot water. The grey wire will be high but the valve
    // won"t be listening to it.

    // Assume worst-case valve configuration i.e. grey wire live holding
    // valve. Reset to no-power state by turning HW on to turn off the
    // grey wire and waiting for the valve spring to relax.
    console.TRACE("init", "Resetting valve");
    self.pin.HW.set(1, "init");
    self.pin.CH.set(0, "init");
    self.set("HW", "init", false, function() {
        when_ready.call(self);
    });
}
util.inherits(Controller, EventEmitter);
module.exports = Controller;

Controller.prototype.serialisable = function() {
    "use strict";

    return {
        thermostats: this.thermostat.map(function(th) {
            return th.serialisable();
        },
        pins: this.pin.map(function(p) {
            return p.serialisable();
        }
    };
};

/**
 * @private
 * Set the on/off state of the system.
 * @param channel e.g. "HW" or "CH"
 * @param actor who is setting e.g. "thermostat" or "command"
 * @param state true or false (on or off)
 * @param respond function called when state is set, parameters
 * are (self=Server, channel, state)
 */
Controller.prototype.set = function(channel, actor, on, respond) {
    "use strict";

    var self = this;
    if (this.pending) {
        setTimeout(function() {
            self.set(channel, actor, on, respond);
        }, VALVE_RETURN);
	return;
    }

    self.last_changed_by = actor;

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
            self.set(channel, actor, on, respond);
        }, VALVE_RETURN);
    } else {
        // Otherwise this is a simple state transition, just
        // set the appropriate pin
        this.pin[channel].set(on ? 1 : 0, actor);
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
	time: new Date().toGMTString(),
        thermostats: [],
        pins: [],
        last_changed_by: this.last_changed_by
    };
    var k;

    for (k in this.thermostat) {
        var th = this.thermostat[k];
        struct.thermostats.push(th.serialisable());
    }
    for (k in this.pin) {
        var pi = this.pin[k];
        struct.pins.push(pi.serialisable());
    }
    return struct;
};

/**
 * Command handler for a command that modifies the configuration
 * of the controller.
 * @param struct structure containing the command and parameters e.g.
 * { command: "disable_rules", id: "name" }
 * { command: "enable_rules", id: "name" }
 * { command: "insert_rule", id: "name", name: "rule name", test: "function text", number: index }
 * { command: "replace_rule", id: "name", index: index, name: "rule name", test: "function text" }
 * { command: "remove_rule", id: "name", index: index }
 * { command: "set_window", id: "name", value: width }
 * { command: "set_target", id: "name", value: temp }
 * { command: "set_state", id: "name", value: state }
 * id is the controller id e.g. HW
 */
Controller.prototype.execute_command = function(command) {
    "use strict";

    var self = this;

    var th = self.thermostat[command.id];
    switch (command.command) {
    case "remove_rule":
        th.remove_rule(command.index);
        self.emit("config_change");
        break;
    case "insert_rule":
        th.insert_rule(new Rule(command.name, command.test), command.index);
        self.emit("config_change");
        break;
    case "replace_rule":
        th.remove_rule(command.index);
        th.insert_rule(new Rule(command.name, command.test), command.index);
        self.emit("config_change");
        break;
    case "set_window":
        th.set_window(command.value);
        self.emit("config_change");
        break;
    case "set_target":
        th.set_target(command.value);
        self.emit("config_change");
        break;
    case "set_state":
        console.TRACE("change", command.id + " FORCE " + command.value);
        this.last_changed_by = "command";
        self.set(command.id, "command", parseInt(command.value) !== 0);
        break;
    default:
        throw "Unrecognised command " + command.command;
    }
};
