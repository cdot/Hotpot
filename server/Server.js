/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

// Yes, I could have used express, but I wrote this before I knew about
// it, and it "just works".

const Q = require("q");
const serialize = require("serialize-javascript");
const Url = require("url");

const Utils = require("../common/Utils.js");
const Config = require("./Config.js");

const TAG = "Server";

/**
 * Super-lightweight HTTP(S) server object (singleton) with very few
 * dependencies. Only supports POST and GET, does not support auth.
 * The server sits on the selected report and processes GET and POST
 * requests. The predefined root path `/ajax` is used to decide when to
 * route requests to the controller object. Otherwise requests are
 * handled as files.
 * @param {Config} config configuration object
 * * `ssl` optional SSL configuration. Will create an HTTP server otherwise.
 *   * `key`: text of the SSL key OR
 *   * `key_file`: name of a file containing the SSL key
 *   * `cert`: text of the certificate OR
 *   * `cert_file`: name of a file containing the SSL certificate
 * * `port`: port to serve on (required)
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
 * @return {Promise} a promise to start the server
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
            Utils.TRACE(TAG, "HTTPS starting on port ", self.config.port);
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
 * Common handling for POST or GET
 * @private
 */
Server.prototype.handle = function(path, params, request, response) {
    "use strict";

    if (path.indexOf("/") !== 0 || path.length === 0)
        throw "Bad command";
    path = path.substring(1).split("/");

    if (path.length < 1)
        throw "Bad command";

    Utils.TRACE(TAG, "Handling ", path[0]);
    if (!this.ready) {
        // Not ready
        response.statusCode = 500;
        response.end();
        return;
    }
    var contentType = "text/plain";
    var promise;

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "POST,GET");

    if (path[0] === "ajax") {
        // AJAX command, destined for the controller
        path.shift();

        promise = this.controller.dispatch(path, params)

        .then(function(reply) {
            var s = (typeof reply !== "undefined" && reply !== null)
                ? serialize(reply) : "";
            Utils.TRACE(TAG, "Handled ", path[0]);
            return s;
        });
    } else {
        // Handle file lookup
        var filepath = "../" + path.join("/");
        var m = /\.([A-Z0-9]+)$/i.exec(filepath);
        if (m) {
            var Mime = require("mime-types");
            contentType = Mime.lookup(m[1]);
        }
        var Fs = require("fs");
        var readFile = Q.denodeify(Fs.readFile);
        promise = readFile(filepath);
    }

    promise
    .then(function(responseBody) {
        response.setHeader("Content-Type", contentType);
        response.setHeader("Content-Length", Buffer.byteLength(responseBody));
        response.statusCode = 200;
        response.write(responseBody);
        response.end();
    },
    function(error) {
        // Send the error message in the payload
        console.error("ERROR" + error);
        Utils.TRACE(TAG, error.stack);
        var e = error.toString();
        response.setHeader("Content-Type", "text/plain");
        response.setHeader("Content-Length", Buffer.byteLength(e));
        response.statusCode = 500;
        response.write(e);
        response.end(e);
    });
};

/**
 * handler for incoming GET request
 * @private
 */
Server.prototype.GET = function(request, response) {
    "use strict";
    try {
        // Parse URL parameters and pass them as the data
        var req = Url.parse("" + request.url, true);
        this.handle(req.pathname, req.query, request, response);
    } catch (e) {
        Utils.TRACE(TAG, e, " in ", request.url, "\n",
                    typeof e.stack !== "undefined" ? e.stack : e);
        response.write(e + " in " + request.url + "\n");
        response.statusCode = 400;
        response.end();
    }
};

/**
 * Handler for incoming POST request
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
            self.handle(request.url, object, request, response);
        } catch (e) {
            Utils.TRACE(TAG, e, " in ", request.url, "\n", e.stack);
            response.write(e + " in " + request.url + "\n");
            response.statusCode = 400;
        }
    });
};
