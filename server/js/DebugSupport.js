/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const fs = require("fs");
const Fs = fs.promises;

/**
 * Support for running a hotpot server without connected hardware.
 * Provides thin stubs for ds18x20 devices. The stubs return temperatures
 * that vary between samples according to the rates defined in RATES.
 */
// Heating and cooling rates, in degrees per second
const RATES = [
    { HW: -0.01, CH: -0.03 }, // OFF = COOL
    { HW: 0.333, CH: 0.1 }   // ON = WARM
];

// Service object simulates a DS18x20
class Service {
	constructor(debugSupport) {
		this.ds = debugSupport;
		this.thermostat = null;
		this.pin = null;
	}

	setPin(pin) {
		this.pin = pin;
		try {
			fs.mkdirSync(`${this.ds.pin_path}/gpio${pin.gpio}`);
		} catch(ignore) {}
		fs.writeFileSync(`${this.ds.pin_path}/gpio${pin.gpio}/value`, 0);
	}

	setThermostat(th) {
		this.thermostat = th;
		this.temperature = th.getTargetTemperature() / 2;
	}

	/**
	 * Set an array of samples to grab from.
	 */
	setSamples(samples) {
		this.samples = samples;
		this.sampleCtr = -1;
	}

	// Thermostat simulation can operate in two modes; the default,
	// where the temperature is sampled every 1/2 a second and varies
	// according to the pin state as dictated by RATES.
	//
	// In sampled mode, a set of samples supplied are stepped through on
	// each call to get() on the DS18x20 simulation.
    _getNextTemperature() {
		let self = this;
		let ds = this.ds;
		let gpio = this.pin.gpio;
        Fs.readFile(`${ds.pin_path}/gpio${gpio}/value`)
        .then((data) => {
            var pState = parseInt(data.toString());
            if (isNaN(pState)) {
                throw Error(`pState from ${ds.pin_path}/gpio${gpio}/value=${data} was unparseable`);
                pState = 0;
            }
            self.temperature += RATES[pState][self.thermostat.name];
			if (self.temperature < 0)
				self.temperature = 0;
        })
        .catch((e) => {
			// No state in the value file yet
        });
		if (!this.interrupted) {
			this.timer = setTimeout(() => {
				self._getNextTemperature();
			}, 1000);
		}
	}

	// DS18x20 simulation
	get() {
		if (this.samples) {
			this.sampleCtr = (this.sampleCtr + 1) % this.samples.length;
			return Promise.resolve(this.samples[this.sampleCtr]);
		} else {
			if (!this.isSimulating)
				this._getNextTemperature();
			return Promise.resolve(this.temperature);
		}
	}
}

class DebugSupport {

	constructor() {
		this.services = [];
		this.setPinPath("gpio")
	}

	// Get the debug service that corresponds to the pin or thermostat
	getServiceForThermostat(th) {
		let service = this.services[th.name];
		if (typeof service === "undefined")
			service = new Service(this);
		service.setThermostat(th);
		this.services[th.name] = service;
		return service;
    }
	
	// Get the debug service that corresponds to the pin or thermostat
	getServiceForPin(pin) {
		let service = this.services[pin.name];
		if (typeof service === "undefined")
			service = new Service(this);
		service.setPin(pin);
		this.services[pin.name] = service;
		return service;
    }

	// Use from unit tests only
	setPinPath(path) {
		try {
			fs.mkdirSync(path);
		} catch (ignore) {}
		this.pin_path = path;
		GPIO_PATH = `${path}/`;
	}

	stop() {
		for (let k in this.services) {
			let s = this.services[k];
			s.interrupted = true;
			if (s.timer)
				clearTimeout(s.timer);
		}
	}
}

module.exports = new DebugSupport();

