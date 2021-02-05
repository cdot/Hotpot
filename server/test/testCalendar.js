/**
 * Test for Calendars. Supports listing of available calendars, useful
 * for setting up initial config.
 *
 * First use AuthoriseCalendars.js to authorise access to Google calendars.
 * This can be done with the hotpot.cfg you intend to use live,
 * or with a test hotpot.cfg, an example of which can be found in this
 * directory.
 *
 * You can then run this program stand-alone to test access to those
 * calendars. Test with no parameters and with -l.
 */

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
	baseUrl: "../.."
});

requirejs(["node-getopt", "common/js/Utils", "common/js/DataModel", "server/js/Controller", "server/js/GoogleCalendar"], function(Getopt, Utils, DataModel, Controller, GoogleCalendar) {

	Controller.Model.thermostat = { $skip: true };
	Controller.Model.pin = { $skip: true };
	const HOTPOT_MODEL = {
		server: { $skip: true },
		controller: Controller.Model
	};

	var getopt = new Getopt([
		[ "h", "help", "Show this help" ],
		[ "l", "list", "List available calendars" ],
		[ "d", "calendar=ARG", "Name of calendar (default is first)" ],
		[ "c", "config=ARG", "Configuration file (default ./hotpot.cfg)" ]
	])
		.bindHelp()
		.parseSystem();

	var cliopt = getopt.options;

	if (typeof cliopt.config === "undefined") {
		cliopt.config = "simulated_hotpot.cfg";
	}

	Utils.TRACEfilter("all");

	function showCalendar(cal) {
		cal
		.authorise()
		.then(() => cal.fillCache())
		.then(() => console.log("Schedule", cal.schedule))
		.catch(e => {
			console.error(e.stack);
		});
	}

	function listCalendars(cal) {
		cal.authorise()
		.then(() => cal.listCalendars())
		.then(data => {
			for (var i in data) {
				console.log(data[i].summary + " - '" + data[i].id + "'");
			}
		})
		.catch(function(e) {
			console.error(e.stack);
		});
	}

	DataModel.loadData(cliopt.config, HOTPOT_MODEL)
	.then(function(config) {
		if (!cliopt.calendar) {
			for (cliopt.calendar in config.controller.calendar)
				break;
		}
		var cfg = config.controller.calendar[cliopt.calendar];

		if (!cfg)
			throw Utils.exception("Calendar", "No calendar ",
								  clipopt.calendar, " in config");
		console.log("Using calendar '" + cliopt.calendar + "'");

		var cal = new GoogleCalendar(cfg, cliopt.calendar);

		if (cliopt.list)
			listCalendars(cal);
		else
			showCalendar(cal);
	});
});
