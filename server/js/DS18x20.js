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
			return this.getTemperature()
			.then(() => this);
		}
		
		/**
		 * Return a promise to get the temperature from the sensor
		 */
		getTemperature() {
			return Fs.readFile(
				Path.resolve(ONE_WIRE_PATH, this.id, 'w1_slave'))
			.then((content) => {
				let lines = content.toString().split("\n");
				if (lines[0].substr(-3) != "YES")
					throw new Error("DS18x20 w1_slave CRC check failed");
				let parts = lines[1].split('t=');
				if (parts.length !== 2)
					throw new Error("DS18x20 w1_slave format error");
				return parseFloat(parts[1]) / 1000;
			});
		}
	}

	/**
	 * Return a promise to get a list of available sensors
	 */
	DS18x20.list = () => {
		return Fs.readdir(ONE_WIRE_PATH)
		.then((list) => {
			let sensors = [];
			for (let i in list) {
				if (/^[\da-f][\da-f]-[\da-f]{12}$/i.test(list[i]))
					sensors.push(list[i]);
			}
			return sensors;
		});
	};

	return DS18x20;
});
