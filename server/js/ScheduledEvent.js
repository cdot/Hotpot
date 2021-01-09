/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("server/js/ScheduledEvent", ["common/js/Utils", "common/js/Time"], function(Utils, Time) {

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

            let self = this;
            let now = Time.now();
            if (start > now) {
                Utils.TRACE(TAG, self.id, "(", service, ",", temperature, ") will start at ", new Date(start),
                            " now is ", new Date());
                this.event = setTimeout(function () {
                    self.begin();
                }, start - now);
            } else if (start <= now && until > 0 && until > now) {
                Utils.TRACE(TAG, self.id, " began in the past");
                this.begin();
            } else {
                Utils.TRACE(TAG, self.id, " is already finished");
            }
        }

        // Cancel this event. Will remove the event from the containing calendar.
        cancel() {
            Utils.TRACE(TAG, this.id, " cancelled");
            if (typeof this.event !== "undefined") {
                clearTimeout(this.event);
                this.event = undefined;
            }
            if (typeof this.calendar.remove === "function")
                this.calendar.remove(this.id, this.service);
        }

        // Start this event. The calendar trigger will be called.
        begin() {
            let self = this;

            if (typeof this.calendar.trigger === "function")
                this.calendar.trigger(this.id, this.service, this.temperature, this.until);
       
			Utils.runAt(function () {
				self.end();
			}, this.until);
        }

		end() {
			Utils.TRACE(TAG, this.id, " finished");
            if (typeof this.calendar.remove === "function")
				this.calendar.remove(this.id, this.service);
		}
	}

    return ScheduledEvent;
});
