// Test for Calendar. Supports listing of available calendars, useful
// for setting up initial config.
/*eslint-env node */
const Getopt = require("node-getopt");
const Q = require("q");

const Utils = require("../common/Utils.js");
const DataModel = require("../common/DataModel.js");

const Calendar = require("./Calendar.js");

var getopt = new Getopt([
    [ "h", "help", "Show this help" ],
    [ "l", "list", "List available calendars" ],
    [ "c", "calendar=ARG", "Name of calendar (default is first)" ],
    [ "f", "config=ARG", "Configuration file (default ./hotpot.cfg)" ]
])
    .bindHelp()
    .parseSystem();

var cliopt = getopt.options;

if (typeof cliopt.config === "undefined")
    cliopt.config = "./hotpot.cfg";

Q.longStackSupport = true;

//Utils.setTRACE("all");

function showCalendar(calendar, config) {
    config.controller.calendar[calendar].id = "primary";
    var cal = new Calendar(calendar, config.controller.calendar[calendar]);
    cal
        .authorise()
        .then(function() {
            return cal.fillCache();
        })
        .then(function() {
            console.log(Utils.dump(cal));
        })
        .catch(function(e) {
            console.error(e.stack);
        });
}

function listCalendars(calendar, config) {
    var cfg = config.controller.calendar[calendar];

    var cal = new Calendar(calendar, cfg);
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

DataModel.loadData(cliopt.config)
    .done(function(config) {
        if (!cliopt.calendar) {
            for (cliopt.calendar in config.controller.calendar)
                break;
            console.log("Using calendar '" + cliopt.calendar + "'");
        }
        if (cliopt.list)
            listCalendars(cliopt.calendar, config);
        else
            showCalendar(cliopt.calendar, config);
    });
