/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const DESCRIPTION =
"DESCRIPTION\nA Raspberry PI central heating control server.\n" +
"See README.md for details\n\nOPTIONS\n";

const getopt = require("node-getopt");

const Utils = require("../common/Utils.js");
const Location = require("../common/Location.js");

const Config = require("./Config.js");
const Apis = require("./Apis.js");
const Server = require("./Server.js");
const Controller = require("./Controller.js");

const TAG = "Hotpot";

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

    if (typeof cliopt.debug !== "undefined")
        // Development only
        require("promise/lib/rejection-tracking").enable(
            { allRejections: true });

    // 0: initialisation
    // 1: pin on/off
    // 2: command tracing
    // 3: test module tracing
    // 4: pin setup details
    console.TRACE = function() {
        var level = arguments[0];
        if (typeof cliopt.debug !== "undefined" &&
            (cliopt.debug.indexOf("all") >= 0
             || cliopt.debug.indexOf(level) >= 0)
            && (cliopt.debug.indexOf("-" + level) < 0)) {
            var mess = new Date().toISOString() + " " + level + ": ";
            for (var i = 1; i < arguments.length; i++) {
                if (typeof arguments[i] === "object"
                    && arguments[i].toString === Object.prototype.toString)
                    mess += Utils.dump(arguments[i]);
                else
                    mess += arguments[i];
            }
            console.log(mess);
        }
    };

    var config = new Config(cliopt.config);
    Apis.configure(config.getConfig("apis"));
    var controller = new Controller(config.getConfig("controller"));

    controller.initialise()
        .then(function() {
            Server.configure(config.getConfig("server"), controller);

            controller.setLocation(new Location(
                Server.server.config.get("location")));

            // Save config when it changes, so we restart to the
            // same state
            controller.on("config_change",
                    function() {
                        config.set("controller",
                                   controller.getSerialisableConfig());
                        config.save();
                    });
        })
        .catch(function(e) {
            console.TRACE(TAG, "Controller initialisation failed: ", e);
        });
})();
