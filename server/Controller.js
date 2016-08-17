/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Util = require("util");
const Events = require("events").EventEmitter;  
const Q = require("q");

const Location = require("../common/Location.js");
const Utils = require("../common/Utils.js");

const Thermostat = require("./Thermostat.js");
const Pin = require("./Pin.js");
const Rule = require("./Rule.js");
const Mobile = require("./Mobile.js");
const Scheduled = require("./Scheduled");
const Apis = require("./Apis.js");

const TAG = "Controller";

// Time to wait for the multiposition valve to return to the discharged
// state, in ms
const VALVE_RETURN = 10000;

// Frequency at which rules are re-evaluated
const RULE_INTERVAL = 5000;

/**
 * Singleton controller for a number of pins, thermostats, mobile devices,
 * and the rules that manage the system state based on inputs from these
 * elements.
 * @param {Config} config Config object
 * @protected
 * @class
 */
function Controller(config) {
    this.config = config;
}
Util.inherits(Controller, Events);
module.exports = Controller;

Controller.prototype.initialise = function() {
    "use strict";
    Utils.TRACE(TAG, "Initialising Controller");

    var self = this;
    //self.location = undefined;

    return Q()

    .then(function() {
        return self.createRules(self.config.getConfig("rule"));
    })

    .then(function() {
        return self.createMobiles(self.config.getConfig("mobile"));
    })

    .then(function() {
        return self.createCalendars(self.config.getConfig("calendar"));
    })

    .then(function(e) {
        return self.createPins(self.config.getConfig("pin"));
    })

    .then(function() {
        return self.createThermostats(self.config.getConfig("thermostat"));
    })

    .then(function() {
        self.pollRules();
    });
};

/**
 * Create mobiles specified by config
 * @private
 */
Controller.prototype.createMobiles = function(mob_config) {
    "use strict";
    var self = this;

    return new Q.Promise(function(fulfill) {
        self.mobile = {};
        mob_config.each(function(id) {
            self.mobile[id] = new Mobile(
                id, mob_config.getConfig(id));
        });
        fulfill();
    });
};

Controller.prototype.createCalendars = function(cal_config) {
    "use strict";
    var self = this;

     return new Q.Promise(function(fulfill) {
        self.calendar = {};
        cal_config.each(function(id) {
            self.calendar[id] = new Scheduled(
                id, cal_config.getConfig(id));
            self.calendar[id].update(1000);
        });
        fulfill();
    });
};

/**
 * Create pins as specified by config
 * @private
 */
Controller.prototype.createPins = function(pin_config) {
    "use strict";
    var self = this;

    self.pin = {};

    var promises = Q();
    pin_config.each(function(k) {
        self.pin[k] = new Pin(k, pin_config.getConfig(k));
        promises = promises.then(function() {
            return self.pin[k].initialise();
        });
    });

    return promises;
};
    
/**
 * Create thermostats as specified by config
 * @private
 */
Controller.prototype.createThermostats = function(ts_config) {
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
    Utils.TRACE(TAG, "Constructed thermostats");
    var promise = self.pin.HW.set(1)

    .then(function() {
        Utils.TRACE(TAG, "Reset: HW(1) done");
    })

    .delay(VALVE_RETURN)

    .then(function() {
        Utils.TRACE(TAG, "Reset: delay done");
        return self.pin.CH.set(0);
    })

    .then(function() {
        Utils.TRACE(TAG, "Reset: CH(0) done");
        return self.pin.HW.set(0);
    })

    .then(function() {
        Utils.TRACE(TAG, "Reset: HW(0) done");
    })

    .catch(function(e) {
        console.ERROR(TAG, "Failed to reset valve: ", e);
    });

    return promise;
};

/**
 * Create the rules defined in the configuration
 * @private
 */
Controller.prototype.createRules = function(config) {
    "use strict";
    var self = this;

    var promise = Q();

    self.rule = [];
    config.each(function(k) {
        var r = config.getConfig(k);
        var rule = new Rule(r.get("name"));
        promise = promise.then(function() {
            if (r.has("from_file"))
                return rule.fromFile(r.get("from_file"));
            else
                return r.setTest(r.get("test"));
        })

        .then(function() {
            self.insert_rule(rule);
        });
    });
    return promise;
};

/**
 * Set the location of the server
 */
