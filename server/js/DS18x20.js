/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Find and read DS18x20 temperature sensors on Respberry Pi
 */
define("server/js/DS18x20", ["fs", "path", "common/js/Utils"], (fs, Path, Utils) => {

	const Fs = fs.promises;
	const TAG = "DS18x20";
	
	class DS18x20 {

		constructor(id) {
			this.id = id;
		}
		
		/**
		 * Return a promise to get the temperature from the sensor
		 */
		get() {
			let self = this;
			return Fs.readFile(
				Path.resolve('/sys/bus/w1/devices/', self.id, 'w1_slave'))
			.then((content) => {
				return parseFloat(content.toString());
			});
		}
	}

	return DS18x20;
});
