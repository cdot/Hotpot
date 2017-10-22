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
const Calendar = require("./Calendar");

const TAG = "Controller";

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
    this.config = Config.check("Controller", config, "", Controller.prototype.Config);
}
Util.inherits(Controller, Events);
module.exports = Controller;

Controller.prototype.Config = {
    thermostat: {
        $doc: "Set of Thermostats",
        $array_of: Thermostat.prototype.Config
    },
    pin: {
        $doc: "Set of Pins",
        $array_of: Pin.prototype.Config
    },
    valve_return: {
        $doc: "Time to wait for the multiposition valve to return to the discharged state, in ms",
        $type: "number",
        $default: 8000
    },
    rule_interval: {
        $doc: "Frequency at which rules are re-evaluated, in ms",
        $type: "number",
        $default: 5000
    },
    rule: {
        $doc: "Set of Rules",
        $array_of: Rule.prototype.Config
    },
    calendar: {
        $doc: "Set of Calendars",
        $array_of: Calendar.prototype.Config
    },
    weather: {
        $doc: "Array of weather agents",
        // We don't know what class the agents are yet
        $array_of: { $skip: true }
    }
};

Controller.prototype.initialise = function() {
    "use strict";
    Utils.TRACE(TAG, "Initialising Controller");

    var self = this;
    self.poll = {
        timer: undefined
    };
    
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

Controller.prototype.reconfigure = function() {
    var self = this;

    Utils.TRACE(TAG, "Refreshing rules");
    return self.createRules(self.config.rule)
    .then(function() {
        self.resetValve();
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
        Utils.TRACE(TAG, "Creating weather agents");
        var self = this;
        Utils.forEach(configs, function(config, name) {
            var WeatherAgent = require("./" + name + ".js");
            self.weather[name] = new WeatherAgent(config);
            promise = promise.then(function() {
                return self.weather[name].initialise();
            });
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
        Utils.TRACE(TAG, "Creating Calendars");

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

    Utils.TRACE(TAG, "Creating Pins");
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
    var promise = this.pin.HW.set(1, "Reset")

    .then(function() {
        Utils.TRACE(TAG, "Reset: HW(1) done");
    })

    .delay(self.config.valve_return)

    .then(function() {
        Utils.TRACE(TAG, "Reset: delay done");
        return self.pin.CH.set(0, "Reset");
    })

    .then(function() {
        Utils.TRACE(TAG, "Reset: CH(0) done");
        return self.pin.HW.set(0, "Reset");
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
    
    Utils.TRACE(TAG, "Creating Thermostats");
    
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
    Utils.TRACE(TAG, "Creating Rules");
    Utils.forEach(configs, function(config, id) {
        self.rule[id] = new Rule(id, config);
        promise = promise.then(function() {
            return self.rule[id].initialise();
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

    // Should be able to do this using Q.all, but it doesn't do
    // what I expect
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
 * Get the logs for a set
 * @param set  e.g. pin, thermostat, weather
 * @param since optional param giving start of logs as a ms datime
 * @private
 */
Controller.prototype.getSetLogs = function(set, since) {
    var promise = Q();
    var logset;

    Utils.forEach(set, function(item, key) {
        if (typeof item.getSerialisableLog === "function") {
            if (typeof logset === "undefined")
                logset = {};

            promise = promise.then(function() {
                return item.getSerialisableLog(since);
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
 * @param since optional param giving start of logs as a ms datime
 * @return {object} a promise to create serialisable structure
 */
Controller.prototype.getSerialisableLog = function(since) {
    "use strict";

    var logs = {};

    var promise = Q();
    var self = this;

    Utils.forEach(this, function(block, field) {
        promise = promise.then(function() {
            return self.getSetLogs(self[field], since)
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
 * Get a promise to set the on/off state of a pin, suitable for
 * calling from Rules. This is more
 * sophisticated than a simple `Pin.set()` call, because there is a
 * relationship between the state of the pins in Y-plan systems
 * that must be respected.
 * @param {String} channel e.g. "HW" or "CH"
 * @param {number} state 1 (on) or 0 (off)
 * @param {String} reason reason for the state
 */
Controller.prototype.setPromise = function(channel, new_state, reason) {
    "use strict";
    var self = this;

    // Duck race condition during initialisation
    if (self.pin[channel] === "undefined")
        return Q.promise(function() {});

    if (this.pending) {
        return Q.delay(self.config.valve_return).then(function() {
            return self.setPromise(channel, new_state, reason);
        });
    }

    return self.pin[channel].getStatePromise()

    .then(function(cur_state) {
        if (cur_state === new_state) {
            return Q(); // already in the right state
        }

        // Y-plan systems have a state where if the heating is on but the
        // hot water is off, and the heating is turned off, then the grey
        // wire to the valve (the "hot water off" signal) is held high,
        // stalling the motor and consuming power pointlessly. We need some
        // special processing to avoid this state.

        if (cur_state === 1 && channel === "CH" && new_state === 0) {
            // CH is on, and it's going off
            var hw_state = self.pin.HW.getState();
            if (hw_state === 0) {
                // HW is off, so switch off CH and switch on HW to kill
                // the grey wire.
                // This allows the spring to fully return. Then after a
                // timeout, turn the CH on.
                return self.pin.CH.set(0, reason) // switch off CH
                .then(function() {
                    return self.pin.HW.set(1, reason); // switch on HW
                })
                .then(function() {
                    self.pending = true;
                    return Q.delay(self.config.valve_return); // wait for spring
                })
                .then(function() {
                    self.pending = false;
                    return self.pin.CH.set(0, reason); // switch off CH
                });
            }
        }
        // Otherwise this is a simple state transition, just
        // promise to set the appropriate pin
        return self.pin[channel].set(new_state, reason);
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
    } else if (typeof this.pin[pin] !== "undefined")
        this.pin[pin].addRequest(req);
    else
        Utils.ERROR(TAG, "Cannot addRequest; No such pin '" + pin + "'");
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
    } else if (typeof this.pin[pin] !== "undefined")
        this.pin[pin].purgeRequests(undefined, source);
    else
        Utils.ERROR(TAG, "Cannot addRequest; No such pin '" + pin + "'");
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
        self.pollRules();
        return self.getSerialisableState();
    case "trace": // Set tracing level
        // Set trace level
        Utils.TRACE(TAG, "Set TRACE ", data.trace);
        Utils.setTRACE(data.trace);
        break;
    case "log":
        // /log[/{type}[/{name}]]
        if (typeof path[0] === "undefined")
            return self.getSerialisableLog(data.since);
        if (typeof path[1] === "undefined")
            return self.getSetLogs(self[path[0]], data.since);
        return self[path[0]][path[1]].getSerialisableLog(data.since);
    case "config": // Return the config with all _file expanded
        // /config
        return Config.getSerialisable(this.config);
    case "request":
        // Push a request onto a pin (or all pins). Requests may come
        // from external sources such as mobiles or browsers.
        // /request?source=;pin=;state=;until=
        var until = data.until;
        if (typeof until === "string")
            until = Date.parse(until);
        this.addRequest(data.pin, data.source,
                        parseInt(data.state), until);
        self.pollRules();
        break;
    case "restart":
        self.emit("config_refresh");
        break;
    case "set":
        var tim = data.value;
        if (path[0] === "time") {
            if (!tim || tim === "")
                Time.unforce();
            else
                Time.force(tim);
        }
        break;
    case "refresh_calendars":
        // Force the refresh of all calendars (sent manually when one changes)
        // SMELL: could use push notification to do this, but that requires
        // a server host with a DNS entry so not bothered.
        // /refresh_calendars
        for (var cal in this.calendar)
            this.calendar[cal].update(100);
        self.pollRules();
        break;
    default:
        throw "Unrecognised command " + command;
    }
    return Q.fcall(function() { return { status: "OK" }; });
};

/**
 * Evaluate rules at regular intervals.
 * @private
 */
Controller.prototype.pollRules = function() {
    "use strict";
    var self = this;

    if (typeof self.poll.timer !== "undefined") {
        clearTimeout(self.poll.timer);
        self.poll.timer = undefined;
    }

    // Test each of the rules
    Utils.forEach(self.rule, function(rule) {
        if (typeof rule.testfn !== "function") {
            Utils.ERROR(TAG, "'", rule.name, "' cannot be evaluated");
            return true;
        }

        rule.testfn.call(self)
        .catch(function(e) {
            if (typeof e.stack !== "undefined")
                Utils.ERROR(TAG, "'", rule.name, "' failed: ", e.stack);
            Utils.ERROR(TAG, "'", rule.name, "' failed: ", e.toString());
        });
    });

    // Queue the next poll
    self.poll.timer = setTimeout(function () {
        self.poll.timer = undefined;
        self.pollRules();
    }, self.config.rule_interval);
};
