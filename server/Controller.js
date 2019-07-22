/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Util = require("util");
const Events = require("events").EventEmitter;
const Q = require("q");

const Utils = require("../common/Utils.js");
const DataModel = require("../common/DataModel.js");

const Thermostat = require("./Thermostat.js");
const Pin = require("./Pin.js");
const Rule = require("./Rule.js");
const Calendar = require("./Calendar");

const TAG = "Controller";

/**
 * Controller for a number of pins, thermostats, calendars, weather agents,
 * and the rules that manage the system state based on inputs from all these
 * elements.
 *
 * @param {object} proto prototype object
 * @class
 */
function Controller(proto) {
    Utils.extend(this, proto);
}
Util.inherits(Controller, Events);
module.exports = Controller;

Controller.Model = {
    $class: Controller,
    thermostat: {
        $doc: "Set of Thermostats",
        $map_of: Thermostat.Model
    },
    pin: {
        $doc: "Set of Pins",
        $map_of: Pin.Model
    },
    valve_return: {
        $doc: "Time to wait for the multiposition valve to return to the discharged state, in ms",
        $class: Number,
        $default: 8000
    },
    rule_interval: {
        $doc: "Frequency at which rules are re-evaluated, in ms",
        $class: Number,
        $default: 5000
    },
    rule: {
        $doc: "Set of Rules",
        $map_of: Rule.Model
    },
    calendar: {
        $doc: "Set of Calendars",
        $map_of: Calendar.Model
    },
    weather: {
        $doc: "Array of weather agents",
        // We don't know what class the agents are yet
        $map_of: {
            $skip: true
        }
    }
};

