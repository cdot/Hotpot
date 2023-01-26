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
import getopt from "posix-getopt";
import { expandEnv } from "../src/common/expandEnv.js";
import { DataModel } from "../src/common/DataModel.js";
import { Controller } from "../src/server/Controller.js";
import { GoogleCalendar } from "../src/server/GoogleCalendar.js";

Controller.Model.thermostat = { $unchecked: true };
Controller.Model.pin = { $unchecked: true };
const HOTPOT_MODEL = {
	server: { $unchecked: true },
	controller: Controller.Model
};

const go_parser = new getopt.BasicParser(
  "h(help)l(list)C:(calendar)c:(config)",
  process.argv);

const DESCRIPTION = [
	"-h, --help - Show this help",
	"-l, --list - List available calendars",
	"-C, --calendar=ARG - Name of calendar (default is first)",
	"-c, --config=ARG - Configuration file (default hotpot.cfg)"
].join("\n");

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

const cliopt = {
  config: "~/hotpot.cfg"
};
let option;
while ((option = go_parser.getopt())) {
  switch (option.option) {
  case 'l': cliopt.list = true; break;
  case 'C': cliopt.calendar = option.optarg; break;
  case 'c': cliopt.config = option.optarg; break;
  default: console.log(DESCRIPTION); process.exit(0);
	}
}

DataModel.loadData(expandEnv(cliopt.config), HOTPOT_MODEL)
.then(function(config) {
	if (!cliopt.calendar) {
		for (cliopt.calendar in config.controller.calendar)
			break;
	}
	var cfg = config.controller.calendar[cliopt.calendar];

	if (!cfg)
		throw Error(`No calendar ${cliopt.calendar} in config`);
	console.log("Using calendar '" + cliopt.calendar + "'");

	var cal = new GoogleCalendar(cfg, cliopt.calendar);

	if (cliopt.list)
		listCalendars(cal);
	else
		showCalendar(cal);
});

