/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * This module provides an interface to GPIO pins.
 * It uses the sysfs interface, which is deprecated. However support for
 * libgpiod is confused, so sticking with sysfs for now.
 */
define("server/js/Gpio", ["fs", "path", "common/js/Utils"], function(fs, Path, Utils) {

    const Fs = fs.promises;

    // Base path of all GPIO paths.
    const GPIO_PATH = "/sys/class/gpio";

    const TAG = "Gpio";
    
    class Gpio {

        constructor(gpio) {
            this.gpio = gpio;
        }

        /**
         * Promise to initialise the pin. This will export the pin if necessary.
         */
        initialiseIO(exported) {
            // First check if the pin is already exported
            return Fs.access(Path.resolve(GPIO_PATH, `gpio{$this.gpio}`, 'value'), fs.constants.R_OK)
            .catch(() => this._exportGpio(exported))
            .then(() => Fs.writeFile(
                    Path.resolve(GPIO_PATH, `gpio${this.gpio}`, 'direction'),
                    "out"))
            .then(() =>
                  // If we don't set the pin active_low, then writing
                  // a 1 to /value sets the pin low, and vice-versa.
                  Fs.writeFile(Path.resolve(GPIO_PATH, `gpio${this.gpio}`,
                                            'active_low'), 1))
            .catch((e) => {
                Utils.TRACE(TAG, `Failed to initialise ${this.gpio} ${e}`);
            });
        }

        // Try and export the pin
        _exportGpio(exported) {
            Utils.TRACE(TAG, `${this.gpio} is not exported; exporting`);
            return Fs.writeFile(
                Path.resolve(GPIO_PATH, 'export'), this.gpio, "utf8")
            .then(() => {
                // Use a timeout to give it time to get set up; it takes a while
                return new Promise((resolve) => {
                    setTimeout(resolve, 1000);
                })
            })
        }

        /**
         * Return a promise to set the current state of the pin to the
         * given state
         */
        setValue(state) {
            return Fs.writeFile(
                Path.resolve(GPIO_PATH, `gpio${this.gpio}`, 'value'),
                state, "utf8");
        }

        /**
         * Return a promise that resolves to the current state of the pin
         */
        getValue() {
            return Fs.readFile(
                Path.resolve(GPIO_PATH, `gpio${this.gpio}`, 'value'), "utf8")
            .then((data) => parseInt(data));
        }
    }
            
    return Gpio;
});
