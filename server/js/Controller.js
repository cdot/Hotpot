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

            this.poll = {
                timer: undefined
            };

            return this.initialisePins()

            .then(() => this.resetValve())

            .then(() => this.initialiseThermostats())

            .then(() => this.initialiseCalendars())

            .then(() => this.initialiseWeatherAgents())

            // Start the poll loop
            .then(() => this.pollRules());
        };

        /**
         * Create weather agents
         * @param {Array} configs array of weather agent configurations
         * @return {Promise} a promise. Agent creation doesn't depend on this
         * promise, it will resolve immediately.
         * @private
         */
        initialiseWeatherAgents() {
            let promises = [];
            for (let name in this.weather) {
                let config = this.weather[name];
                promises.push(this.weather[name].initialise());
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
                        }, true);
                    else
                        th.addRequest(id, target, until);
                }
            } else if (!this.thermostat[service])
                throw new Utils.exception(
					TAG, `Cannot add request, ${service} is not a known thermostat`);
            else if (remove)
                this.thermostat[service].purgeRequests({
                    source: id
                }, true);
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
                    (id, service, target, until) => {
                        this.addRequest(service, id, target, until);
                    });
                cal.setRemove(
                    (id, service) => {
                        if (/^ALL$/i.test(service)) {
                            for (let name in this.thermostat) {
                                let th = this.thermostat[name];
                                th.purgeRequests({
                                    source: id
                                }, true);
                            }
                        } else if (this.thermostat[service]) {
                            this.thermostat[service].purgeRequests({
                                source: id
                            }, true);
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
            return pins.HW.setState(1, "Reset")

            .then(() => {
                Utils.TRACE(TAG, "Reset: HW(1) done");
                return new Promise((resolve) => {
                    setTimeout(resolve, valve_back);
                });
            })

            .then(() => {
                Utils.TRACE(TAG, "Reset: delay done");
                return pins.CH.setState(0, "Reset");
            })

            .then(() => {
                Utils.TRACE(TAG, "Reset: CH(0) done");
                return pins.HW.setState(0, "Reset");
            })

            .then(() => {
                Utils.TRACE(TAG, "Valve reset");
            })

            .catch((e) => {
                Utils.TRACE(TAG, "Failed to reset valve: ", e);
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
					if (typeof item === "undefined")
						continue;
                    if (typeof item.getSerialisableState === "function") {
                        if (typeof state[field] === "undefined")
                            state[field] = {};
                        promises.push(
                            item.getSerialisableState()
                            .then((value) => {
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
        getLogsFor(set, since) {
            let promises = [];
            let logset;

            for (let key in set) {
                let item = set[key];
				if (typeof item !== "undefined"
					&& typeof item.getSerialisableLog === "function") {
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
            let promises = [];
            
            for (let field in this) {
                let block = this[field];
                promises.push(
                    this.getLogsFor(this[field], since)
                    .then((logset) => {
                        if (logset)
                            logs[field] = logset;
                    }));
            }

            return Promise.all(promises)
            .then(() => logs);
        };

        /**
         * Get a promise to set the on/off state of a pin, suitable for
         * calling from Rules. This is more
         * sophisticated than a simple `Pin.setState()` call, because there is a
         * relationship between the state of the pins in Y-plan systems
         * that must be respected.
         * @param {String} channel e.g. "HW" or "CH"
         * @param {number} state 1 (on) or 0 (off)
         */
        setPromise(channel, new_state) {
            let pins = this.pin;

            // Avoid race condition during initialisation
            if (pins[channel] === "undefined")
                return Promise.resolve();

            if (this.pending) {
                return new Promise((resolve) => {
                    setTimeout(() => resolve(this.setPromise(channel, new_state)),
							   this.valve_return);
                });
            }

            return pins[channel].getState()

            .then((cur_state) => {
                if (cur_state === new_state)
                    return Promise.resolve(); // already in the right state

                // Y-plan systems have a state where if the heating is
				// on but the hot water is off, and the heating is
				// turned off, then the grey wire to the valve (the
				// "hot water off" signal) is held high, stalling the
				// motor. They are designed for this so it's not a big
				// problem, but we can resolve it by briefly turning
				// on the hot water while we turn the heating off,
				// then turning it off again. That will allow the spring
				// to return, powering down the motor.

                if (channel === "CH" && cur_state === 1 && new_state === 0) {
                    // CH is on, and it's going off
                    return pins.HW.getState()
					.then((hw_state) => {
						// HW is on, so just turn CH off
						if (hw_state !== 0)
							return pins.CH.setState(new_state);
							
						// HW is 0 but CH is 1, so we're in state 3 (grey
						// live and white live).
						// Need to switch on HW to kill the grey wire.
						// This allows the spring to fully return. Then after a
						// timeout, turn CH off.
						this.pending = true;
						return pins.CH.setState(0) // switch off CH
						.then(() => pins.HW.setState(1)) // switch on HW
						// wait for spring return
						.then(() => new Promise((resolve) => setTimeout(resolve, this.valve_return)))
						.then(() => pins.HW.setState(0)) // switch off HW
						.then(() => { this.pending = false;	});
					});
                }
				
                // Otherwise this is a simple state transition, just
                // promise to set the appropriate pin
                return pins[channel].setState(new_state);
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
            let command = path.shift();

            switch (command) {
            case "state": // Return the current system state
                // /state
                this.pollRules();
                return this.getSerialisableState();
            case "trace": // Set tracing level
                // Set tracing
                Utils.TRACEwhat(data.trace);
                break;
            case "log":
                // /log[/{type}[/{name}]]
                Utils.TRACE(TAG, `log ${path}`);
                if (typeof path[0] === "undefined")
                    // Get all logs
                    return this.getSerialisableLog(data.since);
                if (typeof path[1] === "undefined")
                    // Get the logs of the given type
                    return this.getLogsFor(this[path[0]], data.since);
                // Get the log for the given object of the given type
                return this[path[0]][path[1]].getSerialisableLog(data.since);
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
                    return DataModel.remodel(p.key, data, p.model, path)
					.then((rebuilt) => {
						p.parent[p.key] = rebuilt;
						Utils.TRACE(TAG, `setconfig ${path} = ${rebuilt}`);
						this.emit("config_change");
						return { status: "OK" };
					});
                });
            case "request":
                // Push a request onto a service (or all services). Requests may come
                // from external sources such as browsers.
                // /request?source=;service=;target=;until=
				// source is an arbitrary string
				// service is the name of a thermostat, or "all"
				// target is a temperature number
				// until is an epoch-ms date, or Utils.BOOST
				if (data.until == "boost") data.until = Utils.BOOST;
				else if (data.until == "clear") data.until = Utils.CLEAR;
                this.addRequest(data.service, data.source, data.target, data.until);
                this.pollRules();
                break;
            /*case "settime":
                let tim = data.value;
                if (path[0] === "time") {
                    if (!tim || tim === "")
                        Time.unforce();
                    else
                        Time.force(tim);
                }
                break;*/
            case "refresh_calendars":
                // Force the refresh of all calendars (sent manually when one changes)
                // SMELL: could use push notification to do this, but that requires
                // a server host with a DNS entry so not bothered.
                // /refresh_calendars
                Utils.TRACE(TAG, "Refresh calendars");
                for (let cal in this.calendar)
                    this.calendar[cal].update(100);
                this.pollRules();
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
            
            if (typeof this.poll.timer !== "undefined") {
                clearTimeout(this.poll.timer);
                this.poll.timer = undefined;
            }

            // Purge completed requests
            for (let name in this.thermostat)
                this.thermostat[name].purgeRequests();

            // Test each of the rules. Rule evaluation functions
            // return a promise to set a pin state, which is decided
            // by reading the thermostats. Requests in the thermostats
            // may define a temperature target, or if not the timeline
            // is used.
			let promises = [];
            for (let name in this.rule) {
                let rule = this.rule[name];
                promises.push(rule.test(this));
            }

			Promise.all(promises)
			.then(() => {
				// Queue the next poll
				this.poll.timer = setTimeout(() => {
					this.poll.timer = undefined;
					this.pollRules();
				}, this.rule_interval);
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
