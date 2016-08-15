/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);
const serialize = require("serialize-javascript");
const Url = require("url");

const Utils = require("../common/Utils.js");

const TAG = "Server";

var setup = {
    /**
     * Initialise the singleton server from the given configuration
     * @param {Config} config the configuration data
     * @return {Promise} a promise
     */
    configure: function(config, controller) {
        "use strict";
        setup.controller = controller;
        setup.server = new Server(config, controller);
        return setup.server.initialise(config);
    }
};
module.exports = setup;

/**
 * HTTP(S) server object (singleton).
 * @param {Config} config configuration object
 * @protected
 * @class
 */
function Server(config, controller) {
    "use strict";

    var self = this;
    self.config = config;
}

Server.prototype.initialise = function() {
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

    var https = self.config.get("ssl");
    if (typeof https !== "undefined") {
        var options = {};

        promise = promise

        .then(function() {
            return readFile(Utils.expandEnvVars(https.key));
        })

        .then(function(k) {
            options.key = k;
	    console.TRACE(TAG, "Key ", https.key, " loaded");
        })

        .then(function() {
            return readFile(Utils.expandEnvVars(https.cert));
        })

        .then(function(c) {
            options.cert = c;
            console.TRACE(TAG, "Certificate ", https.cert, " loaded");
            console.TRACE(TAG, "HTTPS starting on port ",
                          self.config.get("port"),
                          " with key ", https.key);
        })

        .then(function() {
            return require("https").createServer(options, handler);
        });
    } else {
        console.TRACE(TAG, "HTTP starting on port ", self.config.get("port"));
        promise = promise
        .then(function() {
            return require("http").createServer(handler);
        });
    }

    return promise

    .then(function(httpot) {
        httpot.listen(self.config.get("port"));
    });
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

    console.TRACE(TAG, "Handling ", command);
    if (typeof setup.controller === "undefined") {
        // Not ready
        response.statusCode = 500;
        response.end();
        return;
    }
    setup.controller.dispatch(command, path, params)
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
            console.TRACE(TAG, "Handled ", command);
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
        console.TRACE(TAG, e, " in ", request.url, "\n", e.stack);
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
                //console.TRACE(TAG, "Parsing message ", sbody);
                object = JSON.parse(sbody);
            }
            self.handle(request.url, object, response);
        } catch (e) {
            console.TRACE(TAG, e, " in ", request.url, "\n", e.stack);
            response.write(e + " in " + request.url + "\n");
            response.statusCode = 400;
        }
    });
};
