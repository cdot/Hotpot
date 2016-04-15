/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * HTTP server object
 *
 * curl --data '{"command":"disable_rules","thermostat":"HW"}' http://daphne:13196
 */

const Fs = require("fs");
const serialize = require("serialize-javascript");

/**
 * HTTP(S) Server object
 */
function Server(config, controller) {
    "use strict";

    var self = this;
    
    self.controller = controller;

    var handler = function(request, response) {
        if (self[request.method]) {
            self[request.method].call(self, this, request, response);
        } else {
            response.statusCode = 405;
            response.write("No support for " + request.method);
            response.end();
        }
    };
    var server;
    if (typeof config.server.key !== "undefined") {
        var options = {};
        options.key = Fs.readFileSync(config.server.key);
        if (typeof config.server.cert !== "undefined")
            options.cert = Fs.readFileSync(config.server.cert);
        console.TRACE("server", "HTTPS starting on port " + config.server.port
                     + " with key " + config.server.key);
    
        server = require("https").createServer(options, handler);
    } else {
        console.TRACE("server", "HTTP starting on port " + config.server.port);
        server = require("http").createServer(handler);
    }
    server.listen(config.server.port);
}

/**
 * AJAX request to get the status of the server.
 * This is currently just the on/off state of the boiler, but
 * will include data from the temperature probes when I figure
 * them out.
 */
Server.prototype.GET = function(server, request, response) {
    "use strict";

    //console.TRACE("server", "Processing GET");
    response.writeHead(
        200, "OK",
	{
            "Access-Control-Allow-Origin": null,
            "Access-Control-Allow-Methods": "POST,GET"
        });
    response.statusCode = 200;
    response.write(serialize(this.controller.get_status()));
    response.end();
};

/**
 * AJAX request to set the status of the server.
 */
Server.prototype.POST = function(server, request, response) {
    "use strict";

    var body = [], self = this;
    request.on("data", function(chunk) {
        body.push(chunk);
    }).on("end", function() {
        var json = Buffer.concat(body).toString();
        console.TRACE("server", "Processing POST " + json);
        // TODO: decrypt request
        try {
            var data = JSON.parse(json);
            self.controller.execute_command(data);
            response.writeHead(
                200, "OK",
                {
                    "Access-Control-Allow-Origin": null,
                    "Access-Control-Allow-Methods": "POST,GET"
                });
            response.statusCode = 200;
            response.end();
        } catch (e) {
            console.error(e + " in " + json);
            response.write(e + " in " + json + "\n");
            response.statusCode = 400;
            response.end();
        }
    });
};

module.exports = Server;
