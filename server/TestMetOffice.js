const getopt = require("node-getopt");
const Q = require("q");
const Utils = require("../common/Utils.js");
const Config = require("../common/Config.js");
const MetOffice = require("./MetOffice.js");

var cliopt = getopt.create([
    [ "h", "help", "Show this help" ],
    [ "c", "config=ARG", "Configuration file (default ./hotpot.cfg)" ]
])
    .bindHelp()
    .parseSystem()
    .options;

if (typeof cliopt.config === "undefined")
    cliopt.config = "$HOME/hotpot.cfg";

Utils.setTRACE("all");

Q.longStackSupport = true;

Config.load(Utils.expandEnvVars(cliopt.config))
.then(function(config) {
    var mo = new MetOffice(config.controller.weather.MetOffice);
    mo.setLocation(config.server.location).done();

    mo.getSerialisableState().then(function(d) {
        Utils.TRACE("STATE", d);
	mo.getSerialisableLog()
        .then((result) => {
            Utils.TRACE(result);
        });
    });
},
function(err) {
    Utils.TRACE(err);
});
