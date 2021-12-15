/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("server/js/Calendar", ["fs", "common/js/Utils", "common/js/Time", "common/js/DataModel", "server/js/ScheduledEvent"], function (fs, Utils, Time, DataModel, ScheduledEvent) {

    // MS in an hour
    const HOURS = 60 * 60 * 1000;

    const TAG = "Calendar";

	/**
	 * @typedef Calendar.Event
     * @property {number} temperature, may be Utils.OFF
     * @property {Date} start start date/time
     * @property {Date|string} end date/time or "boost"
	 */

    /**
     * Abstract base class of calendars. Specific calendar implementations
     * should subclass, e.g. GoogleCalendar, this class should not be
     * instanted directly (or used in a .Model)
     */
    class Calendar {

        /**
         * Get active events from a calendar.
         * @param {object} proto see Calendar.Model
         * @param {string} name name of the calendar
         */
        constructor(proto, name) {
            Utils.extend(this, proto);
            // @property {String} name name of the calendar
            this.name = name;
            /**
			 * Current events schedule
			 * @member {Calendar.Event[]}
			 */
            this.schedule = [];
            /**
			 * Trigger function called when an event starts
			 * @member {function}
			 */
            this.trigger = null;
            /**
			 * Function called when an event is removed
			 * @member {function}
			 */
            this.remove = null;
            /**
			 * Current timeout, as returned by setTimeout
			 * @member {number}
			 */
            this.updateTimer = undefined;
			/**
			 * List of service names
			 * @member {string[]}
			 */
			this.services = [ "ALL" ];
        }

		/**
		 * Set the list of known services that might be mentioned in
		 * this calendar
		 * @param {string[]} list of service names (case independent)
		 */
		setServices(services) {
			this.services = [ "ALL" ].concat(
				services.map(s => s.toUpperCase()));
		}

        /**
         * @param {function} trigger callback triggered when an event starts
         * (or after an update and the event has already started).
         * ```
         * trigger(String id, String service, int target, int until)
         * ```
         * * `id` id of the event
         * * `service` service the event is for (or `ALL` for all services)
         * * `target` target temperature
         * * `until` when the event ends (epoch ms) or Utils.BOOST
         * @param {function} remove callback invoked when a scheduled event is removed.
         * ```
         */
        setTrigger(trigger) {
            this.trigger = trigger;
        }

        /*
         * remove(String id, String service)
         * ```
         * * `id` id of the event being removed
         * * `service` service the event appies to
         */
        setRemove(remove) {
            this.remove = remove;
        }

        /**
         * Return a promise that will update the list of the events
         * stored for the next 24 hours.
         * The cache size is limited by the config.
         * Longer means less frequent automatic updates, and larger memory
         * footprint for the server, but less network traffic.
         * Subclasses must define this to retrieve events from the
		 * calendar server.
         */
        fillCache() {}

        /**
         * Generate and return a promise for a serialisable version of the state
         * of the object, suitable for use in an AJAX response.
         *
         * The serialisable state of a calendar is the current (or next) active
         * event in the calendar for each unique service in the calendar.
         * {
         *   pending_update: boolean indicates if we are waiting for an
         *   update from the calendar service
         *   service: {
         *     map from service name to current (or next) event for that
         *     service
         *   }
         * }
         * @return {Promise} Promise to get the state
         */
        getSerialisableState() {
            const state = {
                events: {}
            };
            if (this.pending_update)
                state.pending_update = true;
            for (let i = 0; i < this.schedule.length; i++) {
                const event = this.schedule[i];
                if (!state.events[event.service]) {
                    state.events[event.service] = {
                        temperature: event.temperature,
                        start: event.start,
                        end: event.until
                    };
                }
            }
            return Promise.resolve(state);
        }

        /**
         * Clear the existing schedule
         * @private
         */
        clearSchedule() {
            for (let i in this.schedule)
                this.schedule[i].cancel();
            this.schedule = [];
        }

        /**
         * Schedule a calendar update in 'after' milliseconds. The update is
         * performed asynchronously.
         * @param {number} after delay before updating the calendar
		 * asynchronously
         * @private
         */
        update(after) {
			if (this.updateTimer) {
				// Kill the old timer
				Utils.cancelTimer(this.updateTimer);
				delete this.updateTimer;
			}

            this.updateTimer = Utils.startTimer(
                "calUp",
                () => {
                    Utils.TRACE(TAG, `Updating '${this.name}'`);
                    this.fillCache()
                        .then(() => {
                            Utils.TRACE(TAG, `Updated '${this.name}'`);
                            this.update(this.update_period * HOURS);
                        })
                        .catch(e => {
                            console.error(this, e);
                            console.error(`${TAG} '${this.name}' error ${e.message}`);
                        });
                }, after);
			Utils.TRACE(TAG, `Started timer ${this.updateTimer}`);
        }

        /**
         * Cancel the calendar update timer and all active event timers
         */
        stop() {
            Utils.TRACE(TAG, `'${this.name}' stopped`);
            if (this.updateTimer) {
			Utils.TRACE(TAG, `Stopped timer ${this.updateTimer}`);
                Utils.cancelTimer(this.updateTimer);
                delete this.updateTimer;
            }
            this.clearSchedule();
        }

        /**
         * Return a list of available calendars.
         * Subclasses must implement this.
         */
        listCalendars() {
            return [];
        }

        /**
         * Hotpot events are read from the text of calendar
         * events. They are of the form
         * ```
         * events = event [ ";" events ]
         * event = service [ "=" ] spec
         * spec = [ "boost" ] temperature | "off"
         * ```
         * where
         * + `service` is a service name e.g. CH, HW, or ALL for all services
		 * + A temperature without `boost` sets the target temperature while
		 * the event is live.
         * + `boost` tells the service to revert to rules once the
         *    target temperature has been met.
		 * + `off` switches the service off for the duration of the event.
         * `boost` and `off` are case-insensitive.
		 * The following should all work:
		 * ```
         * CH BOOST 18
         * hw=50; ch=20
         * HW=50 CH boost 20
         * HW 40 CH OFF
         * HW 40; CH off
         * all off
         * ```
         */
        parseEvents(start, end, description) {
            // Parse event instructions out of the calendar events
            const re = new RegExp(
				`\\b(${this.services.join('|')})`
				+ "\\s*(?:=\\s*)?"
				+ "(boost\\s*)?"
				+ "(off|\\d+)", "gi");
			let match, spec = 1;
			while ((match = re.exec(description)) !== null) {
				const service = match[1].toUpperCase();
				const until = match[2] ? Utils.BOOST : end;
				const temperature = /off/i.test(match[3])
					  ? Utils.OFF : parseFloat(match[3]);
				Utils.TRACE(
					`${TAG}Parser`,
					`Event ${service} ${start} ${temperature} ${until}`);
                this.schedule.push(new ScheduledEvent(
                    this, `Calendar '${this.name}' ${spec++}`,
                    start, service, temperature, until));
			}
		}
    }

    /**
     * Configuration model, for use with {@link DataModel}
     * @typedef Calendar.Model
     * @property {String} prefix Prefix for hotpot instructions in the calendar
     * @property {Number} update_period Delay between calendar reads, in hours
     * @property {Number} cache_length Period of calendar entries to cache, in hours
     */
    Calendar.Model = {
        prefix: {
            $doc: "Prefix for hotpot instructions in the calendar",
            $class: String,
            $optional: true
        },
        update_period: {
            $doc: "Delay between calendar reads, in hours",
            $class: Number
        },
        cache_length: {
            $doc: "Period of calendar entries to cache, in hours",
            $class: Number
        }
    };

    return Calendar;
});
