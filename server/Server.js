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
 * route requests to a dispatcher function. Otherwise requests are
 * handled as files relative to the defined `docroot`.
 * @param {Config} config configuration object
 * * `docroot`: path to the document root, may contain env vars
 * * `ssl` optional SSL configuration. Will create an HTTP server otherwise.
 *   * `key`: text of the SSL key OR
 *   * `key_file`: name of a file containing the SSL key
 *   * `cert`: text of the certificate OR
 *   * `cert_file`: name of a file containing the SSL certificate
 * * `port`: port to serve on (required)
 * * `auth` optional basic auth configuration.
 *   * `user` username of authorised user
 *   * `pass` password
 *   * `realm` authentication realm
 * @param {function} (optional) dispatch function for handling ajax requests
 * ```
 * dispatch(Array path, Object params) => Promise
 * ```
 * where `path` is an array of path elements parsed from the URL and `params`
 * is an object mapping parameter names to values. The return value is a
 * promise that resolves to an object (or undefined, or null) that will be
 * serialised to form the body of the response.
 * The object must be JSON-ifiable. Without a dispatch function, the server
 * will be a simple file server.
 * @class
 */
function Server(config, dispatch) {
    "use strict";

    var self = this;
    self.config = config;
    self.dispatch = dispatch;
    self.ready = false;
    if (typeof config.auth !== "undefined") {
        var BasicAuth = require("basic-auth");
        this.authenticate =  function(request) {
            var credentials = BasicAuth(request);
            return credentials
                && credentials.name === config.user
                && credentials.pass === config.pass;
        };
    }
}
module.exports = Server;

/**
 * Get a promise to start the server.
 * @return {Promise} a promise to start the server
 */
Server.prototype.start = function() {
    var self = this;
    var config = self.config;

    var handler = function(request, response) {
        if (typeof this.authenticate !== "undefined"
           && !this.authenticate(request)) {
            response.statusCode = 401
            response.setHeader('WWW-Authenticate', 'Basic realm="'
                               + config.realm + '"')
            response.end('Access denied');
            return;
        }
        if (self[request.method]) {
            self[request.method].call(self, request, response);
        } else {
            response.statusCode = 405;
            response.write("No support for " + request.method);
            response.end();
        }
    };

    var promise = Q();

    var ssl_cfg = config.ssl;
    if (typeof ssl_cfg !== "undefined") {
        var options = {};

        promise = promise

        .then(function() {
            return Config.fileableConfig(ssl_cfg, "key");
        })

        .then(function(k) {
            options.key = k;
            Utils.TRACE(TAG, "SSL key loaded");
        })

        .then(function() {
            return Config.fileableConfig(ssl_cfg, "cert");
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
Server.prototype.handle = function(spath, params, request, response) {
    "use strict";

    if (spath.indexOf("/") !== 0 || spath.length === 0)
        throw "Bad command";
    spath = spath.substring(1);
    var path = spath.split(/\/+/);

    if (path.length < 1)
        throw "Bad command";

    if (!this.ready) {
        // Not ready
        response.statusCode = 503;
        response.write("Not ready");
        response.end();
        return;
    }
    var contentType = "text/plain";
    var promise;

    // Allow cross-domain posting
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "POST,GET");

    if (path[0] === "ajax") {
        // AJAX command, destined for the dispatcher
        path.shift();

        promise = this.dispatch(path, params)

        .then(function(reply) {
            var s = (typeof reply !== "undefined" && reply !== null)
                ? serialize(reply) : "";
            return s;
        });
    } else if (path.join("") === "") {
        promise = Q("");
    } else {
        // Handle file lookup
        var filepath = Utils.expandEnvVars(this.config.docroot
                                           + "/" + path.join("/"));
        
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
        console.error("ERROR " + error);
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
