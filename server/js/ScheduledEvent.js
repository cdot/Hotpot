/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("server/js/ScheduledEvent", ["common/js/Utils"], function(Utils) {

	const TAG = "ScheduledEvent";

	/**
	 * Calendar event cache entry
	 */

	class ScheduledEvent {
		constructor(cal, id, start, service, temperature, until) {
			// Reference to container {Calendar}
			this.calendar = cal;
			// Event ID
			this.id = id;
			// Service the event applies to e.g. "CH"
			this.service = service;
			// Required temperature
			this.temperature = temperature;
			// Start of the event, in epoch ms
			this.start = start;
			// End of the event, in epoch ms, or Utils.BOOST
			this.until = until;

			let now = Date.now();
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

		// Cancel this event. Will remove the event from the containing calendar.
		cancel() {
			if (typeof this.eventTimer !== "undefined") {
				Utils.cancelTimer(this.eventTimer);
				delete this.eventTimer;
			}
			if (typeof this.calendar.remove === "function")
				this.calendar.remove(this.id, this.service);
		}

		// Start this event. The calendar trigger will be called.
		begin() {
			if (typeof this.calendar.trigger === "function")
				this.calendar.trigger(this.id, this.service, this.temperature, this.until);

			Utils.runAt(() => this.end(), this.until);
		}

		end() {
			Utils.TRACE(TAG, this.id, " finished");
			if (typeof this.calendar.remove === "function")
				this.calendar.remove(this.id, this.service);
		}
	}

	return ScheduledEvent;
});
