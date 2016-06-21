/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
const DESCRIPTION =
"DESCRIPTION\nA Raspberry PI central heating control server.\n" +
"See README.md for details\n\nOPTIONS\n";

const getopt = require("node-getopt");

const Config = require("./Config.js");
const Apis = require("./Apis.js");
const Server = require("./Server.js");
const Controller = require("./Controller.js");

const CONFIG_FILE = "$HOME/.config/Hotpot/config.json";

/** Main program */
(function () {
    "use strict";

    var cliopt = getopt.create([
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
            (cliopt.debug.indexOf("all") >= 0
             || cliopt.debug.indexOf(level) >= 0)
            && (cliopt.debug.indexOf("-" + level) < 0))
            console.log((new Date().toISOString()) + " " + level + ": " + message);
    };

    var config = new Config(CONFIG_FILE);
    Apis.configure(config.getConfig("apis"));
    Server.configure(config.getConfig("server"));

    // Start the controller and when it's ready, start an HTTP server
    // to receive commands for it.
    Controller.configure(
        config.getConfig("controller"),
        function() {
            var self = this;
            
            // Save config when it changes, so we restart to the
            // same state
            self.on("config_change",
                    function() {
                        config.set("controller", self.getSerialisableConfig());
                        config.save();
                    });
        });
})();
