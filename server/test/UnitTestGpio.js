/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["fs", "test/TestRunner", "test/Expectation", "common/js/Utils", "common/js/DataModel", "server/js/Gpio"], function(fs, TestRunner, Expectation, Utils, DataModel, Gpio) {
    let tr = new TestRunner("Gpio");
    let assert = tr.assert;
	const Fs = fs.promises;
	const GPIO_PATH = "/sys/class/gpio";
	const PIN = 23;

	Utils.setTRACE("Gpio");
	tr.addTest("basic functionality", async function() {
		let gpio = new Gpio(PIN);
		try {
			fs.writeFileSync(`${GPIO_PATH}/unexport`, PIN);
		} catch (e) {
			console.error(e);
		}
		return gpio.initialiseIO()
		.then(() => gpio.setValue(1))
		.then(() => gpio.getValue())
		.then((s) => { assert.equal(s, 1); })
		.then(() => gpio.setValue(0))
		.then(() => gpio.getValue())
		.then((s) => { assert.equal(0, s); });
	});

	tr.run();
});
