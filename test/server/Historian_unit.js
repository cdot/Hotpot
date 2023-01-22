/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

import { assert } from "chai";
import os from "os";
import { promises as Fs } from "fs";
import path from "path";
import { Historian } from "../../src/server/Historian.js";

describe("Historian", () => {

	it('unordered', () => {
		let i;

		const temp = path.join(os.tmpdir(), "unordered_historian.log");
    return Fs.unlink(temp)
    .catch(() => undefined)
    .then(() => {
		  const h = new Historian({
			  unordered: true,
			  file: temp
		  }, "test1");

		  // Record some out-of-order samples (backwards)
		  return h.record(2, 2)
		  .then(() => h.record(1, 1))
		  .then(() => h.record(0, 0))
		
		  // Record some rewrites
		  .then(() => h.record(-1, 1))
		  .then(() => h.record(-2, 2))

		  .then(() => h.encodeTrace())

		  .then(report => {
			  assert.equal(report.length, 7);
			  assert.equal(report[0], 0);
			  assert.equal(report[1], 0);
			  assert.equal(report[2], 0);
			  assert.equal(report[3], 1);
			  assert.equal(report[4], -1);
			  assert.equal(report[5], 2);
			  assert.equal(report[6], -2);
		  });
    });
	});

	it('sampled', () => {
		let INTERVAL = 50;
		let COUNT = 7;
		let nsamples = 0;

		const temp = path.join(os.tmpdir(), "sampled_historian.log");
    return Fs.unlink(temp)
    .catch(() => undefined)
    .then(() => {
		  const h = new Historian({
			  file: temp,
			  interval: INTERVAL
		  }, "test2");

		  h.start(
				() => {
					if (nsamples >= COUNT) {
						h.stop();
						h.encodeTrace()
						.then(report => {
							assert.equal(report.length, 2 * COUNT + 1);
							let last_t = -INTERVAL;
							for (let i = 1, j = 0; i < report.length; i += 2, j++) {
								let t = report[i];
								let d = report[i + 1];
								assert(t >= last_t + INTERVAL);
								assert.equal(d, j);
								last_t = t;
							}
						});
					}
					return nsamples++;
				});
    });
	});
});
