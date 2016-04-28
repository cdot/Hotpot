/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
const CONFIG_FILE = process.env.HOME + "/.config/Hotpot/config.json";
const DESCRIPTION =
"DESCRIPTION\nA Raspberry PI central heating control server.\n" +
"See README.md for details\n\nOPTIONS\n";

const Getopt = require("node-getopt");
const Server = require("./Server.js");
const Controller = require("./Controller.js");
const Fs = require("fs");

/** Main program */
(function () {
    "use strict";

    // Load config
    var data = Fs.readFileSync(CONFIG_FILE, "utf8");
    var config;
    eval("config=" + data);

    var opt = Getopt.create([
        [ "h", "help", "Show this help" ],
        [ "d", "debug=ARG", "Run in debug mode" ]
    ])
        .bindHelp()
        .setHelp(DESCRIPTION + "[[OPTIONS]]")
        .parseSystem();

    console.info(opt);

    function expandEnv(struct) {
        for (var key in struct) {
            if (typeof struct[key] === "string") {
                struct[key] = struct[key].replace(
                        /(\$[A-Z]+)/g, function(match) {
                            var v = match.substring(1);
                            if (typeof process.env[v] !== "undefined")
                                return process.env[v];
                            return match;
                        });
            } else if (struct[key] !== null
                       && typeof struct[key] === "object") {
                expandEnv(struct[key]);
            }
        }
    }
    
    expandEnv(config);

    // 0: initialisation
    // 1: pin on/off
    // 2: command tracing
    // 3: test module tracing
    // 4: pin setup details
    console.TRACE = function(level, message) {
        if (config.debug === "all" || config.debug.includes(level))
            console.log(level + ": " + message);
    };

    // Start the controller and when it's ready, start an HTTP server
    // to receive commands for it.
    var controller;
    try {
	controller = new Controller(config, function() {
            new Server(config, this);
	});
    } catch (e) {
	console.error(e.message);
        if (controller)
            controller.DESTROY();
    }
})();