Controller.prototype.setLocation = function(location) {
    "use strict";
    this.location = location;
    for (var id in this.mobile) {
        this.mobile[id].setHomeLocation(location);
    }

    var weather_config = Apis.get("weather");
    if (typeof weather_config !== "undefined") {
        this.weather_agent = require("./" + weather_config.class + ".js");
        this.weather_agent.setLocation(location);
    }
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @param {boolean} ajax set true if this config is for AJAX
 * @return {object} a serialisable structure
 */
Controller.prototype.getSerialisableConfig = function(ajax) {
    "use strict";
    function sermap(m) {
	var res = {};
	for (var k in m)
            res[k] = m[k].getSerialisableConfig(ajax);
        return res;
    }

    return {
        location: this.location,
        thermostat: sermap(this.thermostat),
        pin: sermap(this.pin),
        mobile: sermap(this.mobile),
        calendar: sermap(this.calendar),
        rule: sermap(this.rule)
    };
};

/**
 * Generate and return a promise for a serialisable version of the structure,
 * suitable for use in an AJAX response.
 * @return {Promise} a promise
 */
Controller.prototype.getSerialisableState = function() {
    "use strict";

    var state = {
	time: Time.now(), // local time
        env_temp: this.weather("Temperature"),
        thermostat: {},
        pin: {},
        calendar: {},
        mobile: {}
    };
    
    var self = this;
    var promise = Q();

    function makePromise(field, k) {
        promise = promise.then(function() {
            return self[field][k].getSerialisableState();
        })

        .then(function(value) {
            state[field][k] = value;
        });
    }

    function makePromises(field) {
	for (var k in self[field])
            makePromise(field, k);
    }

    makePromises("thermostat");
    makePromises("pin");
    makePromises("calendar");
    makePromises("mobile");
 
    return promise.then(function() {
        return state;
    });
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 */
Controller.prototype.getSerialisableLog = function() {
    "use strict";

    var logs = { thermostat: {} };
    var self = this;

    var promise = Q();

    function makePromise(k) {
        promise = promise.then(function() {
            return self.thermostat[k].getSerialisableLog()
                .then(function(value) {
                    logs.thermostat[k] = value;
                });
        });
    }

    for (var t in self.thermostat)
        makePromise(t);

    return promise.then(function() {
        return logs;
    });
};

/**
 * Set the on/off state of a pin, and wait for it to complete.
 * @param {String} channel e.g. "HW" or "CH"
 * @param {number} state 1 (on) or 0 (off)
 * @access public
 */
Controller.prototype.setPin = function(channel, on) {
    this.setPromise(channel, on).done();
};

/**
 * Get a promise to set the on/off state of a pin. This is more
 * sophisticated than a simple pin command, because there is a
 * relationship between the state of the pins in Y-plan systems
 * that must be respected.
 * @param {String} channel e.g. "HW" or "CH"
 * @param {number} state 1 (on) or 0 (off)
 * @access public
 */
Controller.prototype.setPromise = function(channel, on) {
    "use strict";
    var self = this;

    // Duck race condition during initialisation
    if (self.pin[channel] === "undefined")
        return Q.promise(function() {});

    if (this.pending) {
        return Q.delay(VALVE_RETURN).then(function() {
            return self.setPin(channel, on);
        });
    }

    return self.pin[channel].getStatePromise()

    .then(function(cur) {
        if (on && cur === 1 || !on && cur === 0)
            return Q(); // no more promises

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
            return this.pin.CH.set(0)
            .then(function() {
                return this.pin.HW.set(1);
            })
            .then(function() {
                self.pending = true;
                return Q.delay(VALVE_RETURN);
            })
            .then(function() {
                self.pending = false;
                return self.pin[channel].set(on);
            });
        }
        // Otherwise this is a simple state transition, just
        // promise to set the appropriate pin
        return self.pin[channel].set(on);
    });
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
 * Handler for mobile command
 * @param info structure containing location in "lat", "lng",
 * device identifier in "device", and "requests" which maps a pin name to
 * a state (1 or 0). The request times out after the next request is due.
 * @return a promise that the command has been handled
 * @private
 */
Controller.prototype.handleMobileCommand = function(path, info) {
    "use strict";
    var self = this;
    var command = path.shift();

    Utils.TRACE(TAG, "mobile ", command, " ", info);

    var mob = this.getMobile(info.device);
    if (mob === null) {
        return Q.fcall(function() {
            throw "Mobile device '" + info.device + "' not known";
        });
    }

    if (typeof info.lat !== "undefined" && typeof info.lng !== "undefined") {
        mob.setLocation(info);
        Utils.TRACE(TAG, "Set location of ", mob.name, " @", mob.location);
    }

    switch (command) {
    case "config":
        var serv_loc = (typeof this.location !== "undefined")
            ? this.location : new Location();
        return Q.fcall(function() {
            return {
                lat: serv_loc.lat,
                lng: serv_loc.lng,
                fences: mob.getSerialisableConfig().fences
            };
        });

    case "request":
        // Push a request onto a pin
        var req = {
            state: parseInt(info.state),
            source: mob.name
        };
        if (typeof info.until !== "undefined")
            info.until = parseInt(info.until);
        Utils.TRACE(TAG, "Boost ", info.pin, " ", req);
        self.pin[info.pin].addRequest(req);
        break;

    case "crossing":
        // A fence was crossed
        mob.recordCrossing(info);
        break;
    }

    return Q.Promise(function(f) { f("OK"); });
};

/**
 * Get the current state of the weather for use in a rule
 */
Controller.prototype.weather = function(field) {
    "use strict";
    if (typeof this.weather_agent === "undefined")
        return 20; // random pick, if the agent isn't ready yet
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
 * @return a promise passed the response data for serialisation
 */
Controller.prototype.dispatch = function(command, path, data) {
    "use strict";
    var self = this;

    switch (command) {
    case "state": // Return the current system state
        return self.getSerialisableState();
    case "log":
        return Q.promise(function (f) { f(self.getSerialisableLog()); });
    case "config": // Return the controller config
        return Q.promise(function (f) { f(self.getSerialisableConfig(true)); });
    case "apis": // Return the apis config
        return Q.promise(function (f) { f(Apis.getSerialisableConfig(true)); });
    case "remove_rule": // remove a rule
        // /rule/{index}
        self.remove_rule(parseInt(path[1]));
        self.emit("config_change");
        break;
    case "insert_rule": // insert a new rule
        self.insert_rule(
            new Rule(data.name, Utils.safeEval(data.test)));
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
        if (path[0] === "pin")
            // set/pin
            return self.setPromise(path[1], data.value);

        // set/rule
        else if (path[0] === "rule") {
            if (path[1] === "name")
                self.rule[parseInt(path[1])].name = data.value;
            else if (path[1] === "test")
                self.rule[parseInt(path[1])].setTest(data.value);
            self.emit("config_change");
        }
        else
            throw new Error("Unrecognised command");
        break;
    case "mobile":
        // mobile has it's own commands, and deals with the response
        return self.handleMobileCommand(path, data);
    case "calendar":
        // Calendars need an update. Do them asynchronously.
        for (var cal in this.calendar)
            this.calendar[cal].update(1000);
        break;
    default:
        throw "Unrecognised command " + command;
    }
    return Q.fcall(function() { return "OK"; });
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
    Utils.TRACE(TAG, "Rule '", this.rule[i].name,
                  "' inserted at ", rule.index);
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
    Utils.TRACE(TAG, this.name, " rule ", i, " moved to ", dest);
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
    Utils.TRACE(TAG, this.name, " rule ", del[0].name,
                  "(", i, ") removed");
    return del[0];
};

/**
 * Remove all rules
 */
Controller.prototype.clear_rules = function() {
    "use strict";
    Utils.TRACE(TAG, this.name, " rules cleared");
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
        if (typeof rule.testfn !== "function") {
            console.ERROR(TAG, "'", rule.name, "' cannot be evaluated");
            continue;
        }
        var result;
        try {
            result = rule.testfn.call(self);
        } catch (e) {
            if (typeof e.stack !== "undefined")
                console.ERROR(TAG, "'", rule.name, "' failed: ", e.stack);
            console.ERROR(TAG, "'", rule.name, "' failed: " + e);
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
        Utils.TRACE(TAG, "Remove rule ", i);
        self.rule.splice(i, 1);
        self.renumberRules();
        self.emit("config_change");
    }

    Q.delay(RULE_INTERVAL).done(function() {
        self.pollRules();
    });
};
