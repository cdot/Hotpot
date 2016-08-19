/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);
const serialize = require("serialize-javascript");
const Url = require("url");

const Utils = require("../common/Utils.js");
const Config = require("./Config.js");

const TAG = "Server";

/**
 * Super-lightweight HTTP(S) server object (singleton) with very few
 * dependencies. Only supports POST and GET, does not support auth.
 * Yes, I could have used express, but I wrote this before I knew about
 * it, and it "just works".
 * @param {Config} config configuration object
 *   ssl: optional SSL configuration. Will create an HTTP server if not
 *           present
 *      key: text of the SSL key OR
 *      key_file: name of a file containing the SSL key
 *      cert: text of the certificate OR
 *      cert_file: name of a file containing the SSL certificate
 *   port: port to serve on
 * @protected
 * @class
 */
function Server(config, controller) {
    "use strict";

    var self = this;
    self.config = config;
    self.controller = controller;
    self.ready = false;
}
module.exports = Server;

/**
 * Get a promise to start the server.
 * @return {Promise} a promise
 */
Server.prototype.start = function() {
    var self = this;

    var handler = function(request, response) {
        if (self[request.method]) {
            self[request.method].call(self, request, response);
        } else {
            response.statusCode = 405;
            response.write("No support for " + request.method);
            response.end();
        }
    };

    var promise = Q();

    var https = self.config.ssl;
    if (typeof https !== "undefined") {
        var options = {};

        promise = promise

        .then(function() {
            return Config.fileableConfig(https, "key");
        })

        .then(function(k) {
            options.key = k;
            Utils.TRACE(TAG, "SSL key loaded");
        })

        .then(function() {
            return Config.fileableConfig(https, "cert");
        })

        .then(function(c) {
            options.cert = c;
            Utils.TRACE(TAG, "SSL certificate loaded");
            Utils.TRACE(TAG, "HTTPS starting on port ",
                          self.config.port,
                          " with key ", https.key);
        })

        .then(function() {
            return require("https").createServer(options, handler);
        });
    } else {
        Utils.TRACE(TAG, "HTTP starting on port ", self.config.port);
        promise = promise
        .then(function() {
            return require("http").createServer(handler);
        });
    }

    return promise

    .then(function(httpot) {
        self.ready = true;
        httpot.listen(self.config.port);
    });
};

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

    Utils.TRACE(TAG, "Handling ", command);
    if (!this.ready) {
        // Not ready
        response.statusCode = 500;
        response.end();
        return;
    }
    this.controller.dispatch(command, path, params)

        .done(function(reply) {
            var s = (typeof reply !== "undefined" && reply !== null)
                ? serialize(reply) : "";
            response.writeHead(
                200, "OK",
                {
                    // Don't send as application/json; we
                    // don't want the receiver to parse it
                    "Content-Type": "text/plain",
                    "Content-Length": Utils.byteLength(s),
                    "Access-Control-Allow-Origin": null,
                    "Access-Control-Allow-Methods": "POST,GET"
                });
            response.statusCode = 200;
            response.write(s);
            response.end();
            Utils.TRACE(TAG, "Handled ", command);
        })
/*
        .catch(function(error) {
            // Send the error message in the payload
            Utils.TRACE(TAG, "Error in ", command, ": ", error.stack);           
            response.writeHead(
                500, "ERROR",
                {
                    "Content-Type": "text/plain",
                    "Content-Length": Utils.byteLength(error),
                });
            response.statusCode = 500;
            response.write(error.toString());
            response.end();
        })*/;
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
        Utils.TRACE(TAG, e, " in ", request.url, "\n", e.stack);
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
            if (body.length > 0) {
                var sbody = Buffer.concat(body).toString();
                //Utils.TRACE(TAG, "Parsing message ", sbody);
                object = JSON.parse(sbody);
            }
            self.handle(request.url, object, response);
        } catch (e) {
            Utils.TRACE(TAG, e, " in ", request.url, "\n", e.stack);
            response.write(e + " in " + request.url + "\n");
            response.statusCode = 400;
        }
    });
};
