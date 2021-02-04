/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("server/js/Calendar", ["fs", "common/js/Utils", "common/js/Time", "common/js/DataModel", "server/js/ScheduledEvent"], function(fs, Utils, Time, DataModel, ScheduledEvent) {

	// MS in an hour
	const HOURS = 60 * 60 * 1000;

	const TAG = "Calendar";

	/**
	 * Abstract base class of calendars. Specific calendar implementations
	 * should subclass, e.g. GoogleCalendar, this class should not be
	 * instanted directly (or used in a .Model)
	 */
	class Calendar {

		/**
		 * Get active events from a Google calendar.
		 * @param {string} name name of the calendar
		 * @param {object} proto see Calendar.Model
		 * @class
		 */
		constructor(proto, name) {
			Utils.extend(this, proto);
			// @property {String} name name of the calendar
			this.name = name;
			// Current events schedule
			this.schedule = [];
			// Trigger function called when an event starts
			this.trigger = null;
			// Function called when an event is removed
			this.remove = null;
			// current timeout, as returned by setTimeout
			//this.updateTimer = undefined;
			// @property {string} last_update last time the calendars were updated
			//this.last_update = undefined;
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
		 * Subclasses must define this to retrieve events from the calendar server.
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
		 * @return Promise to get the state
		 */
		getSerialisableState() {
			let state = {
				events: {}
			};
			if (this.pending_update)
				state.pending_update = true;
			for (let i = 0; i < this.schedule.length; i++) {
				let event = this.schedule[i];
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
		 * @param {Number} after delay before updating the calendar asynchronously
		 * @private
		 */
		update(after) {
			// Kill the old timer
			this.updateTimer = Utils.startTimer(
				"calUp",
				() => {
					delete this.updateTimer;
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
		}

		/**
		 * Cancel the calendar update timer and all active event timers
		 */
		stop() {
			Utils.TRACE(TAG, `'${this.name}' stopped`);
			if (typeof this.updateTimer !== "undefined") {
				Utils.cancelTimer(this.updateTimer);
				delete this.updateTimer;
			}
			this.clearSchedule();
		}

		/**
		 * Return a list of available calendars.
		 * Subclasses must implement this.
		 */
		listCalendars() { return []; }

		/**
		 * Hotpot events are read from the text of calendar
		 * events. They are of the form
		 * ```
		 * <events> = <event> [ ";" <events> ]
		 * <event> = <service> [=] <specs>
		 * <specs> = <spec> [ <specs> ]
		 * <spec> = "boost" | <temperature>
		 * ```
		 * where
		 * + <prefix> is an optional prefix (e.g. HOTPOT:)
		 * + <service> is a service name e.g. CH, or ALL for all services
		 * + "boost" if present tells the service to revert to normal behaviour once the
		 * target termperature has been met <target> is an optional command (e.g. BOOST) and
		 * temperature is in  degrees C. For example,
		 * ```
		 * Hotpot:CH BOOST 18
		 * hotpot: hw=50; ch=20
		 * HotPot: HW=50 CH=20
		 * ```
		 * is a command to boost the central heating up to 18C. The <prefix> and
		 * "boost" are case-insensitive.
		 */
		parseEvents(start, end, description) {
			// Parse event instructions out of the calendar events
			let state = 0;
			let until = end;
			let temperature = 0, service = "", spec = 1;
			let commit = () => {
				this.schedule.push(new ScheduledEvent(
					this, `Calendar '${this.name}' ${spec++}`,
					start, service, temperature, until));
				until = end;
			};
			let match;
			let re = new RegExp("\\s*([\\d.]+|[A-Z]+:?|;|=)", "gi");
			let token = null;
			while (true) {
				if (token == null) { // need new token
					if ((match = re.exec(description)) !== null)
						token = match[1];
					else {
						Utils.TRACE(`${TAG}Parser`, "No further matches");
						break;
					}
				}
				if (state === 0) {
					if (token == this.prefix) {
						state = 1;
						Utils.TRACE(`${TAG}Parser`, `0 -> 1 on '${token}'`);
						token = null;
						continue;
					}
					if (this.prefix) {
						token = null;
						continue;
					} else {
						state = 1;
						Utils.TRACE(`${TAG}Parser`, `0 -> 1 on '${token}'`);
						// drop through
					}
				}
				if (state === 1) {
					if (/^\w+$/.test(token)) {
						service = token;
						state = 2;
						Utils.TRACE(`${TAG}Parser`, `1 -> 2 on '${token}'`);
						token = null;
					} else {
						state = 0;
						Utils.TRACE(`${TAG}Parser`, `1 -> 0 on '${token}'`);
					}

				} else if (state >= 2) {
					if (token == this.prefix) {
						commit();
						Utils.TRACE(`${TAG}Parser`, `${state} -> 1 on '${token}'`);
						state = 1;
						token = null;

					} else if (token === ";" && state === 3) {
						commit();
						Utils.TRACE(`${TAG}Parser`, `${state} -> 1 on '${token}'`);
						state = 1;
						token = null;

					} else if (/^boost$/i.test(token)) {
						Utils.TRACE(`${TAG}Parser`, "Boosted");
						until = Utils.BOOST;
						token = null;

					} else if ("=" == token) {
						// Ignore it
						token = null;

					} else if (/^\d/.test(token) && parseFloat(token) != NaN) {
						temperature = parseFloat(token);
						Utils.TRACE(`${TAG}Parser`, `${state} -> 3 on '${token}'`);
						state = 3;
						token = null;

					} else {
						if (state === 3)
							commit();
						Utils.TRACE(`${TAG}Parser`, `${state} -> 1 on '${token}'`);
						state = 1;
					}
				} else {
					Utils.TRACE(`${TAG}Parser`, `Parse failed state ${state} '${token}'`);
					state = 0;
				}
			}
			if (state == 3)
				commit();
		}
	}

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
