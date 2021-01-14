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

	class Gpio {

		constructor(gpio) {
			this.gpio = gpio;
		}

		/**
		 * Promise to initialise the pin. All this is intended to so
		 * is determine if there is support for this GPIO pin, and
		 * ensure future getValue() and setValue() calls succeed.
		 */
		initialiseIO(exported) {
			// First check if the pin can be read. If it can, it is already
			// exported and we can move on to setting the direction, otherwise
			// we have to export it.
			return this.getValue()
            .then(() => this._setDirection())
            .catch(() => this._exportGpio(exported));
        }

        // Try and export the pin
        _exportGpio(exported) {
            if (exported)
                // Already exported, no point trying again
                throw new Error("GPIO setup failed");

            return Fs.writeFile(
				Path.resolve(GPIO_PATH, 'export'), this.gpio, "utf8")
            .then(() => {
                // Use a timeout to give it time to get set up
                return new Promise((resolve) => {
                    setTimeout(resolve, 500);
                })
			})
			// Re-do the read check
            .then(() => this.initialise(true));
        }

        // The pin is known to be exported, set the direction
        _setDirection() {
            return Fs.writeFile(
				Path.resolve(GPIO_PATH, `gpio${self.gpio}`, 'direction'),
				"out")
            .then(() =>
				  // If we don't set the pin active_low, then writing
				  // a 1 to /value sets the pin low, and vice-versa.
				  Fs.writeFile(Path.resolve(GPIO_PATH, `gpio${self.gpio}`,
											'active_low'), 1))
			.then(() => this.set(0));
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
