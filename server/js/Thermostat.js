/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("server/js/Thermostat", ["common/js/Utils", "common/js/Time", "common/js/Timeline", "server/js/DS18x20", "server/js/Historian"], function(Utils, Time, Timeline, DS18x20, Historian) {

    const TAG = "Thermostat";

    // Default interval between polls
    const DEFAULT_POLL_INTERVAL = 20; // seconds

	// If there has been no response from the sensor in this time, email an
	// alarm to the admin
	const NO_RESPONSE_ALARM = 10 * 60 * 1000; // 10 mins in ms

    /**
     * Interface to a DS18x20 thermostat. This object takes care of polling the
     * device for regular temperature updates that can then be read from the
     * object.
     *
     * A thermostat also maintains one or more Requests. These are used to
     * record a requirement for a target temperature for a thermostat:
     * ```
     * Request {
     *   until: epoch ms
     *   target: number,
     *   source: string
     * }
     * ```
     * Requests have an `until` field that is used to set the expiry of the
     * request.
     *
     * If 'until' is Utils.BOOST, then that is used to bring a thermostat up
     * to a target temperature and then revert to the rules.
     *
     * target gives the target temperature for the thermostat, overriding the
     * temperature from the timeline.
     *
     * Where two sources both request different targets, then the request that
     * expires first applies. If they both expire at the same time, then the
     * most recent request received applies.
     *
     * @class
     */
    class Thermostat {

        /**
         * @param name {String} name by which the caller identifies the thermostat
         * @param proto configuration for the thermostat - see
         * Thermostat.Model
         */
        constructor(proto, name) {

            Utils.extend(this, proto);

            // Name of the thermostat e.g. "HW"
            this.name = name;

            /** @property {object} requests map of lists of requests, one per service
             * (see #addRequest) */
            this.requests = [];

            // Load the driver asynchronously
            this.sensor = new DS18x20(this.id);

            // Last recorded temperature {float}
            this.temperature = 0;

			// Remember the time of the last known good sample
			this.lastKnownGood = Date.now();

            // Temperature history, sample on a time schedule
            let hc = this.history;
            if (typeof hc !== "undefined") {
                if (typeof hc.interval === "undefined")
                    hc.interval = 300; // 5 minutes
            }
        }

        /**
         * Return a promise to intiialise the thermostat with a valid value read
         * from the probe. The promise resolves to the Thermostat.
         */
        initialise() {
            return new Promise(resolve => {
				this.sensor.initialiseSensor()
				.then(s => s.getTemperature())
				.then(t => resolve(t))
				.catch(e => {
					console.error(`Thermostat ${this.id} initialisation failed ${e}`);
					if (typeof HOTPOT_DEBUG === "undefined") {
						console.error("--debug not enabled");
						// Don't do this, it raises an unhandled reject
						// throw e;
						// Do this instead:
						resolve(100);
						// that will make hotpot turn the relevant service on.
						// The temperature ultimately is limited by the hard
						// thermostats, so we don't risk anything by this.
					} else {
						// Fall back to debug
						this.sensor = HOTPOT_DEBUG.getService(this.name);
						console.error(`Falling back to debug service for thermostat '${this.name}'`);
						resolve(this.sensor.getTemperature());
					}
				});
			})
			.then(temp => {
                this.temperature = temp;
                // Start the historian
                if (this.history) {
					Utils.TRACE(TAG, `starting historian for '${this.name}' at ${temp}`);
                    this.history.start(() => {
						return Math.round(this.temperature * 10) / 10;
					});
				}
                Utils.TRACE(TAG, `'${this.name}' initialised`);
				return this;
            })
        };

        /**
         * Generate and return a promise for a serialisable version of the state
         * of the object, suitable for use in an AJAX response.
         * @return {Promise} a promise
         * @protected
         */
        getSerialisableState() {
            this.purgeRequests();
            return Promise.resolve({
                temperature: this.temperature,
				lastKnownGood: this.lastKnownGood,
                target: this.getTargetTemperature(),
                requests: this.requests
            });
        };

        /**
         * Synchronously get the temperature history of the thermostat as a
         * serialisable structure. Note that the history is sampled at intervals,
         * but not every sample time will have a event. The history is only
         * updated if the temperature changes.
         * @return {Promise} promise to get an array of alternating times and
         * temps. Times are all relative to a base time, which is in the first
         * array element.
         * @param since optional param giving start of logs as a ms datime
         * @protected
         */
        getSerialisableLog(since) {
            if (this.history)
				return this.history.getSerialisableHistory(since);
            return Promise.resolve();
        }

		/**
		 * Set a handler to be invoked if there's a problem requiring
		 * an admin alert
		 */
		setAlertHandler(func) {
			this.alertHandler = func;
		}

        /**
         * Return a promise to start polling thermometers
         * Thermostats are polled every <poll interval> seconds for
		 * new values; results are cached in the Thermostat object.
		 *
         * The promise resolves to the Thermostat.
         */
        poll() {
			delete this.pollTimer;
            return this.sensor.getTemperature()
			.then(temp => {
				Utils.TRACE(TAG, `${this.id} now ${temp}`);
                this.temperature = temp;
				this.lastKnownGood = Date.now();
				this.alerted = false;
				return this;
			})

			// If we didn't get a useable reading, use the last
			// temperature returned. Log how long it's been since we
			// last got a known-good reading.
			.catch(e => {
				let waiting = Date.now() - this.lastKnownGood;
				let mess = `${this.name} sensor ${this.id} has had no reading for ${Time.formatDelta(waiting)}`;
				console.error(mess);
				if (this.alerted || waiting < NO_RESPONSE_ALARM)
					return this;
				if (typeof this.alertHandler === "function")
					this.alertHandler(mess);
				this.alerted = true;
				return this;
			})

			.finally(() => {
				if (this.interrupted) {
					Utils.TRACE(TAG, `'${this.name}' interrupted`);
					this.interrupted = false;
					return;
				}
				this.pollTimer = Utils.startTimer(
					`poll${this.name}`,
					() => this.poll(),
					1000 * (this.poll_every || DEFAULT_POLL_INTERVAL));
            });
        };

		/**
		 * Interrupt the temperature polling
		 */
		stop() {
			if (this.pollTimer) {
				Utils.TRACE(
					TAG, `'${this.name}' interrupted ${this.pollTimer}`);
				Utils.cancelTimer(this.pollTimer)
				delete this.pollTimer;
			}
			if (this.history)
				this.history.stop();
		}

        /**
         * Get the target temperature specified by the timeline or active boost
         * request for this thermostat at the current time.
         */
        getTargetTemperature() {
            this.purgeRequests();
            if (this.requests.length > 0) {
                for (let i = this.requests.length - 1; i >= 0; i--)
                    if (this.requests[i].until == Utils.BOOST)
                        // The current boost request
                        return this.requests[i].target;
                // Otherwise the most recently-added request
                return this.requests[this.requests.length - 1].target;
            }
            let t;
            try {
                t = this.timeline.valueAtTime(Date.now() - Time.midnight());
            } catch (e) {
                Utils.TRACE(TAG, e, "\n",
                            typeof e.stack !== "undefined" ? e.stack : e);
                t = 0;
            }
            return t;
        };

        /**
         * Get the maximum temperature allowed by the timeline or active boost
         * requests for this thermostat at any time.
         */
        getMaximumTemperature() {
            let max = this.timeline.getMaxValue();
            // If there's a promise to a higher temperature, honour it.
            if (this.requests.length > 0) {
                for (let i = this.requests.length - 1; i >= 0; i--)
                    if (this.requests[i].target > max)
                        max = this.requests[i].target;
            }
            return max;
        };

        /**
         * Add a request. A request is an override for rules that suspends the
         * normal rules either for a period of time ('until' is a number), or until
         * the rules purge the request. A controller may have multiple requests, but
         * only one request from each source is kept.
         * When it adds a request it purges all existing requests from the same source
         * before adding the new request.
         * Where multiple sources have active request on the same service, then the
         * service resolves which requests win.
         */
        addRequest(source, target, until) {
            if (source)
                this.purgeRequests({
                    source: source
                });

            let req = {
                source: source,
                target: target,
                until: until
            };

            Utils.TRACE(TAG, "Add request ", this.name, " ", req);
            this.requests.push(req);
        };

        /**
         * Purge requests that have timed out, or are force-purged by matching
         * the parameters.
         * @param match map of request fields to match e.g. { source: id } All fields must match
		 * @param clear true if requests are to be deleted even if they are under targets
         */
        purgeRequests(match, clear) {
            if (match)
                Utils.TRACE(TAG, "Purge ", this.name, match, clear);
            match = match || {};
            let reqs = this.requests;
            for (let i = 0; i < reqs.length; i++) {
                let r = reqs[i];
                let matched = true;
                for (let k in match) {
                    if (r[k] !== match[k]) {
						matched = false; // all fields must match
						break;
                    }
                }
				if (matched) {
					let purge = clear;
					if (!purge && r.until == Utils.BOOST) {
						if (this.temperature >= r.target) {
							purge = true;
							Utils.TRACE(TAG, `Purge because boost ${this.temperature} over ${r.target}`);
						}
					} else if (!purge && r.until < Date.now() / 1000) {
						purge = true;
						Utils.TRACE(TAG, "Purge because until was in the past");
					}
					if (purge) {
						Utils.TRACE(TAG, `Purge ${this.name} request ${r}`);
						reqs.splice(i--, 1);
					}
				}
            }
        };
    }

    Thermostat.Model = {
        $class: Thermostat,
        id: {
            $class: String,
            $doc: "unique ID used to communicate with this thermostat"
        },
		poll_every: {
			$class: Number,
			$doc: "Polling frequency, in seconds",
			$optional: true
		},
        timeline: Timeline.Model,
        history: Utils.extend({
            $optional: true
        }, Historian.Model)
    };

    return Thermostat;
});
