/*@preserve Copyright (C) 2017-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

let requirejs = require('requirejs');
requirejs.config({
	baseUrl: "../.."
});

requirejs(["test/TestRunner", "server/js/Historian", "common/js/Utils", "fs"], function(TestRunner, Historian, Utils, Fs) {

	let tr = new TestRunner("Historian");
	let assert = tr.assert;

	tr.addTest('unordered', () => {
		let h = new Historian({
			unordered: true,
			file: tr.tmpFile("unordered_historian.log")
		}, "test1");

		let p = Promise.resolve();

		function do_record(t, s) {
			p = p.then(() => {
				return h.record(s, t);
			});
		}

		// Create some out-of-order samples
		for (let i = 2; i >= 0; i--)
			do_record(i, i);

		/// Create some rewrites
		for (i = 1; i < 3; i++)
			do_record(i, -i);

		return p.then(() => {
			return h.getSerialisableHistory()
			.then(function(report) {
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

	tr.addTest('sampled', () => {
		let INTERVAL = 50;
		let COUNT = 7;
		let nsamples = 0;

		let h = new Historian({
			file: tr.tmpFile("sampled_historian.log"),
			interval: INTERVAL
		}, "test2");

		h.start(
			() => {
				if (nsamples >= COUNT) {
					h.stop();
					h.getSerialisableHistory()
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

	tr.run();
});
