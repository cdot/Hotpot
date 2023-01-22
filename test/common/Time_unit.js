/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

import { assert } from "chai";
import { Time } from "../../src/common/Time.js";

describe("Time", () => {

	const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms

	it('should give a time of 00:00', () => {
		let lds = new Date().toDateString();
		assert.equal(Date.parse(lds), Time.midnight());
		let d = new Date(Time.midnight());
		assert.equal(0, d.getHours());
		assert.equal(0, d.getMinutes());
		assert.equal(0, d.getSeconds());
	});

	it('should be before the current time', () => {
		assert(Time.midnight() <= Date.now());
	});

	it('should parse h, h:m, and h:m:s', () => {
		let today = Time.parse('0');
		assert.equal(0, today);
		today = Time.parse('00:0');
		assert.equal(0, today);
		today = Time.parse('0:00:00');
		assert.equal(0, today);
	});

	it('should parse small mins', () => {
		let t1 = Time.parse('00:01');
		assert.equal(60000, t1);
	});

	it('should parse small ms', () => {
		let t1 = Time.parse('00:00:00.001');
		assert.equal(1, t1);
	});

	it('should parse single digits', () => {
		let t1 = Time.parse('0:0:1');
		assert.equal(t1, 1000);
	});

	it('should parse large secs', () => {
		let t1 = Time.parse('23:59:59');
		assert.equal((((23*60)+59)*60+59)*1000,ONE_DAY-1000);
		assert.equal(t1, ONE_DAY - 1000);
	});

	it('should parse large ms', () => {
		let t1 = Time.parse('23:59:59.999');
		assert.equal(t1, ONE_DAY - 1);
	});

	it('should throw on bad times', () => {
		try {
			Time.parse('24');
			assert(false);
		} catch (e) {
		}
		try {
			Time.parse('00:60');
			assert(false);
		} catch (e) {
		}
		try {
			Time.parse('00:00:61');
			assert(false);
		} catch (e) {
		}
	});

	it("should unparse 1 as 00:00:00.001 (1ms)", () => {
		assert.equal(Time.formatHMS(1), "00:00:00.001");
	});

	it("should formatHMS 0 as 00:00", () => {
		assert.equal(Time.formatHMS(0), "00:00");
	});

	it("should formatHMS 1 hour as 01:00", () => {
		assert.equal(Time.formatHMS(60 * 60 * 1000), "01:00");
	});

	it("should formatHMS formatHMS 1 minute as 00:01", () => {
		assert.equal(Time.formatHMS(60 * 1000), "00:01");
	});

	it("should formatHMS 1 second as 00:00:01", () => {
		assert.equal(Time.formatHMS(1000), "00:00:01");
	});

	it("should formatHMS 23:59:59.999", () => {
		assert.equal(Time.formatHMS(ONE_DAY-1), "23:59:59.999");
	});

	it("should check upper end of range", () => {
		try {
			Time.formatHMS(ONE_DAY + 1);
			assert(false);
		} catch (e) {
		}
	});

	it("should check lower end of range", () => {
		try {
			Time.formatHMS(-1);
			assert(false);
		} catch (e) {
		}
	});

  const durs = [
    { in: "1 second", out: 1000, back: "1 second" },
    { in: "2 second", out: 2000, back: "2 seconds" },
    { in: "1 seconds", out: 1000, back: "1 second" },
    { in: "1s", out: 1000, back: "1 second" },
    { in: "1minute", out: 60000, back: "1 minute" },
    { in: "1 minutes", out: 60000, back: "1 minute" },
    { in: "1m", out: 60000, back: "1 minute" },
    { in: "1 hours", out: 3600000, back: "1 hour" },
    { in: "1h", out: 3600000, back: "1 hour" },
    { in: "1d", out: 24 * 60 * 60 * 1000, back: "1 day" },
    { in: "1day", out: 24 * 60 * 60 * 1000, back: "1 day" },
    { in: "1w", out: 7 * 24 * 60 * 60 * 1000, back: "1 week" },
    { in: "1 week", out: 7 * 24 * 60 * 60 * 1000, back: "1 week" },
    { in: "1mo", out: 31 * 24 * 60 * 60 * 1000, back: "1 month" },
    { in: "2 months", out: 62 * 24 * 60 * 60 * 1000, back: "2 months" },
    { in: "1y", out: 365 * 24 * 60 * 60 * 1000, back: "1 year" },
    { in: "1 year", out: 365 * 24 * 60 * 60 * 1000, back: "1 year" },
    { in: "1y2mo",  out: (365 + 2 * 31) * 24 * 60 * 60 * 1000, back: "1 year 2 months" },
    { in: "1w 3hours",  out: (7 * 24 + 3) * 60 * 60 * 1000, back: "1 week 3 hours" },
    { in: "1y1mo1d1h1m1s", out: (((((365 + 31 + 1) * 24 + 1) * 60) + 1) * 60 + 1) * 1000, back: "1 year 1 month 1 day 1 hour 1 minute 1 second" },
    { in: "1y1w1s", out: (((((365 + 7) * 24) * 60)) * 60 + 1) * 1000, back: "1 year 1 week 1 second" },
    { in: "2s2m2h2d2mo2y", out: (((((2 * 365 + 2 * 31 + 2) * 24 + 2) * 60) + 2) * 60 + 2) * 1000, back: "2 years 2 months 2 days 2 hours 2 minutes 2 seconds" },
    { in: "0:0:1", out: 1000, back: "1 second" },
    { in: "0:1:0", out: 60 * 1000, back: "1 minute" },
    { in: "1:0:0", out: 60 * 60 * 1000, back: "1 hour" },
    { in: "1:1:1", out: ((60 + 1) * 60 + 1) * 1000, back: "1 hour 1 minute 1 second" },
    { in: "20:1", out: (20 * 60 + 1) * 60 * 1000, back: "20 hours 1 minute" }
  ];

  for (const dur of durs) {
    it(`parseDuration ${dur.in}`, () => {
      assert.equal(Time.parseDuration(dur.in), dur.out);
      assert.equal(Time.formatDuration(dur.out), dur.back);
      assert.equal(Time.parseDuration(dur.back), dur.out);
    });
  }
});
