const DESCRIPTION =
"A Raspberry PI central heating control server." + "\n" +
"The server assumes the PI is configured with two DS18x20 temperature" + "\n" +
"sensors, one for heating (CH) and one for hot water (HW). It sets the" + "\n" +
"state of two GPIO pins to turn on the relevant heating control. The" + "\n" +
"server listens for HTTP requests coming in on a port, which are used" + "\n" +
"to to change the setting of temperature required from the CH and HW." + "\n" +
"The server also supports commands to control the window on the" + "\n" +
"thermostat. The window controls the actual switching temperature, For" + "\n" +
"example, if we ask for:" + "\n" +
"" + "\n" +
"--temperature HW=60 --window HW=5" + "\n" +
"" + "\n" +
"then when the temperature falls below 57.5 degrees, the hot water will switch" + "\n" +
"on. When it rises above 62.5 degrees, it will turn off." + "\n";

const Getopt = require("node-getopt");

/** Main program */
(function () {
    "use strict";

    var config = {
        port: 13196,
        valve_return: 5, // return time, in seconds
        device: {
            HW: "28-00000574c791",
            CH: "28-00000574f4f3"
        },
        gpio: {
            CH: 4, // GPIO pin number
            HW: 5  // GPIO pin number
        },
        temperature: {
            HW: 20,
            CH: 20
        },
        window: {
            HW: 5,
            CH: 5
        }
    };

    var opt = Getopt.create([
        // Port 13196 is listed as "Ontolux" - no idea what that is, but it seems
        // harmless enough for a default port.
        [ "p", "port=ARG", "Network port to use, default is " + config.port ],
        [ "v", "valve_return=ARG", "Tune valve return time, default is "
          + config.valve_return + " (seconds)" ],
        [ "h", "help", "Show this help" ],
        [ "d", "debug", "Run in debug mode" ],
        [ "g", "gpio=ARG+", "Specify GPIO pin to use for CH/HW\n"
          + "\t\te.g. --gpio CH=1"],
        [ "i", "id=ARG+", "Set the device ID for a thermostat\n"
          + "\t\te.g. --device CH=28-00000574c791"],
        [ "t", "temperature=ARG+", "Set the target temperature for a thermostat,"
          + " degrees C\n\t\te.g. --temperature HW=60" ],
        [ "w", "window=ARG+", "Set the target temperature window for a thermostat,"
          + " degrees C\n\t\te.g. --window HW=5" ],
        [ "s", "schedule=ARG+", "Load the crontab for a thermostat from the"
          + " given file\n\t\te.g. --schedule CH=central_heating.ct" ]
    ])
        .bindHelp()
        .setHelp(DESCRIPTION + "[[OPTIONS]]")
        .parseSystem();

    console.info(opt);

    // process CH=N style options
    [ "gpio", "device", "temperature", "schedule" ].forEach(function(opn) {
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

    console.info(config);

    var Server = require("./Server.js");
    new Server(config);
})();
