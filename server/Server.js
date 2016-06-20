/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

const fs = require("fs");
const serialize = require("serialize-javascript");
const Url = require("url");

const Utils = require("../common/Utils.js");

const TAG = "Server";

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
 * HTTP(S) server object (singleton).
 * The server is a singleton, so the external interface consists of two
 * methods, "configure" which sets up the server with given configuration,
 * and "setController" which couple a Controller to the server
 * @param {Config} config configuration object
 * @protected
 * @class
 */
function Server(config) {
    "use strict";

    var self = this;
    self.config = config;

    self.favicon = fs.readFileSync(Utils.expandEnvVars(config.get("favicon")));

    var handler = function(request, response) {
        if (self[request.method]) {
            self[request.method].call(self, request, response);
        } else {
            response.statusCode = 405;
            response.write("No support for " + request.method);
            response.end();
        }
    };
    var httpot, https = config.get("ssl");
    if (typeof https !== "undefined") {
        var options = {};
        options.key = fs.readFileSync(Utils.expandEnvVars(https.key));
	console.TRACE(TAG, "Key " + https.key + " loaded");
        options.cert = fs.readFileSync(Utils.expandEnvVars(https.cert));
        console.TRACE(TAG, "Certificate " + https.cert + " loaded");
        console.TRACE(TAG, "HTTPS starting on port " + config.get("port")
                     + " with key " + https.key);
    
        httpot = require("https").createServer(options, handler);
    } else {
        console.TRACE(TAG, "HTTP starting on port " + config.get("port"));
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
    this.controller.dispatch(
        command, path, params,
        function(reply) {
            response.writeHead(
                200, "OK",
                {
                    // Don't send as application/json; we
                    // don't want the receiver to parse it
                    "Content-Type": "text/plain",
                    "Access-Control-Allow-Origin": null,
                    "Access-Control-Allow-Methods": "POST,GET"
                });
            response.statusCode = 200;
            if (typeof reply !== "undefined" && reply !== null)
                response.write(serialize(reply));
            response.end();
        });
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
        console.TRACE(TAG, e + " in " + request.url + "\n" + e.stack);
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
            console.TRACE(TAG, e + " in " + request.url + "\n" + e.stack);
            response.write(e + " in " + request.url + "\n");
            response.statusCode = 400;
        }
    });
};
