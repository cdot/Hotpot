/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("server/js/Pin", ["fs-extra", "common/js/Utils", "server/js/Historian"], function(Fs, Utils, Historian) {

    const TAG = "Pin";

    // Base path of all GPIO operations
    const GPIO_PATH = "/sys/class/gpio/";

    // Paths to write to to export/unexport GPIO pins
    const EXPORT_PATH = `${GPIO_PATH}export`;
    const UNEXPORT_PATH = `${GPIO_PATH}unexport`;

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
                HOTPOT_DEBUG.mapPin(this);

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
                let m = `${EXPORT_PATH}=${self.gpio}`;
                return Fs.writeFile(EXPORT_PATH, self.gpio, "utf8")
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
                return Fs.writeFile(path, 1)
                .then(writeCheck)
                .catch(function (e) {
                    return fallBackToDebug(`${path}=1 failed: ${e}`);
                });
            }

            // Pin is exported and direction is set, should be OK to write
            function writeCheck() {
                return Fs.writeFile(self.value_path, 0, "utf8")
                .then(function () {
                    Utils.TRACE(TAG, `${self.value_path} writeCheck OK for ${self.name}`);
                    if (self.history)
                        self.history.record(0);
                })
                .catch(function (e) {
                    return fallBackToDebug(
                        `${self.value_path} writeCheck failed: ${e}`);
                });
            }

            // Something went wrong, but still use a file
            function fallBackToDebug(err) {
                Utils.ERROR(TAG, `${self.name}:${self.gpio} setup failed: ${err}`);
                if (typeof HOTPOT_DEBUG === "undefined")
                    throw new Utils.exception(TAG, `${self.name} setup failed: ${err}`);
                Utils.ERROR(TAG, `Falling back to debug for pin ${self.name}`);
                self.value_path = `${HOTPOT_DEBUG.pin_path}${self.gpio}`;
                return writeCheck();
            }

            return readCheck();
        }

        /**
         * Release all resources used by the pin
         * @protected
         */
        DESTROY() {

            Utils.TRACE(TAG, `Unexport gpio ${this.gpio}`);
            Fs.writeFile(UNEXPORT_PATH, this.gpio, "utf8");
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
         * Get the pin state, synchronously. Intended for use in rules.
         * @return pin state {integer}
         * @public
         */
        getState() {
            let state = Fs.readFileSync(this.value_path, "utf8");
            return parseInt(state);
        };

        /**
         * Get a promise to get the pin state
         * @return a promise, passed the pin state
         * @public
         */
        getStatePromise() {
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

            return this.getStatePromise()
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
