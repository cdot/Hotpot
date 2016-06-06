/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
/**
 * Singleton controller for a number of pins and thermostats. Controls the
 * hardware state.
 */
const EventEmitter = require("events").EventEmitter;  
const util = require("util");
const Thermostat = require("./Thermostat.js");
const Pin = require("./Pin.js");
const Rule = require("./Rule.js");
const Mobile = require("./Mobile.js");

// Time to wait for the multiposition valve to return to the discharged
// state, in ms
const VALVE_RETURN = 10000;

/**
 * @param config Config object
 * @param {function} when_ready callback function for when the controller is
 * initialised and ready to accept commands (with this set to the Controller)
 * @class
 */
function Controller(config, when_ready) {
    "use strict";

    console.TRACE("init", "Creating Controller");

    this.location = config.get("location");
    this.createMobiles(config.getConfig("mobiles"));
    this.createPins(config.getConfig("pins"), function() {
        this.createThermostats(config.getConfig("thermostats"), when_ready);
    });
}
util.inherits(Controller, EventEmitter);
module.exports = Controller;

/**
 * Release all resources used by the object
 */
Controller.prototype.DESTROY = function() {
    "use strict";
    var k;
    for (k in this.pin)
        this.pin[k].DESTROY();
    for (k in this.thermostat)
        this.thermostat[k].DESTROY();
    for (k in this.mobile)
        this.mobile[k].DESTROY();
};

/**
 * Create mobiles specified by config
 */
Controller.prototype.createMobiles = function(mob_config) {
    "use strict";

    var self = this;
    self.mobile = {};
    mob_config.each(function(id) {
        self.mobile[id] = new Mobile(
            id, mob_config.getConfig(id), self.location);
    });
};

/**
 * Create pins as specified by config
 * @private
 */
Controller.prototype.createPins = function(pin_config, done) {
    "use strict";
    var self = this;

    self.pin = {};

    // Set up callback when all pins complete
    var counter = 0;
    pin_config.each(function() {
        counter++;
    });
    var notify = function() {
        if (--counter === 0)
            done.call(self);
    };

    // Create the pins
    pin_config.each(function(k) {
        self.pin[k] = new Pin(k, pin_config.getConfig(k), notify);
    });
};
    
/**
 * Create thermostats as specified by config
 * @private
 */
Controller.prototype.createThermostats = function(ts_config, done) {
    "use strict";
    var self = this;

    self.thermostat = {};
    ts_config.each(function(k) {
        var th = new Thermostat(k, self, ts_config.getConfig(k));
        self.thermostat[k] = th;
    });

    // When we start, turn heating OFF and hot water ON to ensure
    // the valve returns to the A state. Once the valve has settled,
    // turn off hot water. The grey wire will be high but the valve
    // won"t be listening to it.

    // Assume worst-case valve configuration i.e. grey wire live holding
    // valve. Reset to no-power state by turning HW on to turn off the
    // grey wire and waiting for the valve spring to relax.
    console.TRACE("init", "Resetting valve");
    self.pin.HW.set(true, "init", function() {
        self.pin.CH.set(false, "init", function() {
            self.set("HW", "init", false, function() {
                done.call(self);
            });
        });
    });
};

Controller.prototype.serialisable = function() {
    "use strict";

    var sermap = function(m) {
	var res = {};
	for (var k in m)
            res[k] = m[k].serialisable();
        return res;
    };

    return {
	time: new Date().toString(), // local time
        location: this.location,
        thermostats: sermap(this.thermostat),
        pins: sermap(this.pin),
        mobiles: sermap(this.device)
    };
};

/**
 * Set the on/off state of the system.
 * @param {String} channel e.g. "HW" or "CH"
 * @param {String} actor who is setting e.g. "thermostat" or "command"
 * @param {boolean} on true or false (on or off)
 * @param {function> respond function called when state is set, parameters
 * are (this=Controller, channel, state)
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
        this.pin.CH.set(0, actor, function() {
            this.pin.HW.set(1, actor, function() {
                self.pending = true;
                setTimeout(function() {
                    self.pending = false;
                    self.set(channel, actor, on, respond);
                }, VALVE_RETURN);
            });
        });
    } else {
        // Otherwise this is a simple state transition, just
        // set the appropriate pin
        this.pin[channel].set(on, actor, function() {
            if (typeof respond !== "undefined")
                respond.call(self, channel, on);
        });
    }
};

/**
 * Handler for a location setting
 * @param info structure containing location in "latitude", "longitude" and
 * device idenitifier in "device"
 * @return location of server
 */
Controller.prototype.setMobileLocation = function(info) {
    "use strict";
    var d = info.device;
    if (typeof this.mobile[d] === "undefined")
        throw "Set location: " + d + " not known" + new Error().stack;
    this.mobile[d].setLocation(info);
    var interval = this.mobile[d].estimateTOA();
    return {
        home_lat: this.location.home.latitude,
        home_long: this.location.home.longitude,
        interval: interval
    };
};

/**
 * Command handler for a command that modifies the configuration
 * of the controller.
 * @param command structure containing the command and parameters e.g.
 * command: "insert_rule", id: "name", name: "rule name", test: "function text", number: index
 * command: "replace_rule", id: "name", index: index, name: "rule name", test: "function text"
 * command: "remove_rule", id: "name", index: index
 * command: "move_rule", id: "name", index: index, value: rel
 * command: "set_window", id: "name", value: width
 * command: "set_target", id: "name", value: temp
 * command: "set_state", id: "name", value: state
 * id is the controller id e.g. HW
 */
Controller.prototype.executeCommand = function(command) {
    "use strict";

    var ptypes = {
        command: "string",
        id: "string",
        index: "int",
        name: "string",
        test: "function",
        value: "float"
    };

    function get(field) {
        var fn;
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
        case "function":
            eval("fn=" + command[field]);
            return fn;
        default:
            if (typeof command[field] !== ptypes[field])
                throw "Bad " + field + ": got " + (typeof command[field])
                + " expected " + ptypes[field];
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
            new Rule(get("name"), get("test")),
            get("index"));
        self.emit("config_change");
        break;
    case "replace_rule":
        th.remove_rule(get("index"));
        th.insert_rule(
            new Rule(get("name"), get("test")),
            get("index"));
        self.emit("config_change");
        break;
    case "move_rule":
        th.move_rule(get("index"), get("value"));
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
        self.set(command.id, "command", get("value") !== 0);
        break;
    default:
        throw "Unrecognised command " + command.command;
    }
};
