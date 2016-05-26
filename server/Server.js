/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * HTTP server object
 */

const Fs = require("fs");
const serialize = require("serialize-javascript");
const Config = require("./Config.js");
const Url = require("url");

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
    if (typeof config.key !== "undefined") {
        var options = {};
        options.key = Fs.readFileSync(Config.expanded(config.key));
	console.TRACE("server", "Key " + config.key + " loaded");
        if (typeof config.cert !== "undefined") {
            options.cert = Fs.readFileSync(Config.expanded(config.cert));
            console.TRACE("server", "Certificate " + config.cert + " loaded");
        }
        console.TRACE("server", "HTTPS starting on port " + config.port
                     + " with key " + config.key);
    
        server = require("https").createServer(options, handler);
    } else {
        console.TRACE("server", "HTTP starting on port " + config.port);
        server = require("http").createServer(handler);
    }
    server.listen(config.port);
}

/** @private */
Server.prototype.OK = function(response) {
    "use strict";
    response.writeHead(
        200, "OK",
	{
            "Access-Control-Allow-Origin": null,
            "Access-Control-Allow-Methods": "POST,GET"
        });
    response.statusCode = 200;
};

/**
 * AJAX request to get the status of the server, and set the position
 * of a device.
 */
Server.prototype.GET = function(server, request, response) {
    "use strict";

    //console.TRACE("server", "Processing GET " + request.url);
    var req = Url.parse("" + request.url, true);
    var reply;
    try {
        if (typeof req.query !== "undefined")
            reply = this.controller.setMobileLocation(req.query);
        else
            reply = this.controller.serialisable();
        this.OK(response);
        response.write(serialize(reply));
    } catch (e) {
        console.error(e + " in " + request.url + "\n" + e.stack);
        response.write(e + " in " + request.url + "\n");
        response.statusCode = 400;
    }
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
            self.controller.executeCommand(data);
            self.OK(response);
        } catch (e) {
            console.error(e + " in " + json);
            response.write(e + " in " + json + "\n");
            response.statusCode = 400;
        }
        response.end();
    });
};

module.exports = Server;
