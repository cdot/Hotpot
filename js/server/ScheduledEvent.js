/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define([ "js/common/Utils" ], Utils => {

  const TAG = "ScheduledEvent";

  /**
   * Calendar event cache entry
   */
  class ScheduledEvent {
    /**
     * @param {Calendar} calendar Reference to container Calendar
     * @param {number} id Event ID
     * @param {number} start Start of the event, in epoch ms
     * @param {string} service Service the event applies to e.g. "CH"
     * @param {number} temperature Required temperature
     * @param {number} until End of the event, in epoch ms, or Utils.BOOST
     */
    constructor(cal, id, start, service, temperature, until) {
      /**
       * Reference to container Calendar
       * @member {Calendar}
       */
      this.calendar = cal;
      /**
       * Event ID
       * @member {number}
       */
      this.id = id;
      /**
       * Service the event applies to e.g. "CH"
       * @member {string}
       */
      this.service = service;
      /**
       * Required temperature
       * @member {number}
       */
      this.temperature = temperature;
      /**
       * Start of the event, in epoch ms
       * @member {number}
       */
      this.start = start;
      /**
       * End of the event, in epoch ms, or Utils.BOOST
       * @member {number}
       */
      this.until = until;

      const now = Date.now();
      if (start > now) {
        Utils.TRACE(
          TAG, this.id,
          `(${service},${temperature}) will start at `,
          new Date(start),
          " now is ", new Date());
        this.eventTimer = Utils.startTimer(this.id, () => this.begin(), start - now);
        Utils.TRACE(TAG, this.id, ` set timer ${this.eventTimer}`);
      } else if (start <= now && until > 0 && until > now) {
        Utils.TRACE(TAG, this.id, " began in the past");
        this.begin();
      } else {
        Utils.TRACE(TAG, this.id, " is already finished");
      }
    }

    /**
     * Cancel this event. Will remove the event from the
     *  containing calendar.
     */
    cancel() {
      if (typeof this.eventTimer !== "undefined") {
        Utils.cancelTimer(this.eventTimer);
        delete this.eventTimer;
      }
      if (typeof this.calendar.remove === "function")
        this.calendar.remove(this.id, this.service);
    }

    /**
     * Start this event. The calendar trigger will be called.
     */
    begin() {
      if (typeof this.calendar.trigger === "function")
        this.calendar.trigger(this.id, this.service, this.temperature, this.until);

      Utils.runAt(() => this.end(), this.until);
    }

    /**
     * End this event. The calendar trigger will be called.
     */
    end() {
      Utils.TRACE(TAG, this.id, " finished");
      if (typeof this.calendar.remove === "function")
        this.calendar.remove(this.id, this.service);
    }
  }

  return ScheduledEvent;
});
