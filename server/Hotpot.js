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
	    (cliopt.debug === "all" || cliopt.debug.includes(level)))
            console.log((new Date()) + level + ": " + message);
    };

    var config = Config.load(CONFIG_FILE);

    // Start the controller and when it's ready, start an HTTP server
    // to receive commands for it.
    var controller, server;
    try {
	controller = new Controller(
            config.controller,
            function() {
                var self = this;
                server = new Server(config.server, self);

                // Save config when it changes, so we restart to the
                // same state
                self.on("config_change",
                              function() {
                                  Config.save({
                                      server: config.server,
                                      controller: self.serialisable()
                                  }, CONFIG_FILE);
                              });
            });
    } catch (e) {
	console.error(e.message);
    }
})();
