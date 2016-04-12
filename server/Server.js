/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * HTTP server object
 *
 * curl --data '{"command":"disable_rules","thermostat":"HW"}' http://daphne:13196
 */

const HTTP = require("http");

/**
 * HTTP Server object
 */
function Server(port, controller) {
    "use strict";

    var self = this;

    self.controller = controller;
    console.info("Server starting on port " + port);

    HTTP.createServer(function(request, response) {
        if (self[request.method]) {
            self[request.method].call(self, this, request, response);
        } else {
            response.statusCode = 405;
            response.write("No support for " + request.method);
            response.end();
        }
    }).listen(port);
}

/**
 * AJAX request to get the status of the server.
 * This is currently just the on/off state of the boiler, but
 * will include data from the temperature probes when I figure
 * them out.
 */
Server.prototype.GET = function(server, request, response) {
    "use strict";

    console.TRACE(2, "Processing GET");
    response.statusCode = 200;
    response.write(JSON.stringify(this.controller.get_status()));
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
        console.TRACE(2, "Processing POST " + json);
        // TODO: decrypt request
        try {
            var data = JSON.parse(json);
            self.controller.execute_command(data);
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
