/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
/**
 * Singleton controller for a number of pins and thermostats. Controls the
 * hardware state, and dispatches incoming commands.
 *
 * The command set is very simple. Each command is delivered as a path
 * that contains a command-verb, such as "set" or "move_rule_up". The rest
 * of the path mirrors the structure of the controller configuration e.g.
 * "thermostat/HW/target" refers to the target setting on thermostat "HW".
 * Extra data, such as values, are passed in a structure that contains
 * command-specific fields.
 */
const EventEmitter = require("events").EventEmitter;  
const util = require("util");
const Thermostat = require("./Thermostat.js");
const Pin = require("./Pin.js");
const Rule = require("./Rule.js");
const Mobile = require("./Mobile.js");
const Server = require("./Server.js");

const TAG = "Controller";

// Time to wait for the multiposition valve to return to the discharged
// state, in ms
const VALVE_RETURN = 10000;

var controller;
module.exports = {
    configure: function(config, when_ready) {
        "use strict";
        controller = new Controller(config, when_ready);
    }
};

/**
 * @param config Config object
 * @param {function} when_ready callback function for when the controller is
 * initialised and ready to accept commands (with this set to the Controller)
 * @class
 */
function Controller(config, when_ready) {
    "use strict";

    console.TRACE(TAG, "Creating Controller");

    this.location = config.get("location");
    this.createMobiles(config.getConfig("mobile"));
    this.createPins(config.getConfig("pin"), function() {
        this.createThermostats(config.getConfig("thermostat"), when_ready);
    });
    var weather_config = Server.getConfig().getConfig("weather");
    if (typeof weather_config !== "undefined")
        this.weather_agent = require(
            "./" + weather_config.get("class") + ".js");
}
util.inherits(Controller, EventEmitter);

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
            id, mob_config.getConfig(id));
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
    console.TRACE(TAG, "Resetting valve");
    self.pin.HW.set(1, "init", function() {
        self.pin.CH.set(0, "init", function() {
            self.setPin("HW", "init", 0, function() {
                done.call(self);
            });
        });
    });
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 */
Controller.prototype.getSerialisableConfig = function() {
    "use strict";

    var sermap = function(m) {
	var res = {};
	for (var k in m)
            res[k] = m[k].getSerialisableConfig();
        return res;
    };

    return {
        location: this.location,
        thermostat: sermap(this.thermostat),
        pin: sermap(this.pin),
        mobile: sermap(this.mobile)
    };
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 */
Controller.prototype.getSerialisableState = function() {
    "use strict";

    var sermap = function(m) {
	var res = {};
	for (var k in m)
            res[k] = m[k].getSerialisableState();
        return res;
    };

    return {
	time: new Date().toString(), // local time
        env_temp: this.weather("Temperature"),
        thermostat: sermap(this.thermostat),
        pin: sermap(this.pin),
        mobile: sermap(this.mobile)
    };
};

/**
 * Set the on/off state of a pin. This is more sophisticated than a 
 * simple pin command, because there is a relationship between the state
 * of the pins in Y-plan systems that must be respected.
 * @param {String} channel e.g. "HW" or "CH"
 * @param {String} actor who is setting e.g. "thermostat" or "command"
 * @param {number} 1 (on) or 0 (off)
 * @param {function> respond function called when state is set, parameters
 * are (this=Controller, channel, state)
 */
Controller.prototype.setPin = function(channel, actor, on, respond) {
    "use strict";

    var self = this;
    if (this.pending) {
        setTimeout(function() {
            self.setPin(channel, actor, on, respond);
        }, VALVE_RETURN);
	return;
    }

    var cur = self.pin[channel].get();
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
                    self.setPin(channel, actor, on, respond);
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
 * Look up a mobile by ID
 * @param {string} id id of mobile to look up
 * @return {Mobile} mobile found, or null
 */
Controller.prototype.getMobile = function(id) {
    "use strict";
    for (var name in this.mobile) {
        var mobile = this.mobile[name];
        if (mobile.id === id)
            return mobile;
    }
    return null;
};

/**
 * Handler for a location setting
 * @param info structure containing location in "latitude", "longitude" and
 * device identifier in "device"
 * @return location of server
 */
Controller.prototype.setMobileLocation = function(info) {
    "use strict";
    var d = this.getMobile(info.device);
    if (d === null)
        throw "Set location: " + d + " not known" + new Error().stack;
    d.setLocation(info);
    var interval = d.estimateTOA(Server.config);
    return {
        home_lat: Server.getConfig().get("location").latitude,
        home_long: Server.getConfig().get("location").longitude,
        interval: interval
    };
};

/**
 * Get the current state of the weather for use in a rule
 */
Controller.prototype.weather = function(field) {
    "use strict";
    return this.weather_agent.get(field);
};

/**
 * Command handler for a command that modifies the configuration
 * of the controller.
 * @params {String} command the command verb
 * @params {array} path the command noun
 * @param {Object} data structure containing parameters
 */
Controller.prototype.dispatch = function(command, path, data) {
    "use strict";

    var self = this;

    function getFunction(field) {
        var fn;
        eval("fn=" + field);
        return fn;
    }
    
    switch (command) {
    case "state":
        return self.getSerialisableState();
    case "config":
        return self.getSerialisableConfig();
    case "remove_rule":
        // thermostat/{th}/rule/{index}
        self.thermostat[path[1]].remove_rule(parseInt(path[3]));
        self.emit("config_change");
        break;
    case "insert_rule":
        self.thermostat[path[1]].insert_rule(
            new Rule(data.name, getFunction(data.test)));
        self.emit("config_change");
        break;
    case "move_rule_up":
        self.thermostat[path[1]].move_rule(parseInt(path[3]), -1);
        self.emit("config_change");
        break;
    case "move_rule_down":
        self.thermostat[path[1]].move_rule(parseInt(path[3]), 1);
        self.emit("config_change");
        break;
    case "set":
        switch (path.shift()) {
        case "thermostat":
            self.thermostat[path.shift()].set(path, data);
            break;
        case "pin":
            self.setPin(path.shift(), "command", data.value);
            break;
        case "mobile":
            return self.setMobileLocation(data);
        }
        break;
    default:
        throw "Unrecognised command " + command;
    }
    return null;
};
