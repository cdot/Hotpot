/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

// Base path of all GPIO operations
GPIO_PATH = "/sys/class/gpio/";

define("server/js/Pin", ["fs", "common/js/Utils", "server/js/Historian"], function(fs, Utils, Historian) {

    const TAG = "Pin";

	const Fs = fs.promises;
	
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

            if (typeof HOTPOT_DEBUG !== "undefined")
                HOTPOT_DEBUG.getServiceForPin(this);

            this.value_path = `${GPIO_PATH}gpio${this.gpio}/value`;

            Utils.TRACE(TAG, `'${this.name}' constructed on gpio ${this.gpio}`);
        }

        /**
         * Return a promise to initialise the pin
         */
        initialise() {
            let self = this;
            let exported = false;

            // First check if the pin can be read. If it can, it is already
            // exported and we can move on to setting the direction, otherwise
            // we have to export it.
            function readCheck() {
                let m = `${self.value_path} readCheck `;
				Utils.TRACE(TAG, `readCheck ${m}`);
                return Fs.readFile(self.value_path, "utf8")
                .then(() => {
                    // Check passed, so we know it's exported
                    exported = true;
                    Utils.TRACE(TAG, `${m} OK for ${self.name}`);
                    return setDirection();
                })
                .catch(function (e) {
                    m += `failed: ${e}`;
                    if (exported)
                        // Already exported, no point trying again
                        return fallBackToDebug(m);
                    else {
                        Utils.ERROR(TAG, m);
                        return exportPin();
                    }
                });
            }

            // Try and export the pin
            function exportPin() {
                let m = `${GPIO_PATH}export=${self.gpio}`;
				Utils.TRACE(TAG, `exportPin ${m}`);
                return Fs.writeFile(`${GPIO_PATH}export`, self.gpio, "utf8")
                .then(function () {
                    Utils.TRACE(TAG, `${m} OK for ${self.name}`);
                    // Use a timeout to give it time to get set up
                    return new Promise((resolve) => {
                        setTimeout(resolve, 1000);
                    })
                    .then(readCheck);
                })
                .catch(function (err) {
                    return fallBackToDebug(`${m} failed ${err}`);
                });
            }

            // The pin is known to be exported, set the direction
            function setDirection() {
                let path = `${GPIO_PATH}gpio${self.gpio}/direction`;
				Utils.TRACE(TAG, `setDirection ${path}`);
                return Fs.writeFile(path, "out")
                .then(function () {
                    Utils.TRACE(TAG, `${path}=out OK for ${self.name}`);
                    return setActive();
                })
                .catch(function (e) {
                    return fallBackToDebug(`${path}=out failed: ${e}`);
                });
            }

            // This seems backwards, and runs counter to the documentation.
            // If we don't set the pin active_low, then writing a 1 to value
            // sets the pin low, and vice-versa. Ho hum.
            function setActive() {
                let path = `${GPIO_PATH}gpio${self.gpio}/active_low`;
				Utils.TRACE(TAG, `setActive ${path}`);
                return Fs.writeFile(path, 1)
                .then(writeCheck)
                .catch(function (e) {
                    return fallBackToDebug(`${path}=1 failed: ${e}`);
                });
            }

            // Pin is exported and direction is set, should be OK to write
            function writeCheck(fallback) {
				Utils.TRACE(TAG, `writeCheck ${self.value_path}`);
                return Fs.writeFile(self.value_path, 0, "utf8")
                .then(function () {
                    Utils.TRACE(TAG, `${self.value_path} writeCheck OK for ${self.name}`);
                    if (self.history)
                        self.history.record(0);
					return self;
                })
                .catch(function (e) {
                    if (!fallback)
						return fallBackToDebug(
							`${self.value_path} writeCheck failed: ${e}`);
					throw new Error(e);
                });
            }

            // Something went wrong, but still use a file
            function fallBackToDebug(err) {
                Utils.ERROR(TAG, `${self.name}:${self.gpio} setup failed: ${err}`);
                if (typeof HOTPOT_DEBUG === "undefined")
                    throw new Utils.exception(TAG, `${self.name} setup failed: ${err}`);
                Utils.ERROR(TAG, `Falling back to debug for pin ${self.name}`);
                self.value_path = `${HOTPOT_DEBUG.pin_path}${self.gpio}`;
                return writeCheck(true);
            }

            return readCheck();
        }

        /**
         * Release all resources used by the pin
         * @protected
         */
        DESTROY() {

            Utils.TRACE(TAG, `Unexport gpio ${this.gpio}`);
            Fs.writeFile(`${GPIO_PATH}unexport`, this.gpio, "utf8");
        }

        /**
         * Set the pin state. Don't use this on a Y-plan system, use
         * {@link Controller.Controller#setPromise|Controller.setPromise} instead.
         * @param {integer} state of the pin
         * @return {Promise} a promise to set the pin state
         * @public
         */
        set(state) {
            let self = this;

            Utils.TRACE(TAG, `${self.value_path} = ${state === 1 ? "ON" : "OFF"}`);

            let promise = Fs.writeFile(self.value_path, state, "UTF8");
            if (self.history)
                promise = promise.then(function () {
                    return self.history.record(state);
                });
            return promise;
        };

        /**
         * Get a promise to get the pin state
         * @return a promise, passed the pin state
         * @public
         */
        getState() {
            return Fs.readFile(this.value_path, "utf8")
            .then(function (data) {
                return parseInt(data);
            });
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
            .then(function (value) {
                return {
                    reason: self.reason,
                    state: value
                };
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
