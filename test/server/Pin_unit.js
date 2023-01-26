/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

global.HOTPOT_SIM = undefined;

import { assert } from "chai";
import { Expectation } from "../Expectation.js";
import { DataModel } from "../../src/common/DataModel.js";
import { Pin } from "../../src/server/Pin.js";
import { Simulator } from "../../src/server/Simulator.js";

describe("Pin", () => {

	it("initialise/get/set", async () => {
		HOTPOT_SIM = new Simulator();
		return DataModel.remodel({data: {gpio:6}, model: Pin.Model})
		.then(p => {
			assert(p instanceof Pin);
			return p.initialise()
			.then(p => { assert(p instanceof Pin); })
			.then(() => p.getState())
			.then(v => assert.equal(v, 0))
			.then(() => p.setState(1))
			.then(() => p.getState())
			.then(v => assert.equal(v, 1))
			.then(() => p.getSerialisableState())
			.then(log => {
				assert.equal(log.reason, "");
				assert.equal(log.state, 1);
			})
			.then(() => p.getSerialisableLog(0))
			.then(log => {
				assert(!log);
			});
		})
		.then(() => {
			HOTPOT_SIM.stop();
		});
	});
});
