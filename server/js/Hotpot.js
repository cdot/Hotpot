/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
/* global HOTPOT_DEBUG*/

/**
 * Main program for heating control server
 * @module server/Hotpot
 */
const DESCRIPTION =
    "DESCRIPTION\nA Raspberry PI central heating control server.\n" +
    "See README.md for details\n\nOPTIONS\n";

let requirejs = require('requirejs');

requirejs.config({
    baseUrl: __dirname + "/../.."
});

requirejs(["node-getopt", "common/js/Location", "common/js/Utils", "common/js/DataModel", "server/js/Server", "server/js/Controller"], function (Getopt, Location, Utils, DataModel, Server, Controller) {
    const TAG = "Hotpot";

    HOTPOT_DEBUG = undefined;

    const HOTPOT_MODEL = {
        tracefile: {
            $doc: "Full path to the trace file",
            $class: String,
            $optional: true
        },
        server: Server.Model,
        controller: Controller.Model
    };

    let cliopt = Getopt.create([
		["h", "help", "Show this help"],
		["c", "config=ARG", "Configuration file (default ./hotpot.cfg)"],
		["C", "confhelp", "Configuration file help"],
		["t", "trace=ARG", "Trace modules e.g. --trace=Rules"],
		["d", "debug", "Run in debug mode, using stubs for missing hardware"]
	])
        .bindHelp()
        .setHelp(DESCRIPTION + "[[OPTIONS]]")
        .parseSystem()
        .options;

    if (typeof cliopt.config === "undefined")
        cliopt.config = "./hotpot.cfg";

    if (typeof cliopt.debug !== "undefined") {
        // Debug for missing hardware
        HOTPOT_DEBUG = require("../../server/js/DebugSupport.js");
    }

    if (cliopt.trace && cliopt.trace !== "")
        Utils.TRACEfilter(cliopt.trace);

    let config, controller, server;

    if (cliopt.confhelp) {
        console.log(DataModel.help(HOTPOT_MODEL));
        eval("process.exit(1)");
    }

    DataModel.loadData(cliopt.config, HOTPOT_MODEL)

        .then(cfg => {
            if (cfg.tracefile)
                Utils.TRACEto(cfg.tracefile.getPath());

            Utils.TRACE(TAG, "Configuration loaded");
            config = cfg;
            controller = config.controller;
            server = config.server;
            Utils.sendMail = (subj, mess) => server.sendMailToAdmin(subj, mess);
            server.setDispatch(
                (path, params) => {
                    return controller.dispatch(path, params)
                    /*
                    				.catch(e => {
                    					console.log("FAILED", e);
                    				})*/
                    ;
                });
            return controller.initialise()
                .then(() => {
                    let loc = new Location(server.location);
                    controller.setLocation(loc);
                });
        })

        .then(() => {
            return server.start();
        })

        .then(() => {
            // Save config when it changes, so we restart to the
            // same state
            controller.on(
                "config_change",
                () => {
                    DataModel.saveData(config, HOTPOT_MODEL, cliopt.config)
                        .then(() => {
                            Utils.TRACE(TAG, cliopt.config, " updated");
                        });
                });
        })
        .catch(e => {
            console.error("Controller initialisation failed: ",
                typeof e.stack !== "undefined" ? e.stack : e);
            eval("process.exit(1)");
        });
});
