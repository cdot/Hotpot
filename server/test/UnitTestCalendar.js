/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["test/TestRunner", "test/Expectation", "common/js/Utils", "common/js/Time", "server/js/Calendar"], (TestRunner, Expectation, Utils, Time, Calendar) => {
    let tr = new TestRunner("Calendar");
    let assert = tr.assert;

	tr.addTest("parse unprefixed events", () => {
		let now = Time.now() + 250;
		let cal = new Calendar({}, "Unprefixed");
		let spec = 1;
		let exp = new Expectation(5);
		cal.setTrigger((id, s, t, u) => {
			//console.log(`SAW ${id}, ${s}, ${t}, ${u}`);
			if (/1$/.test(id)) {
				assert.equal(id, "Calendar 'Unprefixed' 1");
				assert.equal(s, "SA");
				assert.equal(t, 18);
				assert.equal(u, Utils.BOOST);
				exp.saw(0);
			} else if (/2$/.test(id)) {
				assert.equal(s, "sb");
				assert.equal(t, 50);
				assert.equal(now + 500, u);
				exp.saw(1);
			} else if (/3$/.test(id)) {				
				assert.equal(s, "sc");
				assert.equal(t, 20);
				assert.equal(now + 500, u);
				exp.saw(2);
			} else if (/4$/.test(id)) {				
				assert.equal(s, "SD");
				assert.equal(t, 50);
				assert.equal(now + 500, u);
				exp.saw(3);
			} else if (/5$/.test(id)) {				
				assert.equal(s, "Se");
				assert.equal(t, 20);
				assert.equal(Utils.BOOST, u);
				exp.saw(4);
			}
			spec++;
		});
		cal.parseEvents(now + 250, now + 500, "SA BOOST 18; sb 50 sc=20; SD=50 Se boost 20");
		return exp.expect();
	});
	
	tr.addTest("parse prefixed events", () => {
		let now = Time.now() + 250;
		let cal = new Calendar({ prefix: "Test:" }, "Prefixed");
		let spec = 1;
		let exp = new Expectation(5);
		//Utils.TRACEwhat("all");
		cal.setTrigger((id, s, t, u) => {
			//console.log(`SAW ${id}, ${s}, ${t}, ${u}`);
			if (/1$/.test(id)) {
				assert.equal(id, "Calendar 'Prefixed' 1");
				assert.equal(s, "SA");
				assert.equal(t, 18);
				assert.equal(u, Utils.BOOST);
				exp.saw(0);
			} else if (/2$/.test(id)) {
				assert.equal(s, "sb");
				assert.equal(t, 50);
				assert.equal(now + 500, u);
				exp.saw(1);
			} else if (/3$/.test(id)) {				
				assert.equal(s, "sc");
				assert.equal(t, 20);
				assert.equal(now + 500, u);
				exp.saw(2);
			} else if (/4$/.test(id)) {				
				assert.equal(s, "SD");
				assert.equal(t, 50);
				assert.equal(now + 500, u);
				exp.saw(3);
			} else if (/5$/.test(id)) {				
				assert.equal(s, "Se");
				assert.equal(t, 20);
				assert.equal(Utils.BOOST, u);
				exp.saw(4);
			}
			spec++;
		});
		cal.parseEvents(now + 250, now + 500, "Test: SA BOOST 18; sb 50 Test: sc=20; Test: SD=50 Se boost 20");
		return exp.expect();
	});

	tr.addTest("parse bad unprefixed events", () => {
		let now = Time.now() + 250;
		let cal = new Calendar({ }, "BAD");
		cal.setTrigger((id, s, t, u) => {
			assert.fail();
		});
		cal.parseEvents(now + 250, now + 500, " SA AS boost");
		cal.parseEvents(now + 250, now + 500, " 99");
	});
			   
	tr.addTest("parse bad prefixed events", () => {
		let now = Time.now() + 250;
		let cal = new Calendar({ prefix: "warm" }, "BAD");
		cal.setTrigger((id, s, t, u) => {
			assert.fail();
		});
		cal.parseEvents(now + 250, now + 500, " no prefix 99 warm ignore");
	});
			   
	tr.run();
});

