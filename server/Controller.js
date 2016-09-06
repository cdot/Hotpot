/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Util = require("util");
const Events = require("events").EventEmitter;  
const Q = require("q");

const Utils = require("../common/Utils.js");
const Config = require("../common/Config.js");

const Thermostat = require("./Thermostat.js");
const Pin = require("./Pin.js");
const Rule = require("./Rule.js");

const TAG = "Controller";

// Time to wait for the multiposition valve to return to the discharged
// state, in ms
const VALVE_RETURN = 8000;

// Frequency at which rules are re-evaluated
const RULE_INTERVAL = 5000;

/**
 * Controller for a number of pins, thermostats, calendars, weather agents,
 * and the rules that manage the system state based on inputs from all these
 * elements.
 * @param {Config} config Config object
 * * `pin`: object mapping pin names to Pin configurations
 * * `thermostat`: object mapping thermostat names to Thermostat configurations
 * * `rule`: array of Rule configurations
 * * `calendar`: object mapping calendar names to Calendar configurations
 * * `weather`: object mapping weather agent names to their configurations
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

    return Q()

    .then(function() {
        return self.createPins(self.config.pin);
    })

    .then(function() {
        return self.resetValve();
    })

    .then(function() {
        return self.createThermostats(self.config.thermostat);
    })

    .then(function() {
        return self.createRules(self.config.rule);
    })

    .then(function() {
        return self.createCalendars(self.config.calendar);
    })

    .then(function() {
        return self.createWeatherAgents(self.config.weather);
    })

    .then(function() {
        self.pollRules();
    });
};

/**
 * Create weather agents
 * @param {Array} configs array of weather agent configurations
 * @return {Promise} a promise. Agent creation doesn't depend on this
 * promise, it will resolve immediately.
 * @private
 */
Controller.prototype.createWeatherAgents = function(configs) {
    this.weather = {};
    var promise = Q();

    if (Object.keys(configs).length > 0) {
        var self = this;
        Utils.forEach(configs, function(config, name) {
            var WeatherAgent = require("./" + name + ".js");
            self.weather[name] = new WeatherAgent(config);
            promise = promise.then(function() {
                return self.weather[name].initialise();
            })
        });
    }
    return promise;
};

/**
 * Create calendars
 * @param {Array} configs array of calendar configurations
 * @return {Promise} a promise. Calendar creation doesn't depend on this
 * promise, it will resolve immediately.
 * @private
 */
Controller.prototype.createCalendars = function(configs) {
    "use strict";

    this.calendar = {};

    if (Object.keys(configs).length > 0) {

        var self = this;
        Utils.forEach(configs, function(config, name) {
            var Calendar = require("./Calendar");
            self.calendar[name] = new Calendar(
                name, config,
                function(id, pin, state, until) {
                    self.addRequest(pin, id, state, until);
                },
                function(id, pin) {
                    self.removeRequests(pin, id);
                });
            // Queue an asynchronous calendar update
            self.calendar[name].update(1000);
        });
    }

    return Q();
};

/**
 * Create pins as specified by configs
 * @param {Map} configs map of pin configurations
 * @return {Promise} a promise. Pins are ready for use when this promise
 * is resolved.
 * @private
 */
Controller.prototype.createPins = function(configs) {
    "use strict";
    var self = this;

    self.pin = {};

    var promise = Q();
    Utils.forEach(configs, function(config, id) {
        self.pin[id] = new Pin(id, config);
        promise = promise.then(function() {
            return self.pin[id].initialise();
        });
    });

    return promise;
};

/**
 * Promise to reset pins to a known state on startup.
 * @private
 */
Controller.prototype.resetValve = function() {
    var self = this;
    var promise = this.pin.HW.set(1)

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
        Utils.TRACE(TAG, "Valve reset");
    })

    .catch(function(e) {
        Utils.ERROR(TAG, "Failed to reset valve: ", e);
    });

    return promise;
};

