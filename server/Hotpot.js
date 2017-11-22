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
const DataModel = require("../common/DataModel.js");

const Server = require("./Server.js");
const Controller = require("./Controller.js");

const TAG = "Hotpot";

HOTPOT_DEBUG = undefined;

const HOTPOT_MODEL = {
    server: Server.Model,
    controller: Controller.Model
};

(function() {
    var cliopt = getopt.create([
        [ "h", "help", "Show this help" ],
        [ "c", "config=ARG", "Configuration file (default ./hotpot.cfg)" ],
        [ "C", "confhelp", "Configuration file help" ],
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
        HOTPOT_DEBUG = require("./test/TestSupport.js");
    }

    if (cliopt.trace && cliopt.trace !== "")
        Utils.setTRACE(cliopt.trace);
    else
        Utils.TRACE = function() {};

    var config, controller, server;

    DataModel.loadData(cliopt.config, HOTPOT_MODEL)

        .then(function(cfg) {
        if (cliopt.confhelp) {
            Utils.LOG(TAG, " ", DataModel.help(Controller.Model));
            eval("process.exit(1)");
        }
        return cfg;
    })

    .then(function(cfg) {
        config = cfg;
        controller = config.controller;
        server = config.server;
        server.setDispatch(
            function(path, params) {
                return controller.dispatch(path, params);
            });
        return controller.initialise()
        .then(function() {
            var loc = new Location(server.location);
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
                DataModel.saveData(config, HOTPOT_MODEL, cliopt.config)
                .done(function() {
                    Utils.TRACE(TAG, cliopt.config, " updated");
                });
            });
    })

    .catch(function(e) {
        Utils.ERROR(TAG, "Controller initialisation failed: ",
                      typeof e.stack !== "undefined" ? e.stack : e);
        eval("process.exit(1)");
    });
})();

