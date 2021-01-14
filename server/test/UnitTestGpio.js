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
	
	Fs.stat(`$GPIO_PATH}/gpio${PIN}`)
	.then((stat) => {
		tr.addTest("basic functionality", async function() {
			let gpio = new Gpio(IN);
			return Fs.writeFile(`${GPIO_PATH}/unexport`, PIN)
			.then(() => gpio.initialiseIO())
			.then(() => gpio.setState(1))
			.then(() => gpio.getState())
			.then((s) => { assert.equal(s, 1); })
			.then(() => gpio.setState(0))
			.then(() => gpio.getState())
			.then((s) => { assert.equal(0, s); });
		});

		tr.run();
	})
	.catch((e) => {
		console.error(`UnitTestGpio require GPIO pin ${PIN} to be exported to run`);
	});
});