/**
 * Create thermostats as specified by config
 * @private
 */
Controller.prototype.createThermostats = function(configs) {
    "use strict";

    var self = this;
    var promise = Q();

    this.thermostat = {};
    Utils.forEach(configs, function(config, id) {
        self.thermostat[id] = new Thermostat(id, config);
        promise = promise.then(function() {
            return self.thermostat[id].initialise();
        });
    }, this);

    return promise.then(function() {
        Utils.TRACE(TAG, "Initialised thermostats");
    });
};

/**
 * Create the rules defined in the configuration
 * @param {Array} configs array of rule configurations
 * @return {Promise} a promise.
 * @private
 */
Controller.prototype.createRules = function(configs) {
    "use strict";
    var self = this;

    var promise = Q();

    self.rule = [];
    Utils.forEach(configs, function(config) {
        var rule = new Rule(config.name);
        self.addRule(rule, false);
        // Pull the initial test function in
        promise = promise.then(function() {
            return Config.fileableConfig(config, "test")
                .then(function(fn) {
                    rule.setTest(fn, config.test_file);
                });
        });
    });
    return promise;
};

/**
 * Set the location of the server
 */
Controller.prototype.setLocation = function(location) {
    "use strict";
    Utils.forEach(this.weather, function(wa) {
        wa.setLocation(location);
    });
};

/**
 * Generate and return a promise for a serialisable version of the structure,
 * suitable for use in an AJAX response.
 * @return {Promise} a promise
 */
Controller.prototype.getSerialisableState = function() {
    "use strict";

    var state = {
	time: Time.now() // local time
    };
    
    var promise = Q();

   Utils.forEach(this, function(block, field) {
       Utils.forEach(block, function(item, key) {
            if (typeof item.getSerialisableState === "function") {
                if (typeof state[field] === "undefined")
                    state[field] = {};
                promise = promise.then(function() {
                    return item.getSerialisableState();
                })
                .then(function(value) {
                    state[field][key] = value;
                });
            }
        });
    });
 
    return promise.then(function() {
        return state;
    });
};

/**
 * Get the logs for a type e.g. pin, thermostat, weather
 * @private
 */
Controller.prototype.getSetLogs = function(set) {
    var promise = Q();
    var logset;

    Utils.forEach(set, function(item, key) {
        if (typeof item.getSerialisableLog === "function") {
            if (typeof logset === "undefined")
                logset = {};

            promise = promise.then(function() {
                return item.getSerialisableLog();
            })

            .then(function(value) {
                logset[key] = value;
            });
        }
    });

    return promise.then(function() {
        return logset;
    });
};

/**
 * Generate and promise to return a serialisable version of the
 * logs, suitable for use in an AJAX response.
 * @return {object} a promise to create serialisable structure
 */
Controller.prototype.getSerialisableLog = function() {
    "use strict";

    var logs = {};

    var promise = Q();
    var self = this;

    Utils.forEach(this, function(block, field) {
        promise = promise.then(function() {
            return self.getSetLogs(self[field])
            .then(function(logset) {
                if (typeof logset !== "undefined")
                    logs[field] = logset;
            });
        });
    });

    return promise.then(function() {
        return logs;
    });
};

/**
 * Set the on/off state of a pin, suitable for calling from Rules.
 * This is more
 * sophisticated than a simple `Pin.set()` call, because there is a
 * relationship between the state of the pins in Y-plan systems
 * that must be respected.
 * @param {String} channel e.g. "HW" or "CH"
 * @param {number} state 1 (on) or 0 (off)
 */
Controller.prototype.setPin = function(channel, on) {
    this.setPromise(channel, on).done();
};

