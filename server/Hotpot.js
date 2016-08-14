/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const DESCRIPTION =
"DESCRIPTION\nA Raspberry PI central heating control server.\n" +
"See README.md for details\n\nOPTIONS\n";

const getopt = require("node-getopt");

const Location = require("../common/Location.js");
const Utils = require("../common/Utils.js");

const Config = require("./Config.js");
const Apis = require("./Apis.js");
const Server = require("./Server.js");
const Controller = require("./Controller.js");

const TAG = "Hotpot";

HOTPOT_DEBUG = undefined;

const Rule = require("./Rule.js");

/** Main program */
(function () {
    "use strict";

    var cliopt = getopt.create([
        [ "h", "help", "Show this help" ],
        [ "c", "config=ARG", "Configuration file (default ./hotpot.cfg)" ],
        [ "d", "debug=ARG", "Run in debug mode e.g. --debug all" ]
    ])
        .bindHelp()
        .setHelp(DESCRIPTION + "[[OPTIONS]]")
        .parseSystem()
        .options;
   
    if (typeof cliopt.config === "undefined")
        cliopt.config = "./hotpot.cfg";

    if (typeof cliopt.debug !== "undefined") {
        // Development only
        var TestSupport = require("./TestSupport.js");
        HOTPOT_DEBUG = new TestSupport(cliopt.debug);
        console.TRACE = function() {
            HOTPOT_DEBUG.TRACE.apply(HOTPOT_DEBUG, arguments);
        };
    } else
        console.TRACE = function() {};

    console.ERROR = function() {
        console.error(Utils.joinArgs(arguments));
    };

    var config = new Config(cliopt.config);
    Apis.configure(config.getConfig("apis"));
    var controller = new Controller(config.getConfig("controller"));

    var promise = controller.initialise();
    promise.then(function() {
        Server.configure(config.getConfig("server"), controller);

        controller.setLocation(new Location(
            Server.server.config.get("location")));

        // Save config when it changes, so we restart to the
        // same state
        controller.on("config_change",
                      function() {
                          config.set("controller",
                                     controller.getSerialisableConfig(false));
                          config.save();
                      });
    })
    .catch(function(e) {
        console.ERROR(TAG, "Controller initialisation failed: ", e);
        console.TRACE(TAG, "Controller initialisation failed: ",
                      e, " ", e.stack);
    });
})();
