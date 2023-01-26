/*@preserve Copyright (C) 2016-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import debug from "debug";

import { extend } from "../common/extend.js";
import { startTimer, cancelTimer } from "../common/Timers.js";
import { ScheduledEvent } from "../common/ScheduledEvent.js";

// MS in an hour
const HOURS = 60 * 60 * 1000;

const trace = debug("Calendar");

/**
 * Base class of calendars. Specific calendar implementations
 * should subclass, e.g. HotpotCalendar, this class should not be
 * instantiated directly (or used in a .Model)
 */
class Calendar {

  /**
   * Get active events from a calendar.
   * @param {object} proto see Calendar.Model
   * @param {string} name name of the calendar
   */
  constructor(proto, name) {
    extend(this, proto);

    /**
     * Name of the calendar
     * @member {string}
     */
    this.name = name;

    /**
		 * Current events cache
		 * @member {ScheduledEvent[]}
     * @private
		 */
    this.schedule = [];

    /**
		 * Trigger function called when an event starts
		 * @member {function}
     * @private
		 */
    this.on_trigger = null;

    /**
		 * Function called when an event is removed
		 * @member {function}
     * @private
		 */
    this.on_remove = null;

    /**
		 * Current timeout, as returned by setTimeout
		 * @member {number}
     * @private
		 */
    this.updateTimer = undefined;

		/**
		 * List of known service names
		 * @member {string[]}
     * @private
		 */
		this.services = [ "ALL" ];
  }

	/**
	 * Set the list of known services that might be mentioned in
	 * this calendar.
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
   * trigger(String service, Request request)
   * ```
   * * `service` service the event is for (or `ALL` for all services)
   * * `request` the request
   * ```
   */
  onTrigger(trigger) {
    this.on_trigger = trigger;
  }

  /**
   * Trigger event
   * @param {ScheduledEvent} e event to trigger
   */
  trigger(e) {
    if (this.on_trigger) {
      trace("Triggering request %o", e);
      this.on_trigger(e.service, e);
    }
  }

  /*
   * Set function to be called when an event is removed.
   * @param {function} remove `remove(ScheduledEvent e)`
   * callback invoked when a scheduled event is removed.
   */
  onRemove(remove) {
    this.on_remove = remove;
  }

  /*
   * Call to remove event.
   * @param {ScheduledEvent} e event to remove
   */
  remove(e) {
    if (this.on_remove)
      this.on_remove(e);
  }

  /**
   * Return a promise that will update the list of the events
   * stored for the next `this.cache_length` hours.
   * The cache size is limited by the config.
   * Longer means less frequent automatic updates, and larger memory
   * footprint for the server, but (potentially) less network traffic
   * if the calendar is remote.
   * Subclasses must define this to retrieve events from the
	 * calendar server.
   */
  fillCache() { throw Error("Calendar.fillCache"); }

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
    let e;
    while ((e = this.schedule.pop())) {
      e.cancel();
      this.remove(e);
    }
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
			cancelTimer(this.updateTimer);
			delete this.updateTimer;
		}

    this.updateTimer = startTimer(
      "calUp",
      () => {
        trace(`Updating '${this.name}'`);
        this.fillCache()
        .then(() => {
          trace(`Updated '${this.name}'`);
          this.update(this.update_period * HOURS);
        })
        .catch(e => {
          console.error(`Calendar '${this.name}' error ${e.message}`);
        });
      }, after);
		trace(`Started timer ${this.updateTimer}`);
  }

  /**
   * Cancel the calendar update timer and all active event timers
   */
  stop() {
    trace(`'${this.name}' stopped`);
    if (this.updateTimer) {
			trace(`Stopped timer ${this.updateTimer}`);
      cancelTimer(this.updateTimer);
      delete this.updateTimer;
    }
    this.clearSchedule();
  }

  /**
   * Provided as a service for subclasses to parse Hotpot events
   * out of text and add them to the schedule.
   *
   * @param {Date} start event start
   * @param {Date} end event end
   * @param {string} description text to parse for events
   */
  parseEvents(start, end, description) {
    // Parse event instructions out of the calendar events
    let spec = this.schedule.length;
    ScheduledEvent.parse(description, e => {
      if (this.services.indexOf(e.service) < 0)
        throw Error(`Unknown service ${e.service}`);
      e.start = start;
      e.id = spec++;
      if (typeof e.until === "undefined")
        e.until = end;
      this.schedule.push(new ScheduledEvent(this, e));
    });
	}

  /**
   * Add routes to the server if needed for managing the calendar.
   * @param { {object} Express router to add routes to
   */
  addRoutes(router) {
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

export { Calendar }
