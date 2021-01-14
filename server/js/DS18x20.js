/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Interface to DS18x20 temperature sensors
 */

define("server/js/DS18x20", ["fs", "path", "common/js/Utils"], (fs, Path, Utils) => {

	const Fs = fs.promises;
	const TAG = "DS18x20";

	// Base path of all one-wire device paths. This is declared as static so it
	// can be overridded in DebugSupport.js
	const ONE_WIRE_PATH = "/sys/bus/w1/devices";

	class DS18x20 {

		constructor(id) {
			this.id = id;
		}

		/**
		 * Ensure the sensor exists and can be read.
		 */
		initialiseSensor() {
			return this.getTemperature();
		}
		
		/**
		 * Return a promise to get the temperature from the sensor
		 */
		getTemperature() {
			return Fs.readFile(
				Path.resolve(ONE_WIRE_PATH, this.id, 'w1_slave'))
			.then((content) => {
				return parseFloat(content.toString());
			});
		}
	}

	return DS18x20;
});