Controller.prototype.initialise = function () {
    "use strict";
    Utils.TRACE(TAG, "Initialising Controller");

    var self = this;
    self.poll = {
        timer: undefined
    };

    return Q()

        .then(function () {
            return self.initialisePins();
        })

        .then(function () {
            return self.resetValve();
        })

        .then(function () {
            return self.initialiseThermostats();
        })

        .then(function () {
            return self.initialiseRules();
        })

        .then(function () {
            return self.initialiseCalendars();
        })

        .then(function () {
            return self.createWeatherAgents();
        })

        .then(function () {
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
Controller.prototype.createWeatherAgents = function () {
    var self = this;
    var promise = Q();
    if (Object.keys(this.weather).length > 0) {
        Utils.TRACE(TAG, "Creating weather agents");
        this.weather.forEach(function (config, name) {
            var WeatherAgent = require("./" + name + ".js");
            self.weather[name] = new WeatherAgent(config);
            promise = promise.then(function () {
                return self.weather[name].initialise();
            });
        });
    }
    return promise;
};

/**
 * Add a request to a thermostat.
 * @param service themostat to add the request to, or "ALL" to add the request
 * to all thermostats.
 * @param id source of the request
 * @param target number giving the target temperature, possibly prefixed
 * by "BOOST ". If the boost prefix is present, a boost request is created.
 * @param until time at which the request expires, a pareseable date string or
 * if 'until' is "boost", then a boost request will be created, or if 'until'
 * is "now" the request will expire immediately.
 */
Controller.prototype.addRequest = function (service, id, target, until) {
    var remove = false, tgt;

    Utils.TRACE(TAG, "request ", service, " from ",
        id, " ", target, "C until ", until);

    // Parse the until
    if (typeof until === "string") {
        if (until === "now")
            remove = true;
        else if (until !== "boost")
            until = Date.parse(until);
    }

    // Parse the target
    var m = /^BOOST\s*(.*)$/i.exec(target);
    if (m) {
        until = "boost";
        tgt = m[1];
    } else
        tgt = target;

    if (/^OFF$/i.test(tgt))
        tgt = 0;
    else if (parseFloat(tgt) == NaN)
        throw new Utils.exception(TAG,
            "Cannot add request: ", service,
            " bad target temperature in '", target, "'");
    target = parseFloat(tgt);

    if (/^ALL$/i.test(service)) {
        this.thermostat.forEach(function (th) {
            if (remove)
                th.purgeRequests({
                    source: id
                });
            else
                th.addRequest(id, target, until);
        });
    } else if (!this.thermostat[service])
        throw new Utils.exception(TAG, "Cannot add request: ", service,
            " is not a known thermostat");
    else if (remove)
        this.thermostat[service].purgeRequests({
            source: id
        });
    else
        this.thermostat[service].addRequest(id, target, until);
};

/**
 * Attach handlers to calendars calendars
 * @param {Array} configs array of calendar configurations
 * @return {Promise} a promise. Calendar creation doesn't depend on this
 * promise, it will resolve immediately.
 * @private
 */
Controller.prototype.initialiseCalendars = function () {
    "use strict";

    Utils.TRACE(TAG, "Initialising Calendars");

    var self = this;
    this.calendar.forEach(function (cal) {
        cal.setTrigger(
            function (id, service, target, until) {
                self.addRequest(service, id, target, until);
            });
        cal.setRemove(
            function (id, service) {
                if (/^ALL$/i.test(service)) {
                    self.thermostat.forEach(function (th) {
                        th.purgeRequests({
                            source: id
                        });
                    });
                } else if (self.thermostat[service]) {
                    self.thermostat[service].purgeRequests({
                        source: id
                    });
                }

            });
        // Queue an asynchronous calendar update
        cal.update(1000);
    });

    return Q();
};

/**
 * Create pins as specified by configs
 * @param {Map} configs map of pin configurations
 * @return {Promise} a promise. Pins are ready for use when this promise
 * is resolved.
 * @private
 */
Controller.prototype.initialisePins = function () {
    "use strict";
    var self = this;

    Utils.TRACE(TAG, "Initialising Pins");
    var promise = Q();
    self.pin.forEach(function (pin) {
        promise = promise.then(function () {
            return pin.initialise();
        });
    });

    return promise;
};

/**
 * Promise to reset pins to a known state on startup.
 * @private
 */
Controller.prototype.resetValve = function () {
    var pins = this.pin;
    var promise = pins.HW.set(1, "Reset")

        .then(function () {
            Utils.TRACE(TAG, "Reset: HW(1) done");
        })

        .delay(this.valve_return)

        .then(function () {
            Utils.TRACE(TAG, "Reset: delay done");
            return pins.CH.set(0, "Reset");
        })

        .then(function () {
            Utils.TRACE(TAG, "Reset: CH(0) done");
            return pins.HW.set(0, "Reset");
        })

        .then(function () {
            Utils.TRACE(TAG, "Valve reset");
        })

        .catch(function (e) {
            Utils.ERROR(TAG, "Failed to reset valve: ", e);
        });

    return promise;
};

/**
 * Create thermostats as specified by config
 * @private
 */
Controller.prototype.initialiseThermostats = function () {
    "use strict";

    var promise = Q();

    Utils.TRACE(TAG, "Initialising Thermostats");

    this.thermostat.forEach(function (th) {
        promise = promise.then(function () {
            return th.initialise();
        });
    }, this);

    return promise.then(function () {
        Utils.TRACE(TAG, "Initialised thermostats");
    });
};

/**
 * Create the rules defined in the configuration
 * @param {Array} configs array of rule configurations
 * @return {Promise} a promise.
 * @private
 */
Controller.prototype.initialiseRules = function () {
    "use strict";
    var promise = Q();

    Utils.TRACE(TAG, "Initialising Rules");
    this.rule.forEach(function (rule) {
        promise = promise.then(function () {
            return rule.initialise();
        });
    });
    return promise;
};

/**
 * Set the location of the server
 */
Controller.prototype.setLocation = function (location) {
    "use strict";
    this.weather.forEach(function (wa) {
        wa.setLocation(location);
    });
};

/**
 * Generate and return a promise for a serialisable version of the structure,
 * suitable for use in an AJAX response.
 * @return {Promise} a promise
 */
Controller.prototype.getSerialisableState = function () {
    "use strict";

    var state = {
        time: Time.now() // local time
    };

    var promise = Q();

    // Should be able to do this using Q.all, but it doesn't do
    // what I expect
    this.forEach(function (block, field) {
        block.forEach(function (item, key) {
            if (typeof item.getSerialisableState === "function") {
                if (typeof state[field] === "undefined")
                    state[field] = {};
                promise = promise.then(function () {
                        return item.getSerialisableState();
                    })
                    .then(function (value) {
                        state[field][key] = value;
                    });
            }
        });
    });

    return promise.then(function () {
        return state;
    });
};

/**
 * Get the logs for a set
 * @param set  e.g. pin, thermostat, weather
 * @param since optional param giving start of logs as a ms datime
 * @private
 */
Controller.prototype.getSetLogs = function (set, since) {
    var promise = Q();
    var logset;

    set.forEach(function (item, key) {
        if (typeof item.getSerialisableLog === "function") {
            if (typeof logset === "undefined")
                logset = {};

            promise = promise.then(function () {
                    return item.getSerialisableLog(since);
                })

                .then(function (value) {
                    logset[key] = value;
                });
        }
    });

    return promise.then(function () {
        return logset;
    });
};

/**
 * Generate and promise to return a serialisable version of the
 * logs, suitable for use in an AJAX response.
 * @param since optional param giving start of logs as a ms datime
 * @return {object} a promise to create serialisable structure
 */
Controller.prototype.getSerialisableLog = function (since) {
    "use strict";

    var logs = {};

    var promise = Q();
    var self = this;

    this.forEach(function (block, field) {
        promise = promise.then(function () {
            return self.getSetLogs(self[field], since)
                .then(function (logset) {
                    if (typeof logset !== "undefined")
                        logs[field] = logset;
                });
        });
    });

    return promise.then(function () {
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
 */
Controller.prototype.setPromise = function (channel, new_state) {
    "use strict";
    var self = this;
    var pins = self.pin;

    // Duck race condition during initialisation
    if (pins[channel] === "undefined")
        return Q.promise(function () {});

    if (this.pending) {
        return Q.delay(self.valve_return).then(function () {
            return self.setPromise(channel, new_state);
        });
    }

    return pins[channel].getStatePromise()

        .then(function (cur_state) {
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
                var hw_state = pins.HW.getState();
                if (hw_state === 0) {
                    // HW is off, so switch off CH and switch on HW to kill
                    // the grey wire.
                    // This allows the spring to fully return. Then after a
                    // timeout, turn the CH on.
                    return pins.CH.set(0) // switch off CH
                        .then(function () {
                            return pins.HW.set(1); // switch on HW
                        })
                        .then(function () {
                            self.pending = true;
                            return Q.delay(self.valve_return); // wait for spring
                        })
                        .then(function () {
                            self.pending = false;
                            return pins.CH.set(0); // switch off CH
                        });
                }
            }
            // Otherwise this is a simple state transition, just
            // promise to set the appropriate pin
            return pins[channel].set(new_state);
        });
};

/**
 * Command handler for ajax commands, suitable for calling by a Server.
 * @params {array} path the url path components
 * @param {object} data structure containing parameters. These vary according
 * to the command (commands are documented in README.md)
 * @return a promise, passed an object for serialisation in the response
 */
Controller.prototype.dispatch = function (path, data) {
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
        Utils.TRACE(TAG, "log ", path);
        if (typeof path[0] === "undefined")
            return self.getSerialisableLog(data.since);
        if (typeof path[1] === "undefined")
            return self.getSetLogs(self[path[0]], data.since);
        return self[path[0]][path[1]].getSerialisableLog(data.since);
    case "getconfig":
        // /getconfig/path/to/config/node
        Utils.TRACE(TAG, "getconfig ", path);
        return DataModel.at(
            this, Controller.Model, path,
            function (data, model) {
                return DataModel.getSerialisable(data, model);
            });
    case "setconfig":
        // /setconfig/path/to/config/node, data.value is new setting
        DataModel.at(
            this, Controller.Model, path,
            function (item, model, parent, key) {
                if (typeof parent === "undefined" ||
                    typeof key === "undefined" ||
                    typeof item === "undefined")
                    throw new Utils.exception(
                        TAG,
                        "Cannot update ", path, ", insufficient context");
                parent[key] = DataModel.remodel(key, data.value, model, path);
                Utils.TRACE(TAG, "setconfig ", path, " = ", parent[key]);
                self.emit("config_change");
            });
        break;
    case "request":
        // Push a request onto a service (or all services). Requests may come
        // from external sources such as mobiles or browsers.
        // /request?source=;service=;target=;until=
        this.addRequest(data.service, data.source, data.target, data.until);
        self.pollRules();
        break;
    case "settime":
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
        Utils.TRACE(TAG, "Refresh calendars");
        for (var cal in this.calendar)
            this.calendar[cal].update(100);
        self.pollRules();
        break;
    default:
        throw new Utils.exception(TAG, "Unrecognised command ", command);
    }
    return Q.fcall(function () {
        return {
            status: "OK"
        };
    });
};

/**
 * Evaluate rules at regular intervals.
 * @private
 */
Controller.prototype.pollRules = function () {
    "use strict";
    var self = this;

    if (typeof self.poll.timer !== "undefined") {
        clearTimeout(self.poll.timer);
        self.poll.timer = undefined;
    }

    // Purge completed requests
    self.thermostat.forEach(function (th) {
        th.purgeRequests();
    });

    // Test each of the rules. Rule evaluation functions return a
    // promise to set a pin state, which is decided by reading the
    // thermostats. Requests in the thermostats may define a temperature
    // target, or if not the timeline is used.
    self.rule.forEach(function (rule) {
        if (typeof rule.testfn !== "function") {
            Utils.ERROR(TAG, "'", rule.name, "' cannot be evaluated");
            return true;
        }

        rule.testfn.call(self, self.thermostat, self.pin)
            .catch(function (e) {
                if (typeof e.stack !== "undefined")
                    Utils.ERROR(TAG, "'", rule.name, "' failed: ", e.stack);
                Utils.ERROR(TAG, "'", rule.name, "' failed: ", e.toString());
            });
    });

    // Queue the next poll
    self.poll.timer = setTimeout(function () {
        self.poll.timer = undefined;
        self.pollRules();
    }, self.rule_interval);
};
