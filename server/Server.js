/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * HTTP server object
 */

const Fs = require("fs");
const serialize = require("serialize-javascript");
const Utils = require("./Utils.js");
const Url = require("url");

/**
 * HTTP(S) Server object
 * @param {Config} configuration object
 * @param {Controller} controller the service provider for this server
 * @class
 */
function Server(config, controller) {
    "use strict";

    var self = this;

    self.favicon = Fs.readFileSync(Utils.expandEnvVars(config.get("favicon")));
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
    var server, https_key = config.get("key");
    if (typeof https_key !== "undefined") {
        var options = {};
        options.key = Fs.readFileSync(Utils.expandEnvVars(https_key));
	console.TRACE("server", "Key " + https_key + " loaded");
        var https_cert = config.get("cert");
        if (typeof https_cert !== "undefined") {
            options.cert = Fs.readFileSync(Utils.expandEnvVars(https_cert));
            console.TRACE("server", "Certificate " + https_cert + " loaded");
        }
        console.TRACE("server", "HTTPS starting on port " + config.get("port")
                     + " with key " + https_key);
    
        server = require("https").createServer(options, handler);
    } else {
        console.TRACE("server", "HTTP starting on port " + config.get("port"));
        server = require("http").createServer(handler);
    }
    server.listen(config.get("port"));
}

/** @private */
Server.prototype.OK = function(response) {
    "use strict";
    response.writeHead(
        200, "OK",
	{
            // Don't send as application/json or application/javascript; we
            // don't want the receiver to parse it
            "Content-Type": "text/plain",
            "Access-Control-Allow-Origin": null,
            "Access-Control-Allow-Methods": "POST,GET"
        });
    response.statusCode = 200;
};

/**
 * AJAX request to get the status of the server, and set the position
 * of a device.
 * @private
 */
Server.prototype.GET = function(server, request, response) {
    "use strict";

    var req = Url.parse("" + request.url, true);
    console.TRACE("HTTP", "GET " + JSON.stringify(req));
    var reply;
    try {
        switch (req.pathname) {
        case "/favicon.ico":
            response.writeHead(200, {"Content-Type": "image/x-icon" });
            response.end(this.favicon, "binary");
            return;
        case "/mobile":
            reply = this.controller.setMobileLocation(req.query);
            break;
        default:
            reply = this.controller.serialisable();
        }
        this.OK(response);
        response.write(serialize(reply));
    } catch (e) {
        console.TRACE("HTTP", e + " in " + request.url + "\n" + e.stack);
        response.write(e + " in " + request.url + "\n");
        response.statusCode = 400;
    }
    response.end();
};

/**
 * AJAX request to set the status of the server.
 * @private
 */
Server.prototype.POST = function(server, request, response) {
    "use strict";

    var body = [], self = this;
    request.on("data", function(chunk) {
        body.push(chunk);
    }).on("end", function() {
        var json = Buffer.concat(body).toString();
        console.TRACE("HTTP", "POST " + json);
        try {
            var data = JSON.parse(json);
            self.controller.executeCommand(data);
            self.OK(response);
        } catch (e) {
            console.TRACE("HTTP", e + " in " + json);
            response.write(e + " in " + json + "\n");
            response.statusCode = 400;
        }
        response.end();
    });
};

module.exports = Server;
