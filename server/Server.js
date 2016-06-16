/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * HTTP server object (singleton)
 * The server is a singleton, so the external interface consists of two
 * methods, "configure" which sets up the server with given configuration,
 * and "setController" which couple a Controller to the server
 */

const Fs = require("fs");
const serialize = require("serialize-javascript");
const Utils = require("./Utils.js");
const Url = require("url");

var server; // singleton
module.exports = {
    configure: function(config) {
        "use strict";
        server = new Server(config);
    },
    getConfig: function() {
        "use strict";
        return server.config;
    },
    // @param {Controller} controller the service provider for this server
    setController: function(controller) {
        "use strict";
        server.controller = controller;
    }
};

/**
 * HTTP(S) Server object
 * @param {Config} configuration object
 * @class
 */
function Server(config) {
    "use strict";

    var self = this;
    self.config = config;

    self.favicon = Fs.readFileSync(Utils.expandEnvVars(config.get("favicon")));

    var handler = function(request, response) {
        if (self[request.method]) {
            self[request.method].call(self, request, response);
        } else {
            response.statusCode = 405;
            response.write("No support for " + request.method);
            response.end();
        }
    };
    var httpot, https_key = config.get("key");
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
    
        httpot = require("https").createServer(options, handler);
    } else {
        console.TRACE("server", "HTTP starting on port " + config.get("port"));
        httpot = require("http").createServer(handler);
    }
    httpot.listen(config.get("port"));
}

/**
 * Common handling for requests, POST or GET
 * @private
 */
Server.prototype.handle = function(path, params, response) {
    "use strict";
    if (path.indexOf("/") !== 0 || path.length === 0)
        throw "Bad command";
    path = path.substring(1).split("/");
    var command = path.shift();
    if (command === "favicon.ico") {
        response.writeHead(200, {"Content-Type": "image/x-icon" });
        response.end(this.favicon, "binary");
        return;
    }
    if (typeof this.controller === "undefined") {
        // Not ready
        response.statusCode = 500;
        response.end();
        return;
    }
    var reply = this.controller.dispatch(command, path, params);
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
    if (typeof reply !== "undefined" && reply !== null)
        response.write(serialize(reply));
    response.end();
};

/**
 * AJAX request to get the status of the server, and set the position
 * of a device.
 * @private
 */
Server.prototype.GET = function(request, response) {
    "use strict";
    try {
        // Parse URL parameters and pass them as the data
        var req = Url.parse("" + request.url, true);
        this.handle(req.pathname, req.query, response);
    } catch (e) {
        console.TRACE("server", e + " in " + request.url + "\n" + e.stack);
        response.write(e + " in " + request.url + "\n");
        response.statusCode = 400;
    }
};

/**
 * AJAX request to set the status of the server.
 * @private
 */
Server.prototype.POST = function(request, response) {
    "use strict";

    var body = [], self = this;
    request.on("data", function(chunk) {
        body.push(chunk);
    }).on("end", function() {
        try {
            // Parse the JSON body and pass as the data
            var object;
            if (typeof body !== "undefined" && body !== "")
                object = JSON.parse(Buffer.concat(body).toString());
            self.handle(request.url, object, response);
        } catch (e) {
            console.TRACE("server", e + " in " + request.url + "\n" + e.stack);
            response.write(e + " in " + request.url + "\n");
            response.statusCode = 400;
        }
    });
};
