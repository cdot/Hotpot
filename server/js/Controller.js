/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
define("server/js/Controller", ["events", "common/js/Utils", "common/js/DataModel", "common/js/Time", "server/js/Thermostat", "server/js/Pin", "server/js/Rule", "server/js/GoogleCalendar"], function(Events, Utils, DataModel, Time, Thermostat, Pin, Rule, Calendar) {

    const TAG = "Controller";

    /**
     * Controller for a number of pins, thermostats, calendars, weather agents,
     * and the rules that manage the system state based on inputs from all these
     * elements.
     *
     * @param {object} proto prototype object
     * @class
     */
    class Controller extends Events.EventEmitter {

        constructor(proto) {
            super();
            Utils.extend(this, proto);
        }

        initialise() {
            Utils.TRACE(TAG, "Initialising Controller");

            let self = this;
            self.poll = {
                timer: undefined
            };

            return this.initialisePins()

            .then(() => {
                return this.resetValve();
            })

            .then(() => {
                return this.initialiseThermostats();
            })

            .then(() => {
                return this.initialiseCalendars();
            })

            .then(() => {
                return this.initialiseWeatherAgents();
            })

            .then(() => {
                // Start the poll loop
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
        initialiseWeatherAgents() {
            let self = this;
            let promises = [];
            for (let name in this.weather) {
                let config = this.weather[name];
                promises.push(self.weather[name].initialise());
            }
            return Promise.all(promises).then(() => {
                Utils.TRACE(TAG, "Initialised Weather Agents");
            });
        };

        /**
         * Add a request to a thermostat.
         * @param service themostat to add the request to, or "ALL" to add the request
         * to all thermostats.
         * @param id source of the request e.g. "ajax"
         * @param target number giving the target temperature.
         * @param until time at which the request expires (epoch ms) or
		 * Utils.BOOST, in which case a boost request will be created.
         */
        addRequest(service, id, target, until) {
            let remove = (until == Utils.CLEAR), tgt;

            Utils.TRACE(TAG, `request ${service} from ${id} ${target}C until `,
						(until == Utils.BOOST) ? "boosted" :
						(until == Utils.CLEAR) ? "CLEAR" : until);

            if (/^ALL$/i.test(service)) {
                for (let name in this.thermostat) {
                    let th = this.thermostat[name];
                    if (remove)
                        th.purgeRequests({
                            source: id
                        });
                    else
                        th.addRequest(id, target, until);
                }
            } else if (!this.thermostat[service])
                throw new Utils.exception(
					TAG, `Cannot add request, ${service} is not a known thermostat`);
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
        initialiseCalendars() {

            Utils.TRACE(TAG, "Initialising Calendars");

            for (let name in this.calendar) {
                let cal = this.calendar[name];
                cal.setTrigger(
                    function (id, service, target, until) {
                        self.addRequest(service, id, target, until);
                    });
                cal.setRemove(
                    function (id, service) {
                        if (/^ALL$/i.test(service)) {
                            for (let name in this.thermostat) {
                                let th = this.thermostat[name];
                                th.purgeRequests({
                                    source: id
                                });
                            }
                        } else if (self.thermostat[service]) {
                            self.thermostat[service].purgeRequests({
                                source: id
                            });
                        }

                    });
                // Queue an asynchronous calendar update
                cal.update(1000);
            }

            Utils.TRACE(TAG, "Initialised Calendars");
            return Promise.resolve();
        };

        /**
         * Create pins as specified by configs
         * @param {Map} configs map of pin configurations
         * @return {Promise} a promise. Pins are ready for use when this promise
         * is resolved.
         * @private
         */
        initialisePins() {
            let promises = [];
			Utils.TRACE(TAG, "Initialising Pins", this.pin);
            for (let name in this.pin)
                promises.push(this.pin[name].initialise());
            return Promise.all(promises).then(() => {
                Utils.TRACE(TAG, "Initialised pins");
            });
        }

        /**
         * Promise to reset pins to a known state on startup.
         * @private
         */
        resetValve() {
            let pins = this.pin;
			let valve_back = this.valve_return;
			
            Utils.TRACE(TAG, "Resetting valve");
            return pins.HW.set(1, "Reset")

            .then(() => {
                Utils.TRACE(TAG, "Reset: HW(1) done");
                return new Promise((resolve) => {
                    setTimeout(resolve, valve_back);
                });
            })

            .then(() => {
                Utils.TRACE(TAG, "Reset: delay done");
                return pins.CH.set(0, "Reset");
            })

            .then(() => {
                Utils.TRACE(TAG, "Reset: CH(0) done");
                return pins.HW.set(0, "Reset");
            })

            .then(() => {
                Utils.TRACE(TAG, "Valve reset");
            })

            .catch(function (e) {
                Utils.ERROR(TAG, "Failed to reset valve: ", e);
            });
        }

        /**
         * Create thermostats as specified by config
         * @private
         */
        initialiseThermostats() {
            let promises = [];
            for (let name in this.thermostat) {
                promises.push(
					this.thermostat[name].initialise()
					.then((th) => th.poll()));
            }
            return Promise.all(promises).then(() => {
                Utils.TRACE(TAG, "Initialised thermostats");
            });
        };

        /**
         * Set the location of the server
         */
        setLocation(location) {
            for (let name in this.weather) {
                this.weather[name].setLocation(location);
            }
        };

        /**
         * Generate and return a promise for a serialisable version of
         * the structure, suitable for use in an AJAX response.
         * @return {Promise} a promise
         */
        getSerialisableState() {

            let state = {
                time: Time.now() // local time
            };

            let promises = [];

            for (let field in this) {
                let block = this[field];
                for (let key in block) {
                    let item = block[key];
                    if (typeof item.getSerialisableState === "function") {
                        if (typeof state[field] === "undefined")
                            state[field] = {};
                        promises.push(
                            item.getSerialisableState()
                            .then(function (value) {
                                state[field][key] = value;
                                return field;
                            }));
                    }
                }
            }

            return Promise.all(promises)
            .then((p) => {
                return state;
            });
        };

        /**
         * Get the logs for a set
         * @param set  e.g. pin, thermostat, weather
         * @param since optional param giving start of logs as a ms datime
         * @private
         */
        getSetLogs(set, since) {
            let promises = [];
            let logset;

            for (let key in set) {
                let item = set[key];
                if (typeof item.getSerialisableLog === "function") {
                    promises.push(
                        item.getSerialisableLog(since)
                        .then((value) => {
                            if (!logset)
                                logset = {};
                            logset[key] = value;
                        }));
                }
            }

            return Promise.all(promises).then(() => logset);
        };

        /**
         * Generate and promise to return a serialisable version of the
         * logs, suitable for use in an AJAX response.
         * @param since optional param giving start of logs as a ms datime
         * @return {object} a promise to create serialisable structure
         */
        getSerialisableLog(since) {

            let logs = {};
            let self = this;
            let promises = [];
            
            for (let field in this) {
                let block = this[field];
                promises.push(
                    self.getSetLogs(self[field], since)
                    .then(function (logset) {
                        if (logset)
                            logs[field] = logset;
                    }));
            }

            return Promise.all(promises)
            .then(function () {
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
        setPromise(channel, new_state) {
            let self = this;
            let pins = self.pin;

            // Avoid race condition during initialisation
            if (pins[channel] === "undefined")
                return Promise.resolve();

            if (this.pending) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(self.setPromise(channel, new_state));
                    }, self.valve_return);
                });
            }

            return pins[channel].getState()

            .then(function (cur_state) {
                if (cur_state === new_state) {
                    return Promise.resolve(); // already in the right state
                }

                // Y-plan systems have a state where if the heating is
				// on but the hot water is off, and the heating is
				// turned off, then the grey wire to the valve (the
				// "hot water off" signal) is held high, stalling the
				// motor and consuming power pointlessly. We need some
				// special processing to avoid this state.

                if (cur_state === 1 && channel === "CH" && new_state === 0) {
                    // CH is on, and it's going off
                    return pins.HW.getState()
					.then((hw_state) => {
						if (hw_state !== 0)
							return pins[channel].set(new_state);
							
						// HW is off, so switch off CH and switch on HW to kill
						// the grey wire.
						// This allows the spring to fully return. Then after a
						// timeout, turn the CH on.
						return pins.CH.set(0) // switch off CH
						.then(() => {
							return pins.HW.set(1); // switch on HW
						})
						.then(() => {
							self.pending = true;
							return new Promise((resolve) => {
								setTimeout(resolve, self.valve_return);
							}); // wait for spring
						})
						.then(() => {
							self.pending = false;
							return pins.CH.set(0); // switch off CH
						});
					});
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
         * @return a promise that resolves to an object for serialisation in the response
         */
        dispatch(path, data) {
            let self = this;
            let command = path.shift();

            switch (command) {
            case "state": // Return the current system state
                // /state
                self.pollRules();
                return self.getSerialisableState();
            case "trace": // Set tracing level
                // Set trace level
                Utils.setTRACE(data.trace);
                break;
            case "log":
                // /log[/{type}[/{name}]]
                Utils.TRACE(TAG, `log ${path}`);
                if (typeof path[0] === "undefined")
                    // Get all logs
                    return self.getSerialisableLog(data.since);
                if (typeof path[1] === "undefined")
                    // Get the logs of the given type
                    return self.getSetLogs(self[path[0]], data.since);
                // Get the log for the given object of the given type
                return self[path[0]][path[1]].getSerialisableLog(data.since);
            case "getconfig":
                // /getconfig/path/to/config/node
                Utils.TRACE(TAG, `getconfig ${path}`);
                return DataModel.at(this, Controller.Model, path)
				.then((p) => DataModel.getSerialisable(p.node, p.model));
            case "setconfig":
                // /setconfig/path/to/config/node, data.value is new setting
                return DataModel.at(this, Controller.Model, path)
				.then((p) => {
                    if (typeof p.parent === "undefined" ||
                        typeof p.key === "undefined" ||
                        typeof p.node === "undefined")
                        throw new Utils.exception(
                            TAG,
                            `Cannot update ${path}, insufficient context`);
                    return DataModel.remodel(p.key, data.value, p.model, path);
				}).then((rebuilt) => {
					p.parent[p.key] = rebuilt;
					Utils.TRACE(TAG, `setconfig ${path} = ${parent[p.key]}`);
					self.emit("config_change");
					return { status: "OK" };
                });
            case "request":
                // Push a request onto a service (or all services). Requests may come
                // from external sources such as browsers.
                // /request?source=;service=;target=;until=
				// source is an arbitrary string
				// service is the name of a thermostat, or "all"
				// target is a temperature number
				// until is an epoch-ms date, or Utils.BOOST
                this.addRequest(data.service, data.source, data.target, data.until);
                self.pollRules();
                break;
            case "settime":
                let tim = data.value;
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
                for (let cal in this.calendar)
                    this.calendar[cal].update(100);
                self.pollRules();
                break;
            default:
                throw new Utils.exception(TAG, `Unrecognised command ${command}`);
            }
            return Promise.resolve({
                status: "OK"
            });
        };

        /**
         * Evaluate rules at regular intervals.
         * @private
         */
        pollRules() {
            let self = this;
            
            if (typeof self.poll.timer !== "undefined") {
                clearTimeout(self.poll.timer);
                self.poll.timer = undefined;
            }

            // Purge completed requests
            for (let name in self.thermostat)
                self.thermostat[name].purgeRequests();

            // Test each of the rules. Rule evaluation functions
            // return a promise to set a pin state, which is decided
            // by reading the thermostats. Requests in the thermostats
            // may define a temperature target, or if not the timeline
            // is used.
			let promises = [];
            for (let name in self.rule) {
                let rule = self.rule[name];
                promises.push(rule.test(self));
            }

			Promise.all(promises)
			.then(() => {
				// Queue the next poll
				self.poll.timer = setTimeout(() => {
					self.poll.timer = undefined;
					self.pollRules();
				}, self.rule_interval);
			});
        }
    }
    
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
            $map_of: { $instantiable: true }
        },
        calendar: {
            $doc: "Set of Calendars e.g. $instance_of:`GoogleCalendar`",
            $map_of: { $instantiable: true }
        },
        weather: {
            $doc: "Set of weather agents e.g. $instance_of:`MetOffice`",
            // We don't know what class the agents are yet
            $map_of: { $instantiable: true }
        }
    };

    return Controller;
});
