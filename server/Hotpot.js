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
    var config = JSON.parse(data);

    var opt = Getopt.create([
        [ "h", "help", "Show this help" ],
        [ "d", "debug=ARG", "Run in debug mode" ],
        // Port 13196 is listed as "Ontolux" - no idea what that is, but it
        // seems harmless enough for a default port.
        [ "p", "port=ARG", "Network port to use, default is " + config.port ],
        [ "v", "valve_return=ARG", "Tune valve return time, default is "
          + config.valve_return + " (seconds)" ],
        [ "g", "gpio=ARG+", "Specify GPIO pin to use for CH/HW\n"
          + "\te.g. --gpio CH=1"],
        [ "i", "id=ARG+", "Set the device ID for a thermostat\n"
          + "\te.g. --device CH=28-00000574c791"],
        [ "t", "temperature=ARG+", "Set the initial target temperature for a"
          + " thermostat, degrees C e.g. \n\t--temperature HW=60"
          + "\n\tRules may override this setting once the server is running." ],
        [ "w", "window=ARG+", "Set the target temperature window for a"
          + " thermostat, degrees C e.g.\n\t--window HW=5"
          + "\n\tRules may override this setting once the server is running." ],
        [ "r", "rules=ARG+", "Load the rules for a thermostat from the"
          + " given file e.g.\n\t--rules CH=central_heating.rules"
          + "\n\tRules may be modified via the HTTP interface once the server"
          + " is running." ]
    ])
        .bindHelp()
        .setHelp(DESCRIPTION + "[[OPTIONS]]")
        .parseSystem();

    console.info(opt);

    // process CH=N style options
    [ "gpio", "device", "temperature", "rules" ].forEach(function(opn) {
        var optval = opt.options[opn];
        delete opt.options[opn];
        if (typeof optval !== "undefined") {
            optval.forEach(function(v) {
                var parts = v.split("=", 2);
                if (parts.length === 2) {
                    var chan = parts[0].toUpperCase();
                    if (!config[opn])
                        config[opn] = {};
                    if (parts[1].match(/^-?[0-9.]+$/))
                        config[opn][chan] = Number(parts[1]);
                    else
                        config[opn][chan] = parts[1];
                } else {
                    console.error("Bad option --" + opn + " " + optval);
                    console.error(opt.getHelp());
                }
            });
        }
    });

    for (var k in opt.options) {
        config[k] = opt.options[k];
    }

    var expandEnv = function(data) {
        for (var k in data) {
	    if (typeof data[k] === "string") {
                data[k] = data[k].replace(
	                /(\$[A-Z]+)/g, function(match) {
	                    var v = match.substring(1);
	                    if (typeof process.env[v] !== "undefined")
	                        return process.env[v];
	                    return match;
	                });
            } else if (data[k] !== null && typeof data[k] === "object") {
                expandEnv(data[k]);
            }
        }
    };
    
    expandEnv(config);

    // 0: initialisation
    // 1: pin on/off
    // 2: command tracing
    // 3: test module tracing
    // 4: pin setup details
    console.TRACE = function(level, message) {
        if (config.debug === "all" || config.debug.includes(level))
            console.log(message);
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
