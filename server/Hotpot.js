/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Main program for heating control server
 * @module Hotpot
 */
const DESCRIPTION =
"DESCRIPTION\nA Raspberry PI central heating control server.\n" +
"See README.md for details\n\nOPTIONS\n";

const getopt = require("node-getopt");
const Q = require("q");

const Location = require("../common/Location.js");
const Utils = require("../common/Utils.js");
const Config = require("../common/Config.js");

const Server = require("./Server.js");
const Controller = require("./Controller.js");

const TAG = "Hotpot";

HOTPOT_DEBUG = undefined;

(function() {
    var cliopt = getopt.create([
        [ "h", "help", "Show this help" ],
        [ "c", "config=ARG", "Configuration file (default ./hotpot.cfg)" ],
        [ "t", "trace=ARG", "Trace modules e.g. --trace=Rules" ],
        [ "d", "debug", "Run in debug mode, using stubs for missing hardware" ]
    ])
        .bindHelp()
        .setHelp(DESCRIPTION + "[[OPTIONS]]")
        .parseSystem()
        .options;
   
    if (typeof cliopt.config === "undefined")
        cliopt.config = "./hotpot.cfg";

    if (typeof cliopt.debug !== "undefined") {
        // Development only
        Q.longStackSupport = true;
        var TestSupport = require("./TestSupport.js");
        HOTPOT_DEBUG = new TestSupport();
    }

    if (cliopt.trace && cliopt.trace !== "")
        Utils.setTRACE(cliopt.trace);
    else
        Utils.TRACE = function() {};

    var config, controller, server;

    Config.load(cliopt.config)

    .then(function(cfg) {
        config = cfg;
        controller = new Controller(config.controller);
        server = new Server(config.server, 
                            function(path, params) {
                                return controller.dispatch(path, params);
                            });
    })

    .then(function() {
        return controller.initialise()
        .then(function() {
            var loc = new Location(config.server.location);
            controller.setLocation(loc);
        });
    })

    .then(function() {
        return server.start();
    })

    .then(function() {
        // Save config when it changes, so we restart to the
        // same state
        controller.on(
            "config_change",
            function() {
                Config.save(config, cliopt.config)
                .done(function() {
                    Utils.TRACE(TAG, cliopt.config, " updated");
                });
            });
        controller.on(
            "config_refresh",
            function() {
                controller.reconfigure(config.controller);
            });
    })

    .catch(function(e) {
        Utils.ERROR(TAG, "Controller initialisation failed: ",
                      typeof e.stack !== "undefined" ? e.stack : e);
        eval("process.exit(1)");
    });
})();

