/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["fs", "test/TestRunner", "test/Expectation", "common/js/Utils", "common/js/DataModel", "server/js/Pin"], function(fs, TestRunner, Expectation, Utils, DataModel, Pin) {
    let tr = new TestRunner("Pin");
    let assert = tr.assert;

	//Utils.setTRACE("Pin");
	
	tr.addTest("initialise/get/set", async function() {
		HOTPOT_DEBUG = require('../js/DebugSupport.js');
		return DataModel.remodel("test", {gpio:6}, Pin.Model, [])
		.then((p) => {
			assert(p instanceof Pin);
			return p.initialise()
			.then((p) => { assert(p instanceof Pin); })
			.then(() => p.getState())
			.then((v) => assert.equal(v, 0))
			.then(() => p.setState(1))
			.then(() => p.getState())
			.then((v) => assert.equal(v, 1))
			.then(() => p.getSerialisableState())
			.then((log) => {
				assert.equal(log.reason, "");
				assert.equal(log.state, 1);
			})
			.then(() => p.getSerialisableLog(0))
			.then((log) => {
				assert.isUndefined(log);
			})
		})
		.then(() => {
			HOTPOT_DEBUG.stop();
		});
	});

	tr.run();
});
