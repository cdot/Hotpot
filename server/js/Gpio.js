/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * This module provides an interface to GPIO pins.
 * It uses the "integer" sysfs interface, which is deprecated. However
 * support for libgpiod requires cross-compilation, so sticking with
 * sysfs for now.
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
		 * Promise to initialise the pin. This will export the pin if necessary.
		 * direction=in|out will set the pin direction
		 * active=0 will write 1 to active_low
		 * active=1 will write 0 to active_low
		 */
		initialiseGpio(direction, active, exported) {
			// First check if the pin is already exported
			return this.isExported()
			.catch(() => this.export(exported))
			.then(() => this.setDirection(direction))
			.then(() => this.setActive(active))
			.catch(e => {
				console.error(`Failed to initialise ${this.gpio} ${e}`);
				throw e;
			});
		}

		isExported() {
			return Fs.access(`${GPIO_PATH}/gpio${this.gpio}`);
		}

		// Try and export the pin
		export() {
			return Fs.writeFile(
				Path.resolve(GPIO_PATH, 'export'), this.gpio, "utf8")
			.then(() => {
				// Use a timeout to give it time to get set up; it takes a while
				return new Promise(resolve => {
					Utils.startTimer(`export${this.gpio}`, resolve, 1000);
				})
			})
		}

		setDirection(dirn) {
			return Fs.writeFile(
				Path.resolve(GPIO_PATH, `gpio${this.gpio}`, 'direction'),
				dirn);
		}

		setActive(lohi) {
			let path = Path.resolve(
				GPIO_PATH, `gpio${this.gpio}`, 'active_low');
			return Fs.writeFile(path, (lohi == "low") ? 1 : 0);
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
			.then(data => parseInt(data));
		}
	}

	return Gpio;
});
