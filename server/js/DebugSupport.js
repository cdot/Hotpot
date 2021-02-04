/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Support for running a hotpot server without connected hardware.
 */

// Heating and cooling rates, in degrees per second
const RATES = [
	{ HW: -0.01, CH: -0.03, test: -0.1 }, // OFF = COOL
	{ HW: 0.333, CH: 0.1, test: 0.1 }   // ON = WARM
];

// Service object simulates a sensor and a pin
class Service {

	constructor(name) {
		this.name = name;
		this.pinState = 0;
		this.temperature = 12;
	}

	/**
	 * Set an array of samples to grab from.
	 */
	setSamples(samples) {
		this.samples = samples;
		this.sampleCtr = -1;
	}

	// Thermostat simulation can operate in two modes; the default,
	// where the temperature is sampled every second and varies
	// according to the pin state as dictated by RATES.
	//
	// In sampled mode, a set of samples supplied are stepped through on
	// each call to get() on the DS18x20 simulation.
	_getNextTemperature() {
		this.temperature += RATES[this.pinState][this.name];
		if (this.temperature < 0)
			this.temperature = 0;
		this.timer = setTimeout(() => this._getNextTemperature(), 1000);
	}

	initialiseGpio(dirn, active) {
		console.log(`${this.name} ${dirn}pin active ${active} simulation initialised`);
	}

	// DS18x20 simulation
	initialiseSensor() {
		console.log(`${this.name} thermostat simulation initialised`);
		return Promise.resolve(this);
	}

	getTemperature() {
		if (this.samples) {
			this.sampleCtr = (this.sampleCtr + 1) % this.samples.length;
			return Promise.resolve(this.samples[this.sampleCtr]);
		} else {
			if (!this.isSimulating) {
				this.isSimulating = true;
				this._getNextTemperature();
			}
			// No response alarm test
			//if (this.hadOne)
			//	return Promise.reject("Wobbly");
			//this.hadOne = true;
			return Promise.resolve(this.temperature);
		}
	}

	// Gpio simulation
	getValue() {
		return Promise.resolve(this.pinState);
	}

	setValue(state) {
		this.pinState = state;
		return Promise.resolve();
	}

	stop() {
		if (typeof this.timer !== "undefined") {
			clearTimeout(this.timer);
			delete this.timer;
		}
	}
}

class DebugSupport {

	constructor() {
		this.services = [];
	}

	// Construct or retrieve a Service e.g getService("CH")
	getService(name) {
		let service = this.services[name];
		if (typeof service === "undefined")
			service = new Service(name);
		this.services[name] = service;
		return service;
	}

	stop() {
		for (let k in this.services) {
			let s = this.services[k];
			s.stop();
		}
	}

	setupEmail(NodeMailer) {
		return NodeMailer.createTestAccount()
		.then(testAccount => {
			return {
				host: "smtp.ethereal.email",
				port: 587,
				user: testAccount.user,
				pass: testAccount.pass,
				from: "source@hotpot.co.uk",
				to: "dest@hotpot.co.uk"
			}
		});
	}
}

module.exports = new DebugSupport();

