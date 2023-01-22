/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import { assert } from "chai";
import { Expectation } from "../Expectation.js";
import { DataModel } from "../../src/common/DataModel.js";
import { ScheduledEvent } from "../../src/common/ScheduledEvent.js";
import { Time } from "../../src/common/Time.js";

describe("ScheduledEvent", () => {

	it("an event in the future", async () => {
		let t = Date.now();
		let e = new Expectation(2);
		let cal = {
      name: "Tunnocks Caramel Biscuit",
			trigger: (ev) => {
				assert.equal(ev.service, "CH");
				assert.equal(ev.source, "Calendar 'Tunnocks Caramel Biscuit'");
				assert.equal(ev.temperature, 99);
				assert.equal(ev.until, t + 500);
				e.saw(0);
			},
			remove: (ev) => {
				assert.equal(ev.service, "CH");
				assert.equal(ev.source, "Calendar 'Tunnocks Caramel Biscuit'");
				e.saw(1);
			}
		};
		let futureevent = new ScheduledEvent(
			cal, {
        start: t + 250,
        service: "CH",
        temperature: 99,
        until: t + 500
      });
		return e.expect();
	});

	it("a live event", () => {
		let t = Date.now();
		let e = new Expectation(2);
		let cal = {
      name: "Flapjack",
			trigger: ev => {
				assert.equal(ev.service, "HW");
				assert.equal(ev.temperature, 9);
				assert.equal(ev.until, t + 500);
				e.saw(0);
			},
			remove: ev => {
				assert.equal(ev.service, "HW");
				e.saw(1);
			}
		};
		let liveevent = new ScheduledEvent(
			cal, {start: t - 250, service: "HW", temperature: 9, until: t + 500});
		return e.expect();
	});

	it("a past event", () => {
		let t = Date.now();
		let cal = {
      name: "Rich Tea",
			trigger: ev => {
				assert.fail();
			},
      remove: ev => {
				assert.fail();
			}
		};
		let pastevent = new ScheduledEvent(
			cal, {start: t - 2000, service: "HW", temperature: 99, until: t - 1000});
	});
});