/**
 * Get a promise to call `setPin()`.
 * @param {String} channel e.g. "HW" or "CH"
 * @param {number} state 1 (on) or 0 (off)
 * @private
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
        var hw_state = self.pin.HW.getState();
        if (channel === "CH" && !on
            && hw_state === 1 && hw_state === 0) {
            return self.pin.CH.set(0)
            .then(function() {
                return self.pin.HW.set(1);
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
 * Add a Pin.Request to a pin (or all pins).
 * @param {String} pin pin name (or "ALL" for all pins)
 * @param {String} source source of the request
 * @param {int} state state to set (see Pin.addRequest)
 * @param {int} until (optional) epoch ms
 * @private
 */
Controller.prototype.addRequest = function(pin, source, state, until) {
    var req = {
        state: state,
        source: source,
        until: until
    };
    Utils.TRACE(TAG, "Add request ", pin, " ", req);
    if (pin === "ALL") {
        Utils.forEach(this.pin, function(p) {
            p.addRequest(req);
        });
    } else
        this.pin[pin].addRequest(req);
};

/**
 * Remove matching Pin.Requests from a pin.
 * @param {String} pin pin name (or "ALL" for all pins)
 * @param {String} source source of the request
 * @private
 */
Controller.prototype.removeRequests = function(pin, source) {
    Utils.TRACE(TAG, "Remove request ", pin, " ", source);
    if (pin === "ALL") {
        Utils.forEach(this.pin, function(p) {
            p.purgeRequests(undefined, source);
        });
    } else
        this.pin[pin].purgeRequests(undefined, source);
};

/**
 * Command handler for ajax commands, suitable for calling by a Server.
 * @params {array} path the url path components
 * @param {object} data structure containing parameters. These vary according
 * to the command (commands are documented in README.md)
 * @return a promise, passed an object for serialisation in the response
 */
Controller.prototype.dispatch = function(path, data) {
    "use strict";
    var self = this;
    var command = path.shift();

    switch (command) {
    case "state": // Return the current system state
        // /state
        return self.getSerialisableState();
    case "log":
        // /log[/{type}[/{name}]]
        if (typeof path[0] === "undefined")
            return self.getSerialisableLog();
        if (typeof path[1] === "undefined")
            return self.getSetLogs(self[path[0]]);
        return self[path[0]][path[1]].getSerialisableLog();
    case "config": // Return the config with all _file expanded
        // /config
        return Config.getSerialisable(this.config);
    case "remove_rule": // remove a rule
        // /remove_rule/{index}
        self.remove_rule(parseInt(path[0]));
        break;
    case "insert_rule": // insert a new rule at the end
        // /insert_rule?name=;test=;
        var r = new Rule(data.name);
        r.setTest(data.test);
        self.addRule(r, true);
        break;
    case "move_up": // promote a rule in the evaluation order
        // /move_up/{index}
        self.move_rule(parseInt(path[0]), -1);
        break;
    case "move_down": // demote a rule
        // /move_down/{index}
        self.move_rule(parseInt(path[0]), 1);
        break;
    case "set": // change the configuration of a system element
        // /set/pin/{name}?value=
        // Pretty useless! Rules will override it before you can blink.
        if (path[0] === "pin")
            return self.setPromise(path[1], data.value);

        // /set/rule/{index}/name?value=
        // /set/rule/{index}/test?value=
        else if (path[0] === "rule") {
            var i = parseInt(path[1]);
            if (i < 0 || i >= self.rule.length)
                throw "No rule " + i;
            if (path[2] === "name") {
                self.rule[i].name = data.value;
                self.config.rule[i].name = this.name;
                self.emit("config_change");
            } else if (path[2] === "test") {
                self.rule[i].setTest(data.value);
                Config.updateFileableConfig(
                    self.config.rule[i], "test", self.rule[i].testfn.toString())
                .then(function(config_changed) {
                    if (config_changed)
                        self.emit("config_change");
                });
            }
            else
                throw "Unrecognised set/rule command " + path[2];
        }
        else
            throw new Error("Unrecognised command");
        break;
    case "request":
        // Push a request onto a pin (or all pins). Requests may come
        // from external sources such as mobiles or browsers.
        // /request?source=;pin=;state=;until=
        var until = data.until;
        if (typeof until === "string")
            until = Date.parse(until);
        this.addRequest(data.pin, data.source,
                        parseInt(data.state), until);
        break;
    case "refresh_calendars":
        // Force the refresh of all calendars (sent manually when one changes)
        // SMELL: could use push notification to do this, but that requires
        // a server host with a DNS entry so not bothered.
        // /refresh_calendars
        for (var cal in this.calendar)
            this.calendar[cal].update(100);
        break;
    default:
        throw "Unrecognised command " + command;
    }
    return Q.fcall(function() { return { status: "OK" }; });
};

