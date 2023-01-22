/*@preserve Copyright (C) 2016-2023 Crawford Currie http://c-dot.co.uk license MIT*/

import { Utils } from "./Utils.js";
import { Request } from "./Request.js";

const TAG = "ScheduledEvent";

/**
 * Calendar event. Extends Request to add a start time, unique id, and
 * service identifier.
 */
class ScheduledEvent extends Request {

  /**
   * @param {Calendar} calendar Reference to container Calendar
   * @param {object} p parameters. `ScheduledEvent` subclasses
   * `Request`, and the base class will initialise itself off the same
   * parameters, except that the `source` will automatically be forced
   * to the calendar name.
   * @param {string?} p.id unique id of event. This is used to track
   * events in a calendar, and is assigned by the caller.
   * @param {number} p.start Start of the event, in epoch ms
   * @param {string} p.service Service the event applies to e.g. "CH"
   */
  constructor(cal, p) {

    /**
     * Source of the request is the calendar name (this may be coming
     * from a saved event)
     * @member {string}
     */
    p.source = p.source || `Calendar '${cal.name}'`;

    super(p);

    /**
     * Event ID
     * @member {number}
     */
    this.id = p.id;

    /**
     * Service the event applies to e.g. "CH"
     * @member {string}
     */
    this.service = p.service;

    /**
     * Start of the event, in epoch ms
     * @member {number}
     */
    this.start = Request.parseTime(p.start);

    const now = Date.now();
    if (this.start > now) {
      Utils.TRACE(
        TAG, this.id,
        `(${this.service},${this.temperature}) will start at `,
        new Date(this.start),
        " now is ", new Date());
      this.eventTimer = Utils.startTimer(
        this.id, () => this.begin(cal), this.start - now);
      Utils.TRACE(TAG, this.id, ` set timer ${this.eventTimer}`);
    } else if (this.start <= now && this.until > 0 && this.until > now) {
      Utils.TRACE(TAG, this.id, " began in the past");
      this.begin(cal);
    } else {
      Utils.TRACE(TAG, this.id, " is already finished");
    }
  }

  /**
   * Cancel this event. Will NOT remove the event from the
   * containing calendar.
   */
  cancel() {
    if (typeof this.eventTimer !== "undefined") {
      Utils.cancelTimer(this.eventTimer);
      delete this.eventTimer;
    }
  }

  /**
   * Start this event.
   */
  begin(cal) {
    cal.trigger(this);
    Utils.runAt(() => this.end(cal), this.until);
  }

  /**
   * End this event.
   */
  end(cal) {
    Utils.TRACE(TAG, this.id, " finished");
    cal.remove(this);
  }

  /**
   * Parse a set of event specifications out of calendar text.
   * It is assumed that the start time of the event is known.
   * Events embedded in text are of the form.
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
   * @param {string} text the text to parse
   * @param {function} onEvent function to call for each event
   * parsed. The spec gives the service, temperature and
   * until (iff it's a boost)
   */
  static parse(text, onEvent) {
    const re = /\b([a-z][a-z0-9_]*)\s*(?:=\s*)?(boost\s*)?(off|\d+)/gi;
		let match;
		while ((match = re.exec(text)) !== null) {
      const e = {
			  service: match[1].toUpperCase(),
			  temperature: /off/i.test(match[3]) ? Request.OFF : parseFloat(match[3])
      };
      if (/boost/i.test(match[2]))
        e.until = Request.BOOST;
			Utils.TRACE(TAG, "Parsed ", e);
      onEvent(e);
		}
  }
}

export { ScheduledEvent }

