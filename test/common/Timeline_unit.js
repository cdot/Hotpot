/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

import { assert } from "chai";
import { promises as Fs } from "fs";
import { Utils } from "../../src/common/Utils.js";
import { Time } from "../../src/common/Time.js";
import { TimeValue } from "../../src/common/TimeValue.js";
import { DataModel } from "../../src/common/DataModel.js";
import { Timeline } from "../../src/common/Timeline.js";
import Path from "path";
import { fileURLToPath } from "url";
const __dirname = Path.dirname(fileURLToPath(import.meta.url));

describe("Timeline", () => {

	const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms

	const test_line_proto = () => {
    return {
		  min: 4,
		  max: 100,
		  period: 31,
		  points: [
			  new TimeValue(1, 1000),
			  new TimeValue(11, 100),
			  new TimeValue(29, 1)
		  ]
    };
	};

	it('constructs', () => {
		var tl;
		try {
			tl = new Timeline({ period: -1 });
			assert(false, "Should not get here");
		} catch (e) {
			assert(e instanceof Error);
			assert.equal(e.name, "Timeline");
			assert.equal(e.message, "Bad configuration");
		}
		tl = new Timeline({
			min: 0,
			max: 100,
			period: 1000
		});
		// Timeline always has start point
		assert.equal(tl.nPoints, 1);
		var p = tl.getPoint(0);
		assert.equal(p.time, 0);
		assert.equal(p.value, 0);
	});

	it('points before and after time', () => {
		var tl = new Timeline(test_line_proto());
		assert.equal(tl.nPoints, 4);
		assert.equal(tl.getPointAfter(0), tl.getPoint(0));
		assert.equal(tl.getPointAfter(1), tl.getPoint(1));
		assert.equal(tl.getPointAfter(28), tl.getPoint(3));
		assert.equal(tl.getPointAfter(30), null);

		assert.equal(tl.getPointBefore(0), tl.getPoint(0));
		assert.equal(tl.getPointBefore(30), tl.points[tl.points.length-1]);
		try {
			tl.getPointBefore(31);
		} catch (e) {
			assert.equal(e.message, "00:00:00.031 is outside timeline 00:00..00:00:00.030");
		}
	});

	it('manipulate points', () => {
		var tl = new Timeline(test_line_proto());
		tl.insert(new TimeValue(2, 200));
		assert.equal(tl.nPoints, 5);

		let tp = tl.getPoint(2);
		assert.equal(tp.time, 2);
		assert.equal(tp.value, 200);
	
		tl.setTime(tp, 20);
		assert.equal(tl.getPoint(3), tp);

		tl.remove(tp);

		tp = tl.getPoint(2);
		assert.equal(tp.time, 11);
		assert.equal(tp.value, 100);
	});

	it('interpolates', () => {
		var tl = new Timeline({
			min: 4,
			max: 1000,
			period: 30,
			points: [
				new TimeValue(0, 0),
				new TimeValue(10, 100),
				new TimeValue(20, 1000)
			]
		});
		var p = tl.getPoint(2);
		assert.equal(tl.highestValue, 1000);
		assert.equal(tl.valueAtTime(0), 0);
		assert.equal(tl.valueAtTime(10), 100);
		assert.equal(tl.valueAtTime(5), 50);
		assert.equal(tl.valueAtTime(25), 500);
	});

	it("get $fileable map of Timeline from file", () => {
		const model = Utils.extend({}, { $fileable: true },
								   Timeline.Model);
		const data = __dirname + "/oneTimeline.txt";
		return DataModel.remodel({
      data: data,
      model: model,
      loadFileable: f => Fs.readFile(f)
    })
		.then(d => {
			//console.log(d);
		});
	});

});
