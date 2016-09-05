// Test for Calendar
const getopt = require("node-getopt");
const Q = require("q");

const Utils = require("../common/Utils.js");
const Config = require("../common/Config.js");

const Calendar = require("./Calendar.js");

var cliopt = getopt.create([
    [ "h", "help", "Show this help" ],
    [ "c", "config=ARG", "Configuration file (default ./hotpot.cfg)" ]
])
    .bindHelp()
    .parseSystem()
    .options;

if (typeof cliopt.config === "undefined")
    cliopt.config = "./hotpot.cfg";

Q.longStackSupport = true;

Config.load(cliopt.config)
.done(function(config) {
   var cal = new Calendar("Crawford", config.controller.calendar.Crawford);

    cal
    .authorise()
    .then(function() {
        return cal.fillCache();
    })
    .then(function() {
        console.log("Active event:");
        console.log(Utils.dump(cal.getCurrent()));
    })
    .catch(function(e) {
        console.error(e.stack);
    });
});