/**
 * Get the index of a rule specified by name, object or index.
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
 * Add a new rule to the end of the rule list.
 * @param rule {Rule} the rule
 * @param update_config true to update the configuration too (and cause it
 * to be saved)
 * @private
 */
Controller.prototype.addRule = function(rule, update_config) {
    "use strict";
    rule.index = this.rule.length;
    this.rule.push(rule);
    this.renumberRules();

    if (update_config) {
        this.config.rule.push(rule.getConfiguration());
        self.emit("config_change");
    }

    Utils.TRACE(TAG, "Rule '", rule.name, "' inserted at ", rule.index);
};

/**
 * Move a rule a specified number of places in the order.
 * @param i the number (or name, or rule object) of the rule to delete
 * @param move {integer} number of places to move the rule, negative to move up,
 * positive to move down
 * @private
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
    removed = this.config.rule.splice(i, 1);
    this.config.rule.splice(dest, 0, removed[0]);
    this.renumberRules();
    self.emit("config_change");
    Utils.TRACE(TAG, this.name, " rule ", i, " moved to ", dest);
};

/**
 * Remove a rule.
 * @param i the number (or name, or rule object) of the rule to delete
 * @return the removed rule function
 * @private
 */
Controller.prototype.remove_rule = function(i) {
    "use strict";
    i = this.getRuleIndex(i);
    var del = this.rule.splice(i, 1);
    this.config.rule.splice(i, 1);
    this.renumberRules();
    Utils.TRACE(TAG, this.name, " rule ", del[0].name,
                  "(", i, ") removed");
    self.emit("config_change");
    return del[0];
};

/**
 * Reset the index of rules.
 * @private
 */
Controller.prototype.renumberRules = function() {
    "use strict";
    for (var j = 0; j < this.rule.length; j++)
        this.rule[j].index = j;
};

/**
 * Evaluate rules at regular intervals.
 * @private
 */
Controller.prototype.pollRules = function() {
    "use strict";
    var self = this;

    // Test each of the rules in order until one returns true,
    // then stop testing. This allows us to inject rules
    // before the standard set and override them completely.
    var remove = [];
    Utils.forEach(self.rule, function(rule, i) {
        if (typeof rule.testfn !== "function") {
            Utils.ERROR(TAG, "'", rule.name, "' cannot be evaluated");
            return true;
        }
        var result;
        try {
            result = rule.testfn.call(self);
        } catch (e) {
            if (typeof e.stack !== "undefined")
                Utils.ERROR(TAG, "'", rule.name, "' failed: ", e.stack);
            Utils.ERROR(TAG, "'", rule.name, "' failed: ", e.toString());
        }
        // If a rule returns the string "remove", it will be
        // removed from the rules list
        if (typeof result === "string") {
            if (result === "remove")
                remove.push(i);
        } else if (typeof result === "boolean" && result) {
            return false;
        }
        return true;
    });

    // Remove rules flagged for removal
    while (remove.length > 0) {
        var ri = remove.pop();
        Utils.TRACE(TAG, "Remove rule ", ri);
        self.rule.splice(ri, 1);
        self.renumberRules();
        self.emit("config_change");
    }

    Q.delay(RULE_INTERVAL).done(function() {
        self.pollRules();
    });
};
