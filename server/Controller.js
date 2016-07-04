/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

const util = require("util");
const events = require("events").EventEmitter;  

const Thermostat = require("./Thermostat.js");
const Pin = require("./Pin.js");
const Rule = require("./Rule.js");
const Mobile = require("./Mobile.js");
const Server = require("./Server.js");
const Apis = require("./Apis.js");

const TAG = "Controller";

// Time to wait for the multiposition valve to return to the discharged
// state, in ms
const VALVE_RETURN = 10000;

// Frequency at which rules are re-evaluated
const RULE_INTERVAL = 5000;

module.exports = {
    configure: function(config, when_ready) {
        "use strict";
        Server.server.controller = new Controller(config, when_ready);
    }
};

/**
 * Singleton controller for a number of pins, thermostats, mobile devices,
 * and the rules that manage the system state based on inputs from these
 * elements.
 * @param {Config} config Config object
 * @param {function} when_ready callback function for when the controller is
 * initialised and ready to accept commands (with this set to the Controller)
 * @protected
 * @class
 */
function Controller(config, when_ready) {
    "use strict";

    var self = this;

    console.TRACE(TAG, "Creating Controller");

    this.location = config.get("location");
    this.createMobiles(config.getConfig("mobile"));
    this.createPins(config.getConfig("pin"), function() {
        this.createThermostats(
            config.getConfig("thermostat"),
            function() {
                // Thermostats and pins are ready. Can poll rules.
                self.pollRules();
                when_ready();
            });
    });
    this.createRules(config.getConfig("rule"));

    var weather_config = Apis.get("weather");
    if (typeof weather_config !== "undefined")
        this.weather_agent = require("./" + weather_config.class + ".js");

}
util.inherits(Controller, events);

/**
 * Create mobiles specified by config
 * @private
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
        // Pass 'self' as the event listener
        var th = new Thermostat(k, ts_config.getConfig(k));
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
    self.pin.HW.set(1, function() {
        self.pin.CH.set(0, function() {
            self.setPin("HW", 0, function() {
                done.call(self);
            });
        });
    });
};

/**
 * Create the rules defined in the configuration
 * @private
 */
