/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["fs", "test/TestRunner", "test/Expectation", "common/js/Utils", "common/js/DataModel", "server/js/Pin"], function(fs, TestRunner, Expectation, Utils, DataModel, Pin) {
    let tr = new TestRunner("Pin");
    let assert = tr.assert;
	const Fs = fs.promises;

	Utils.setTRACE("all");
	
	tr.deTest("initialise; already exported", async function() {
		HOTPOT_DEBUG = require('../js/DebugSupport.js');
		return Fs.mkdtemp("testdata")
		.then((td) => {
			HOTPOT_DEBUG.setPinPath(td);
			GPIO_PATH = `${td}/`;
			return Fs.mkdir(`${GPIO_PATH}/gpio6`)
			.then(() => Fs.writeFile(`${GPIO_PATH}/gpio6/value`, "0"))
			.then(() => DataModel.remodel("test", {gpio:6, history:{file:`${GPIO_PATH}/gpiostate.log`}}, Pin.Model, []));
		})
		.then((p) => {
			return p.initialise();
		})
		.then(() => {
			return Fs.readFile(`${GPIO_PATH}gpio6/direction`)
			.then((c) => assert.equal("out", c));
		})
		.then((p) => {
			return Fs.readFile(`${GPIO_PATH}gpio6/active_low`)
			.then((c) => assert.equal("1", c));
		})
		.then(() => {
			return tr.rm_rf(GPIO_PATH);
		});
	});

	tr.addTest("basic functionality", async function() {
		HOTPOT_DEBUG = require('../js/DebugSupport.js');
		return Fs.mkdtemp("testdata")
		.then((td) => {
			HOTPOT_DEBUG.setPinPath(td);
			GPIO_PATH = `${td}/`;
			return Fs.mkdir(`${GPIO_PATH}/gpio6`)
			.then(() => Fs.writeFile(`${GPIO_PATH}/gpio6/value`, "0"))
			.then(() => DataModel.remodel("test", {gpio:6, history:{file:`${GPIO_PATH}/gpiostate.log`}}, Pin.Model, []));
		})
		.then((p) => p.initialise())
		.then((p) => {
			return p.set(1)
			.then(() => p.getState())
			.then((s) => { assert.equal(s, 1); })
			.then(() => p);
		})
		.then((p) => {
			return p.set(0)
			.then(() => p.getState())
			.then((s) => { assert.equal(0, s); })
			.then(() => p);
		})
		.then((p) => {
			return p.getSerialisableState()
			.then((log) => {
				assert.equal(log.reason, "");
				assert.equal(log.state, 0);
			})
			.then(() => p);
		})
		.then((p) => p.getSerialisableLog(0))
		.then((log) => {
			console.log("LOG", log);
		})
		.then(() => {
			HOTPOT_DEBUG.stop();
			return tr.rm_rf(GPIO_PATH);
		});
	});

	tr.run();
});
