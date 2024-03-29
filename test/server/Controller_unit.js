/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/
/*eslint-env node */

/* global HOTPOT_SIM */
import chai from "chai";
const assert = chai.assert;
import chaiHttp from "chai-http";
chai.use(chaiHttp);
import { Request } from "../../src/common/Request.js";
import NodeMailer from "nodemailer";
import { Expectation } from "../Expectation.js";
import { DataModel } from "../../src/common/DataModel.js";
import { Controller } from "../../src/server/Controller.js";
import { Simulator } from "../../src/server/Simulator.js";
import Path from "path";
import { fileURLToPath } from "url";
const __dirname = Path.dirname(fileURLToPath(import.meta.url));

global.HOTPOT_SIM = undefined;

describe("Controller", function() {

  this.timeout(10000);

	const config = {
		thermostat: {
			HW: {
				id: "28-0115914ff5ff",
				poll_every: 13,
				timeline: {
					min: 0,
					max: 50,
					period: 86400000,
					points: [
						{
							time: "00:00",
							value: 10
						},
						{
							time: "18:00",
							value: 40
						}
					]
				},
				history: {
					file: "$PWD/HW_temp.log",
					interval: 10000
				}
			},
			CH: {
				id: "28-0316027f81ff",
				poll_every: 7,
				timeline: {
					min: 0,
					max: 25,
					period: 86400000,
					points: [
						{
							time: "00:00",
							value: 8.638465723612622
						},
						{
							time: "18:00",
							value: 8.829166666666667
						}
					]
				},
				history: {
					file: "$PWD/CH_temp.log",
					interval: 10000
				}
			}
		},
		pin: {
			CH: {
				gpio: 23,
				history: {
					file: "$PWD/CH_state.log"
				}
			},
			HW: {
				gpio: 25,
				history: {
					file: "$PWD/HW_state.log"
				}
			}
		},
		valve_return: 500,
		rule_interval: 3000,
		rule: {
			HW: {
				$instance_of: "src/server/HotWaterRule"
			},
			CH: {
				$instance_of: "src/server/CentralHeatingRule"
			}
		},
		calendar: {
			"Hotpot Test": {
				$instance_of: "src/server/HotpotCalendar",
        file: "calendar.json",
				update_period: 6,
				cache_length: 24
			}
		},
		weather: {
			"MetOffice": {
				$instance_of: "src/server/MetOffice",
				api_key: "f6268ca5-e67f-4666-8fd2-59f219c5f66d",
				history: {
					file: "weather.log"
				}
			}
		}
	};

  function UNit() {}

	it("basic", () => {
	  HOTPOT_SIM = new Simulator();
		return DataModel.remodel({
      index: "test",
      data: config,
      model: Controller.Model,
      loadFileable: f => Promise.resolve(undefined)
    })
		.then(controller => controller.initialise())
		.then(controller => controller.stop())
		.then(() => HOTPOT_SIM.stop());
	});
  
	it("state", () => {
	  HOTPOT_SIM = new Simulator();
		let controller;
		return DataModel.remodel({
      index: "test",
      data: config,
      model: Controller.Model,
      loadFileable: f => Promise.resolve(undefined)
    })
		.then(c => {
			controller = c;
      return controller.initialise();
		})
		.then(() => {
			return controller.getSerialisableState()
			.then(ser => {
				assert.equal(typeof ser.thermostat.HW, "object");
				assert.equal(typeof ser.thermostat.CH, "object");
				assert.equal(typeof ser.pin.HW, "object");
				assert.equal(typeof ser.pin.CH, "object");
				assert.equal(typeof ser.calendar["Hotpot Test"], "object");
				assert.equal(typeof ser.weather.MetOffice, "object");
			});
		})
		.then(() => controller.stop())
		.then(() => HOTPOT_SIM.stop());
	});

	it("log", () => {
		let controller;

	  HOTPOT_SIM = new Simulator();
		return DataModel.remodel({
      index: "test",
      data: config,
      model: Controller.Model,
      loadFileable: f => Promise.resolve(undefined)
    })
		.then(c => {
			controller = c;
			return controller.initialise();
		})
		// Give it time to poll
		.then(() => new Promise(resolve => setTimeout(resolve, 1000)))
		.then(() => controller.getLog("thermostat", "CH",
									                {since: Date.now() - 20000}))
		.then(ser => console.debug(ser))
		.then(() => controller.stop())
		.then(() => HOTPOT_SIM.stop());
	});

	it("boost", () => {
		let controller;
	  HOTPOT_SIM = new Simulator();
		return DataModel.remodel({
      index: "test",
      data: config,
      model: Controller.Model,
      loadFileable: f => Promise.resolve(undefined)
    })
		.then(c => {
			controller = c; return controller.initialise();
		})
		.then(() => controller.makeRequest(
      "HW",
			{
        source:"test",
				service:"HW",
				temperature:99,
				until: "boost"
      }))
		.then(() => controller.getSerialisableState())
		.then(ser => {
			let req = ser.thermostat.HW.requests[0];
			assert.equal(req.source, "test");
			assert.equal(req.temperature, 99);
			assert.equal(req.until, "boost");
		})
		.then(() => controller.stop())
		.then(() => HOTPOT_SIM.stop());
	});

/*	it("mailer", () => {
    let controller;
	  HOTPOT_SIM = new Simulator();
		return DataModel.remodel({
      index: "test",
      data: config,
      model: Controller.Model,
      loadFileable: f => Promise.resolve(undefined)
    })
		.then(c => {
			controller = c;
			return controller.initialise();
		})
		.then(() => controller.sendMailToAdmin("Test Subject", "Test Message"))
		.then(info => {
			//console.log(info);
			assert.equal(info.envelope.from, "source@hotpot.co.uk");
			assert.equal(info.envelope.to, "dest@hotpot.co.uk");
			let url = NodeMailer.getTestMessageUrl(info);
			request({url: url, method:"GET"},
					function (error, response, body) {
						assert.equal(error, null);
						//console.log(body);
					});
		})
		.then(() => controller.stop())
		.then(() => HOTPOT_SIM.stop());
	});*/
});

