/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["test/TestRunner", "test/Expectation", "common/js/Utils", "server/js/ScheduledEvent", "common/js/Time"], function( TestRunner, Expectation, Utils, ScheduledEvent, Time) {
    let tr = new TestRunner("ScheduledEvent");
    let assert = tr.assert;

	tr.addTest("an event in the future", async function() {
		let t = Time.now();
		let e = new Expectation(2);
		let cal = {
			trigger: (id, service, temp, until) => {
				assert.equal(id, "future");
				assert.equal(service, "CH");
				assert.equal(temp, 99);
				assert.equal(until, t + 500);
				e.saw(0);
			},
			remove: (id, service) => {
				assert.equal(id, "future");
				assert.equal(service, "CH");
				e.saw(1);
			}
		};
		let futureevent = new ScheduledEvent(
			cal, "future", t + 250, "CH", 99, t + 500);
		return e.expect();
	});
			   
	tr.addTest("a live event", function() {
		let t = Time.now();
		let e = new Expectation(2);
		let cal = {
			trigger: (id, service, temp, until) => {
				assert.equal(id, "live");
				assert.equal(service, "HW");
				assert.equal(temp, 9);
				assert.equal(until, t + 250);
				e.saw(0);
			},
			remove: (id, service) => {
				assert.equal(id, "live");
				assert.equal(service, "HW");
				e.saw(1);
			}
		};
		let liveevent = new ScheduledEvent(
			cal, "live", t - 250, "HW", 9, t + 250);
		return e.expect();
	});

	tr.addTest("a past event", function() {
		let t = Time.now();
		let cal = {
			trigger: (id, service, temp, until) => {
				fail();
			},
			remove: (id, service) => {
				fail();
			}
		};
		let pastevent = new ScheduledEvent(
			cal, "past", t - 2000, "HW", 99, t - 1000);
	});
	
	tr.run();
});

