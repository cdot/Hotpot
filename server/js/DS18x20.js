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
		async getTemperature() {
			// Javascript is single-threaded, so the await should be
			// enough to block any other attempt to read from the wire
			// bus.
			Utils.TRACE(TAG, `Polling ${this.id}`);
			return await Fs.readFile(
				Path.resolve(ONE_WIRE_PATH, this.id, 'w1_slave'), 'latin1')
			.then((content) => {
				let lines = content.split("\n");
				if (lines[0].substr(-3) != "YES")
					throw new Error(`DS18x20 ${this.id} CRC check failed '${content}'`);
				let parts = lines[1].split('t=');
				if (parts.length !== 2)
					throw new Error("DS18x20 ${this.id} format error");
				this.lastKnownGood = Date.now();
				return parseFloat(parts[1]) / 1000;
			})
			.catch((e) => {
				Utils.TRACE(TAG, `Poll failed ${e}`);
				if (Date.now() - this.lastKnownGood > 5 * 60 * 1000) {
					// No good signal for 5 minutes
					Fs.writeFile(
						Path.resolve(
							ONE_WIRE_PATH,
							"w1_bus_master1", "w1_master_add"), this.id)
					.catch((e) => {
						Utils.TRACE(TAG, `w1_master_add failed ${e}`);
					});
				}
				throw e;
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
