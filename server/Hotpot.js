/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
const DESCRIPTION =
"DESCRIPTION\nA Raspberry PI central heating control server.\n" +
"See README.md for details\n\nOPTIONS\n";

const Getopt = require("node-getopt");
const Server = require("./Server.js");
const Controller = require("./Controller.js");
const Config = require("./Config.js");
const CONFIG_FILE = "$HOME/.config/Hotpot/config.json";

/** Main program */
(function () {
    "use strict";

    var cliopt = Getopt.create([
        [ "h", "help", "Show this help" ],
        [ "d", "debug=ARG", "Run in debug mode e.g. --debug all" ]
    ])
        .bindHelp()
        .setHelp(DESCRIPTION + "[[OPTIONS]]")
        .parseSystem()
        .options;
   
    // 0: initialisation
    // 1: pin on/off
    // 2: command tracing
    // 3: test module tracing
    // 4: pin setup details
    console.TRACE = function(level, message) {
        if (typeof cliopt.debug !== "undefined" &&
            (cliopt.debug === "all" || cliopt.debug.indexOf(level) >= 0))
            console.log((new Date().toISOString()) + " " + level + ": " + message);
    };

    var config = new Config(CONFIG_FILE);

    // Start the controller and when it's ready, start an HTTP server
    // to receive commands for it.
    try {
	new Controller(
            config.getConfig("controller"),
            function() {
                var self = this;
                new Server(config.getConfig("server"), self);

                // Save config when it changes, so we restart to the
                // same state
                self.on("config_change",
                              function() {
                                  config.set("controller", self.serialisable());
                                  config.save();
                              });
            });
    } catch (e) {
	console.error(e.message);
    }
})();
