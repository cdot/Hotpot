/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("server/js/Pin", ["common/js/Utils", "server/js/Gpio", "server/js/Historian"], function(Utils, Gpio, Historian) {

    const TAG = "Pin";
	
    /**
     * A Pin is the interface to a RPi GPIO pin.
     * @class
     */
    class Pin {

        /**
         * @param {string} name name of the pin e.g. HW
         * @param {object} proto see Pin.Model
         */
        constructor(proto, name) {

            Utils.extend(this, proto);

            /**
             * @property {string} name Name of the pin e.g. HW
             * @public
             */
            this.name = name;

            /**
             * @property {string} reason Descriptive reason the pin is currently in
             * the state it is.
             * @public
             */
            this.reason = "";

            Utils.TRACE(TAG, `'${this.name}' constructed on gpio ${this.gpio}`);

			// Construct the object that interfaces to the actual GPIO pins
			this.Gpio = new Gpio(this.gpio);
        }

		initialise() {
			Utils.TRACE(TAG, `Initialising pin ${this.name}`);
			return this.Gpio.initialiseGpio("out", "low")
			.catch((e) => {
				console.error(`Pin ${this.name} initialisation failed ${e}`);
				if (typeof HOTPOT_DEBUG === "undefined") {
					console.error("--debug not enabled");
					// if we can't talk to GPIO and we can't start debug,
					// then this is something the sysadmin has to resolve.
					throw e;
				}
				// Fall back to debug
				this.Gpio = HOTPOT_DEBUG.getService(this.name);
				console.error(`Falling back to debug service for pin '${this.name}'`);
				return this;
			});
		}

        /**
         * Set the pin state. Don't use this on a Y-plan system, use
         * {@link Controller.Controller#setPromise|Controller.setPromise} instead.
         * @param {integer} state of the pin
         * @return {Promise} a promise to set the pin state
         * @public
         */
        setState(state) {
            let self = this;

            Utils.TRACE(TAG, `gpio${this.gpio}=${state === 1 ? "ON" : "OFF"}`);

            let promise = this.Gpio.setValue(state);
            if (self.history)
                promise = promise.then(() => this.history.record(state));
            return promise;
        };

        /**
         * Get a promise to get the pin state
         * @return a promise, passed the pin state
         * @public
         */
        getState() {
            return this.Gpio.getValue();
        };

        /**
         * Generate and return a promise for a serialisable version of the
         * structure, suitable for use in an AJAX response.
         * @return {Promise} a promise that is passed the state
         * @protected
         */
        getSerialisableState() {
            let self = this;
            return this.getState()
            .then((value) => {
				return { reason: self.reason, state: value }
			});
        };

        /**
         * Get a promise for the current log of the pin state.
         * @param since optional param giving start of logs as a ms datime
         */
        getSerialisableLog(since) {
            if (!this.history)
                return Promise.resolve();
            return this.history.getSerialisableHistory(since);
        };
    }

    Pin.Model = {
        $class: Pin,
        gpio: {
            $class: Number,
            $doc: "the number of the gpio pin"
        },
        history: Utils.extend({
            $optional: true
        }, Historian.Model)
    };

    return Pin;
});
