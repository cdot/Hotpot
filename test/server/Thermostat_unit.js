/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

global.HOTPOT_SIM = undefined;

import { assert } from "chai";
import { Expectation } from "../Expectation.js";
import { DataModel } from "../../src/common/DataModel.js";
import { Thermostat } from "../../src/server/Thermostat.js";
import { Simulator } from "../../src/server/Simulator.js";

describe("Thermostat", () => {

	it("initialise", () => {
		HOTPOT_SIM = new Simulator();
		return DataModel.remodel({
			index: "test",
			data: { id: "FF-C04EFECAFEBABE",
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
			      },
      model: Thermostat.Model
    })
		.then(th => {
			assert(!th.history);

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
			.then(() => HOTPOT_SIM.stop());
		});
	});
});
