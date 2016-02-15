/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * HTTP server object. A set of thermostats and control pins, with a
 * controlling configuration.
 */
const HTTP = require("http");
const Fs = require("fs");

const Thermostat = require("./Thermostat.js");
const PinController = require("./PinController.js");
const Time = require("./Time.js"); // for rules

/**
 * HTTP Server object
 */
function Server(config) {
    "use strict";

    var k;
    var self = this;

    console.info("Server starting on port " + config.port);
    self.config = config;

    // Create thermostats
    self.thermostat = {};
    var switch_on = function(id, cur) {
        console.log(id + " ON, " + cur + " < "
                    + (self.config.temperature[id]
                       + self.config.window[id] / 2));
        self.set(id, true);
    };
    var switch_off = function(id, cur) {
        console.log(id + " OFF, " + cur + " > "
                    + (self.config.temperature[id]
                       + self.config.window[id] / 2));
        self.set(id, false);
    };

    for (k in config.device) {
        var th = new Thermostat(k,
                                config.device[k],
                                config.temperature[k],
                                config.window[k]);
        th.on("below", switch_on);
        th.on("above", switch_off);
        self.thermostat[k] = th;
    }

    // Create pin controllers
    self.pin = {};
    for (k in self.config.gpio) {
        self.pin[k] = new PinController(k, self.config.gpio[k]);
    }

    // When we start, turn heating OFF and hot water ON to ensure
    // the valve returns to the A state. Once the valve has settled,
    // turn off hot water. The grey wire will be high but the valve
    // won"t be listening to it.

    // Assume worst-case valve configuration i.e. grey wire live holding
    // valve. Reset to no-power state by turning HW on to turn off the
    // grey wire and waiting for the valve spring to relax.
    console.info("- Resetting valve");
    self.pin.HW.set(1);
    self.pin.CH.set(0);
    self.set("HW", false, function() {
        console.info("- server starting on " + self.config.port);
        self.start_server(self.config.port);
    });

    // Load rules for thermostats
    for (k in self.config.rules) {
        console.log("Loading rules for " + k + " from "
                   + self.config.rules[k]);
        var data = Fs.readFileSync(self.config.rules[k], "utf8");
        try {
            var rules = eval(data);
            self.thermostat[k].clear_rules();
            for (var i in rules)
                self.thermostat[k].insert_rule(rules[i], i);
        } catch (e) {
            console.error("Failed to load rules from "
                          + self.config.rules[k] + ": " + e.message);
        }
    }
}

/**
 * @private
 * Set the on/off state of the system.
 * @param channel "HW" or "CH"
 * @param state true or false (on or off)
 * @param respond function called when state is set, parameters
 * are (self=Server, channel, state)
 */
Server.prototype.set = function(channel, on, respond) {
    "use strict";

    var self = this;
    if (this.pending) {
        console.info("Request backing off");
        setTimeout(function() {
            console.info("Backed off awakens");
            self.set(channel, on, respond);
        }, this.valve_return * 1000);
    }

    // Y-plan systems have a state where if the heating is on but the
    // hot water is off, and the heating is turned off, then the grey
    // wire to the valve (the "hot water off" signal) is held high,
    // stalling the motor and consuming power pointlessly. We need some
    // special processing to avoid this state.
    // If heating only on, and it's going off, switch on HW
    // to kill the grey wire. This allows the spring to fully
    // return. Then after a timeout, set the desired state.
    if (channel === "CH" && !on
        && this.pin.HW.state === 1 && this.pin.HW.state === 0) {
        this.pin.CH.set(0);
        this.pin.HW.set(1);
        self.pending = true;
        setTimeout(function() {
            self.pending = false;
            self.set(channel, on, respond);
        }, this.valve_return * 1000);
    } else {
        // Otherwise this is a simple state transition, just
        // set the appropriate pin
        this.pin[channel].set(on ? 1 : 0);
        if (respond)
            respond.call(self, channel, on);
    }
};

/**
 * AJAX request to get the status of the server.
 * This is currently just the on/off state of the boiler, but
 * will include data from the temperature probes when I figure
 * them out.
 */
Server.prototype.GET = function(server, request, response) {
    "use strict";

    var data = {};
    for (var k in this.thermostat) {
        var th = this.thermostat[k];
        data[th.name] = {};
        data[th.name].temperature = th.temperature();
        data[th.name].window = th.window;
        data[th.name].state = this.pin[th.name].state;
    }
    response.statusCode = 200;
    response.write(JSON.stringify(data));
    response.end();
};

/**
 * @private
 * AJAX request to set the status of the server.
 * Currently just sets the on/off status, but will set temperature
 * limits when I"m ready.
 */
Server.prototype.POST = function(server, request, response) {
    "use strict";

    var body = [], k;
    request.on("data", function(chunk) {
        body.push(chunk);
    }).on("end", function() {
        var json = Buffer.concat(body).toString();
        try {
            var data = JSON.parse(json);
            for (k in data) {
                var d = data[k];
                var th = this.thermostat[k];
                if (d && th) {
                    if (typeof d.temperature !== "undefined")
                        // The temperature will remain set until the next schedule event
                        th.set_target(d.temperature);
                    if (typeof d.window !== "undefined")
                        // The window will remain set
                        th.set_window(d.window);
                    if (typeof d.schedule !== "undefined")
                        th.set_schedule(d.schedule);
                }
            }
            response.statusCode = 200;
        } catch (e) {
            response.statusCode = 400;
            console.error(e.message + " in " + json);
            //response.write(e.message);
        }
        response.end();
    });
};

// @private
Server.prototype.start_server = function(port) {
    "use strict";

    var self = this;

    HTTP.createServer(function(request, response) {
        console.error("Started " + request.method + " " + response);
        if (self[request.method]) {
            self[request.method].call(self, this, request, response);
        } else {
            response.statusCode = 405;
            response.write("No support for " + request.method);
            response.end();
        }
    }).listen(port);
};

module.exports = Server;