Controller.prototype.createRules = function(config) {
    "use strict";
    var self = this;
    self.rule = [];
    config.each(function(k) {
        var r = config.getConfig(k);
        self.insert_rule(new Rule(r.get("name"), r.get("test")));
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
        mobile: sermap(this.mobile),
        rule: sermap(this.rule)
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
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 */
Controller.prototype.getSerialisableLog = function() {
    "use strict";

    var sermap = function(m) {
	var res = {};
	for (var k in m)
            res[k] = m[k].getSerialisableLog();
        return res;
    };

    return {
        thermostat: sermap(this.thermostat)
    };
};

/**
 * Set the on/off state of a pin. This is more sophisticated than a 
 * simple pin command, because there is a relationship between the state
 * of the pins in Y-plan systems that must be respected.
 * @param {String} channel e.g. "HW" or "CH"
 * @param {number} state 1 (on) or 0 (off)
 * @param {function} respond function called when state is set, no parameters
 * @access public
 */
Controller.prototype.setPin = function(channel, on, respond) {
    "use strict";

    var self = this;

    // Duck race condition during initialisation
    if (self.pin[channel] === "undefined")
        return;

    if (this.pending) {
        setTimeout(function() {
            self.setPin(channel, on, respond);
        }, VALVE_RETURN);
	return;
    }

    var cur = self.pin[channel].getState();
    if (on && cur === 1 || !on && cur === 0) {
        if (typeof respond !== "undefined")
            respond();
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
        this.pin.CH.set(0, function() {
            this.pin.HW.set(1, function() {
                self.pending = true;
                setTimeout(function() {
                    self.pending = false;
                    self.setPin(channel, on, respond);
                }, VALVE_RETURN);
            });
        });
    } else {
        // Otherwise this is a simple state transition, just
        // set the appropriate pin
        this.pin[channel].set(on, function() {
            if (typeof respond !== "undefined")
                respond();
        });
    }
};

/**
 * Look up a mobile by ID
 * @param {string} id id of mobile to look up
 * @return {Mobile} mobile found, or null
 * @access public
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
 * Handler for mobile state setting
 * @param info structure containing location in "latitude", "longitude",
 * device identifier in "device", and demand
 * @return location of server
 * @private
 */
Controller.prototype.setMobileState = function(info) {
    "use strict";
    var d = this.getMobile(info.device);
    if (d === null)
        throw TAG + " setMobileState: " + d + " not known" + new Error().stack;
    d.setState(info);
    var interval = d.estimateTOA(this);
    return {
        home_lat: Server.server.config.get("location").latitude,
        home_long: Server.server.config.get("location").longitude,
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
 * of the controller. Commands may be received from the server.
 *
 * The command set is very simple. Each command is delivered as a path
 * that contains a command-verb, such as "set" or "move_rule_up". The rest
 * of the path mirrors the structure of the controller configuration e.g.
 * "thermostat/HW/target" refers to the target setting on thermostat "HW".
 * Extra data, such as values, are passed in a structure that contains
 * command-specific fields.
 * @params {String} command the command verb
 * @params {array} path the command noun
 * @param {Object} data structure containing parameters
 * @param {function} callback passed the response data for serialisation
 */
Controller.prototype.dispatch = function(command, path, data, respond) {
    "use strict";

    var self = this;

    function getFunction(field) {
        var fn;
        eval("fn=" + field);
        return fn;
    }
    
    switch (command) {
    case "state": // Return the current system state
        respond(self.getSerialisableState());
        return;
    case "log":
        respond(self.getSerialisableLog());
        return;
    case "config": // Return the controller config
        respond(self.getSerialisableConfig());
        return;
    case "apis": // Return the apis config
        respond(Apis.getSerialisableConfig());
        return;
    case "remove_rule": // remove a rule
        // /rule/{index}
        self.remove_rule(parseInt(path[1]));
        self.emit("config_change");
        break;
    case "insert_rule": // insert a new rule
        self.insert_rule(
            new Rule(data.name, getFunction(data.test)));
        self.emit("config_change");
        break;
    case "move_up": // promote a rule in the evaluation order
        // /rule/{index}
        self.move_rule(parseInt(path[1]), -1);
        self.emit("config_change");
        break;
    case "move_down": // demote a rule
        // /rule/{index}
        self.move_rule(parseInt(path[1]), 1);
        self.emit("config_change");
        break;
    case "set": // change the configuration of a system element
        switch (path[0]) {
        case "rule":
            if (path[2] === "name")
                self.rule[parseInt(path[1])].name = data.value;
            else if (path[2] === "test")
                self.rule[parseInt(path[1])].setTest(data.value);
            self.emit("config_change");
            break;
        case "pin":
            self.setPin(path[1], data.value, respond);
            return;
        case "mobile":
            self.setMobileState(data, respond);
            return;
        // "rule":
        // "weather":
        }
        break;
    default:
        throw "Unrecognised command " + command;
    }
    // Default response is no reply
    respond();
    return;
};

/**
 * Get the index of a rule specified by name, object or index
 * @private
 */
Controller.prototype.getRuleIndex = function(i) {
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
 * Insert a rule at a given position in the order. Positions are
 * numbered from 0 (highest priority). To add a rule at the lowest
 * priority position, pass i=-1 (or i > max rule position)
 * @param rule {Rule} the rule, a hash with name: , test:
 * @param i {integer} the position to insert the rule at, or -1
 * (or undef) for the end
 * @return {integer} the position the rules was added at
 */
Controller.prototype.insert_rule = function(rule, i) {
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
    console.TRACE(TAG, "rule '" + this.rule[i].name
                  + "' inserted at " + rule.index);
    return i;
};

/**
 * Move a rule a specified number of places in the order
 * @param i the number (or name, or rule object) of the rule to delete
 * @param move {integer} number of places to move the rule, negative to move up,
 * positive to move down
 */
Controller.prototype.move_rule = function(i, move) {
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
    console.TRACE(TAG, this.name + " rule " + i + " moved to " + dest);
};

/**
 * Remove a rule
 * @param i the number (or name, or rule object) of the rule to delete
 * @return the removed rule function
 */
Controller.prototype.remove_rule = function(i) {
    "use strict";
    i = this.getRuleIndex(i);
    var del = this.rule.splice(i, 1);
    this.renumberRules();
    console.TRACE(TAG, this.name + " rule " + del[0].name
                  + "(" + i + ") removed");
    return del[0];
};

/**
 * Remove all rules
 */
Controller.prototype.clear_rules = function() {
    "use strict";
    console.TRACE(TAG, this.name + " rules cleared");
    this.rule = [];
};

/**
 * Reset the index of rules
 * @private
 */
Controller.prototype.renumberRules = function() {
    "use strict";

    for (var j = 0; j < this.rule.length; j++)
        this.rule[j].index = j;
};

/**
 * Evaluate rules at regular intervals. The evaluation of rules sets a
 * probability for a service - central heating or water - to be enabled.
 */
Controller.prototype.pollRules = function() {
    "use strict";
    var self = this;

    // Test each of the rules in order until one returns true,
    // then stop testing. This allows us to inject rules
    // before the standard set and override them completely.
    var remove = [];

    for (var i = 0; i < self.rule.length; i++) {
        var rule = self.rule[i];
        var result;
        try {
            result = rule.testfn.call(self);
        } catch (e) {
            console.TRACE(TAG, "rule '" + rule.name + "' failed: "
                          + e.message);
        }
        if (typeof result === "string") {
            if (result === "remove")
                remove.push(i);
        } else if (typeof result === "boolean" && result) {
            break;
        }
    }

    // Remove rules flagged for removal
    while (remove.length > 0) {
        i = remove.pop();
        console.TRACE(TAG, "Remove rule " + i);
        self.rule.splice(i, 1);
        self.renumberRules();
        self.emit("config_change");
    }

    setTimeout(function() {
        self.pollRules();
    }, RULE_INTERVAL);
};
