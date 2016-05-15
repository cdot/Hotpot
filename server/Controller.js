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
    self.config = config;

    EventEmitter.call(self);
    // Create pin controllers
    self.pin = {};
    for (k in config.pins) {
        self.pin[k] = new PinController(k, config.pins[k]);
    }

    // Event handlers
    var thermostat_on = function(id, cur) {
        self.set(id, "active rule", true);
    };
    var thermostat_off = function(id, cur) {
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

    var sermap = function(m) {
	var k, res = {};
	for (var k in m)
            res[k] = m[k].serialisable();
        return res;
    };

    return {
        thermostats: sermap(this.thermostat),
        pins: sermap(this.pin)
    };
};

/**
 * @private
 * Set the on/off state of the system.
 * @param channel e.g. "HW" or "CH"
 * @param actor who is setting e.g. "thermostat" or "command"
 * @param on true or false (on or off)
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

    var cur = this.pin[channel].get();
    if (actor !== "init" && (on && cur === 1 || !on && cur === 0)) {
        if (typeof respond !== "undefined")
            respond.call(self, channel, on);
        return;
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
        this.pin.CH.set(0, actor);
        this.pin.HW.set(1, actor);
        self.pending = true;
        setTimeout(function() {
            self.pending = false;
            self.set(channel, actor, on, respond);
        }, VALVE_RETURN);
    } else {
        // Otherwise this is a simple state transition, just
        // set the appropriate pin
        this.pin[channel].set(on ? 1 : 0, actor);
        if (typeof respond !== "undefined")
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
        pins: []
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

    var ptypes = {
        command: "string",
        id: "string",
        index: "int",
        name: "string",
        test: "function",
        value: "float",
        expiry: "date"
    }

    function get(field) {
        if (typeof command[field] === "undefined")
            throw "Missing " + field;
        switch (ptypes[field]) {
        case "date":
            if (command[field] === "never")
                return undefined;
            return new Date(command[field]);
        case "int":
            return parseInt(command[field]);
        case "float":
            return parseFloat(command[field]);
        default:
            if (typeof command[field] !== type)
                throw "Bad " + field + ": " + t;
            return command[field];
        }
    }

    var self = this;
    var th = self.thermostat[command.id];
    switch (get("command")) {
    case "remove_rule":
        th.remove_rule(get("index"));
        self.emit("config_change");
        break;
    case "insert_rule":
        th.insert_rule(
            new Rule(get("name"), get("test"), get("expiry")),
            get("index"));
        self.emit("config_change");
        break;
    case "replace_rule":
        th.remove_rule(get("index"));
        th.insert_rule(
            new Rule(get("name"), get("test"), get("expiry")),
            get("index"));
        self.emit("config_change");
        break;
    case "set_window":
        th.set_window(get("value"));
        self.emit("config_change");
        break;
    case "set_target":
        th.set_target(get("value"));
        self.emit("config_change");
        break;
    case "set_state":
        // Will be overridden if any rules are in place. Better to use
        // an expiring rule.
        console.TRACE("change", command.id + " FORCE " + get("value"));
        self.set(command.id, "command", get(value) !== 0);
        break;
    default:
        throw "Unrecognised command " + command.command;
    }
};
