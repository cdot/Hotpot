/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import { assert } from "chai";
import { Utils } from "../../src/common/Utils.js";
import { Expectation } from "../Expectation.js";
import { Time } from "../../src/common/Time.js";
import { Calendar } from "../../src/server/Calendar.js";
import { Request } from "../../src/common/Request.js";

describe("Calendar", () => {

	it("parse events", () => {
    //Utils.TRACEfilter("all");
		let now = Date.now() + 250;
		let cal = new Calendar({}, "test");
		let exp = new Expectation(5);
		cal.onTrigger((service, e) => {
      const id = e.id, s = e.service, t = e.temperature, u = e.until;
			//console.log(`SAW ${service} ${id}, ${s}, ${t}, ${u}`);
      assert.equal(s, service);
			switch (id) {
			case 0:
				assert.equal(s, "SA");
				assert.equal(t, 18);
				assert.equal(u, Request.BOOST);
        break;
			case 1:
				assert.equal(s, "SB");
				assert.equal(t, Request.OFF);
				assert.equal(now + 500 - u, 0);
				break;
      case 2:
				assert.equal(s, "SC");
				assert.equal(t, 20);
				assert.equal(now + 500 - u, 0);
        break;
			case 3:
				assert.equal(s, "SD");
				assert.equal(t, 50);
				assert.equal(now + 500 - u, 0);
				break;
			case 4:
				assert.equal(s, "SE");
				assert.equal(t, 20);
				assert.equal(Request.BOOST, u);
				break;
      default:
        assert.fail(`Unexpected ${id}`);
			}
      exp.saw(id);
		});
		cal.setServices(["SA", "SB", "SC", "SD", "SE"]);
		cal.parseEvents(
			now + 250, now + 500,
			"SMEG SA BOOST 18; sb off sc=20; SD=50 Se boost 20 NUTS");
    assert.equal(cal.schedule.length, 5);
		return exp.expect();
	});

	it("parse bad unprefixed events", () => {
		let now = Date.now() + 250;
		let cal = new Calendar({ }, "BAD");
		cal.setServices(["SA", "SB", "SC", "SD", "SE"]);
		cal.onTrigger(() => {
			assert.fail();
		});
		cal.parseEvents(now + 250, now + 500, " SA AS boost");
		cal.parseEvents(now + 250, now + 500, " 99");
	});
});

