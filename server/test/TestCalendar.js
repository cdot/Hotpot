// Test for Calendar. Supports listing of available calendars, useful
// for setting up initial config.
/*eslint-env node */
const Getopt = require("node-getopt");
const Q = require("q");

const Utils = require("../../common/Utils.js");
const DataModel = require("../../common/DataModel.js");

const Controller = require("../Controller.js");
const Calendar = require("../Calendar.js");
Controller.Model.thermostat = { $skip: true };
Controller.Model.pin = { $skip: true };
const HOTPOT_MODEL = {
    server: { $skip: true },
    controller: Controller.Model
};

var getopt = new Getopt([
    [ "h", "help", "Show this help" ],
    [ "l", "list", "List available calendars" ],
    [ "c", "calendar=ARG", "Name of calendar (default is first)" ],
    [ "f", "config=ARG", "Configuration file (default ./hotpot.cfg)" ]
])
    .bindHelp()
    .parseSystem();

var cliopt = getopt.options;

if (typeof cliopt.config === "undefined") {
    cliopt.config = "./test/simulated_hotpot.cfg";
}

Q.longStackSupport = true;

Utils.setTRACE("all");

function showCalendar(cal) {
    cal
        .authorise()
        .then(function() {
            return cal.fillCache();
        })
        .then(function() {
            Utils.LOG(cal.schedule);
        })
        .catch(function(e) {
            console.error(e.stack);
        });
}

function listCalendars(cal) {
    cal.authorise()
        .then(function() {
            return cal.listCalendars();
        })
        .then(function(data) {
            for (var i in data) {
                console.log(data[i].summary + " - '" + data[i].id + "'");
            }
        })
        .catch(function(e) {
            console.error(e.stack);
        });
}

DataModel.loadData(cliopt.config, HOTPOT_MODEL)
    .done(function(config) {
        if (!cliopt.calendar) {
            for (cliopt.calendar in config.controller.calendar)
                break;
        }
        var cfg = config.controller.calendar[cliopt.calendar];

        if (!cfg)
            throw Utils.report("No calendar ", clipopt.calendar, " in config");
        console.log("Using calendar '" + cliopt.calendar + "'");

        var cal = new Calendar(cfg, cliopt.calendar);

        if (cliopt.list)
            listCalendars(cal);
        else
            showCalendar(cal);
    });
