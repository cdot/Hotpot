/*@preserve Copyright (C) 2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

import { assert } from "chai";
import { Time } from "../../src/common/Time.js";
import { TimeValue } from "../../src/common/TimeValue.js";
import { DataModel } from "../../src/common/DataModel.js";

describe("TimValue", () => {

	it('construct', () => {
		let a = new TimeValue(10, 999);
		assert.equal(a.time, 10);
		assert.equal(a.value, 999);
		a = new TimeValue("00:10", 999);
		assert.equal(a.time, 600000);
		assert.equal(a.value, 999);
		a = new TimeValue("00:10", "999");
		assert.equal(a.time, 600000);
		assert.equal(a.value, 999);
		a = new TimeValue({
			time: "00:10", value: "99.9"
		});
		assert.equal(a.time, 600000);
		assert.equal(a.value, 99.9);
	});

	it('getSerialisable', () => {
		const a = new TimeValue({
			time: "00:10", value: "99.9"
		});
		a.getSerialisable()
		.then(a => {
			assert.equal(a.time, "00:10");
			assert.equal(a.value, 99.9);
		});
	});

	it('encode/decode trace', () => {
		const trace = [
			new TimeValue(1, 1000),
			new TimeValue(11, 100),
			new TimeValue(29, 1)
		];

		const data = TimeValue.encodeTrace(trace, 0);
		assert.deepEqual(data, [1, 0, 1000, 10, 100, 28, 1]);

		const retrace = TimeValue.decodeTrace(data);
		assert.deepEqual(retrace, trace);
	});
});
