/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
	baseUrl: "../.."
});

requirejs(["fs", "common/test/TestRunner", "common/test/Expectation", "common/js/Utils", "common/js/DataModel", "server/js/Thermostat"], function(fs, TestRunner, Expectation, Utils, DataModel, Thermostat) {
	let tr = new TestRunner("Thermostat");
	let assert = tr.assert;
	const Fs = fs.promises;

	tr.addTest("initialise", () => {
		HOTPOT_DEBUG = require('../js/DebugSupport.js');
		return DataModel.remodel(
			"test",
			{ id: "FF-C04EFECAFEBABE",
			  timeline: {
				  min: 0,
				  max: 50,
				  period: 86400000,
				  points: [
					  {
						  "time": "00:00",
						  "value": 0
					  },
					  {
						  "time": "23:59:59",
						  "value": 10
					  }
				  ]
			  }
			}, Thermostat.Model, [])
		.then(th => {
			assert.isUndefined(th.history);

			return th.initialise()
			.then(th => {
				assert(th instanceof Thermostat);
				assert(th.getTargetTemperature() <= 10);
				assert(th.getTargetTemperature() >= 0);
				assert.equal(th.getMaximumTemperature(), 10);
				return th.poll();
			})
			.then(() => th.getSerialisableState())
			.then(st => {
				assert(st.temperature <= 12);
				assert(Math.abs(st.target - th.getTargetTemperature()) < 0.1);
			assert.equal(st.requests.length, 0);
				th.stop();
			})
			.then(() => HOTPOT_DEBUG.stop());
		});
	});

	tr.run();
});
