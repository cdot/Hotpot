/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

// Yes, I could have used express, but I wrote this before I knew about
// it, and it "just works".

const Q = require("q");
const Url = require("url");

const Utils = require("../common/Utils.js");
const DataModel = require("../common/DataModel.js");
const Location = require("../common/Location.js");

const TAG = "Server";

/**
 * Super-lightweight HTTP(S) server object (singleton) with very few
 * dependencies. Only supports POST and GET, does not support auth.
 * The server sits on the selected report and processes GET and POST
 * requests. The predefined root path `/ajax` is used to decide when to
 * route requests to a dispatcher function. Otherwise requests are
 * handled as files relative to the defined `docroot`.
 * @param proto see Server.Model
 * @class
 */
function Server(proto) {
    "use strict";

    Utils.extend(this, proto);

    var self = this;
    self.ready = false;
    if (typeof this.auth !== "undefined") {
        self.authenticate = function (request) {
            var BasicAuth = require("basic-auth");
            var credentials = BasicAuth(request);
            if (typeof credentials === "undefined")
                return false;
            return (credentials.name === self.auth.user &&
                credentials.pass === self.auth.pass);
        };
    }
}
module.exports = Server;

/**
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
 */
Server.prototype.setDispatch = function (dispatch) {
    this.dispatch = dispatch;
};

Server.Model = {
    $class: Server,
    $doc: "HTTP(S) server",
    port: {
        $doc: "Port to run the server on",
        $class: Number
    },
    docroot: Utils.extend({}, DataModel.File.Model, {
        $doc: "Absolute file path to server documents",
        $mode: "dr"
    }),
    location: Utils.extend({}, Location.Model, {
        $doc: "Where in the world the server is located"
    }),
    ssl: {
        $doc: "SSL configuration",
        $optional: true,
        cert: Utils.extend({}, DataModel.TextOrFile.Model, {
            $doc: "SSL certificate (filename or text)",
            $mode: "r"
        }),
        key: Utils.extend({}, DataModel.TextOrFile.Model, {
            $doc: "SSL key (filename or text)",
            $mode: "r"
        })
    },
    auth: {
        $doc: "Basic auth to access the server",
        $optional: true,
        user: {
            $doc: "Username",
            $class: String
        },
        pass: {
            $doc: "Password",
            $class: String
        },
        realm: {
            $doc: "Authentication realm",
            $class: String
        }
    }
};
/**
 * Get a promise to start the server.
 * @return {Promise} a promise to start the server
 */
Server.prototype.start = function () {
    var self = this;

    var handler = function (request, response) {
        if (typeof self.authenticate !== "undefined") {
            if (!self.authenticate(request)) {
                Utils.TRACE(TAG, "Authentication failed ", request.url);
                response.statusCode = 401;
                response.setHeader('WWW-Authenticate', 'Basic realm="' +
                    self.auth.realm + '"');
                response.end('Access denied');
                return;
            }
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

    if (typeof this.ssl !== "undefined") {
        var options = {};

        promise = promise

            .then(function () {
                return self.ssl.key.read();
            })

            .then(function (k) {
                options.key = k;
                Utils.TRACE(TAG, "SSL key loaded");
            })

            .then(function () {
                return self.ssl.cert.read();
            })

            .then(function (c) {
                options.cert = c;
                Utils.TRACE(TAG, "SSL certificate loaded");
                if (typeof self.auth !== "undefined")
                    Utils.TRACE(TAG, "Requires authentication");
                Utils.TRACE(TAG, "HTTPS starting on port ", self.port);
            })

            .then(function () {
                return require("https").createServer(options, handler);
            });
    } else {
        if (typeof self.auth !== "undefined")
            Utils.TRACE(TAG, "Requires authentication");
        Utils.TRACE(TAG, "HTTP starting on port ", self.port);
        promise = promise
            .then(function () {
                return require("http").createServer(handler);
            });
    }

    return promise

        .then(function (httpot) {
            self.ready = true;
            self.http = httpot;
            httpot.listen(self.port);
        });
};

Server.prototype.stop = function () {
    this.http.close();
};

/**
 * Common handling for POST or GET
 * @private
 */
Server.prototype.handle = function (spath, params, request, response) {
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

            .then(function (reply) {
                var s = (typeof reply !== "undefined" && reply !== null) ?
                    JSON.stringify(reply) : "";
                return s;
            });
    } else if (path.join("") === "") {
        promise = Q("");
    } else {
        // Handle file lookup
        Utils.TRACE(TAG, "GET ", path.join("/"));
        var filepath = Utils.expandEnvVars(this.docroot +
            "/" + path.join("/"));

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
        .then(function (responseBody) {
                response.setHeader("Content-Type", contentType);
                response.setHeader("Content-Length", Buffer.byteLength(responseBody));
                response.statusCode = 200;
                response.write(responseBody);
                response.end();
            },
            function (error) {
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
Server.prototype.GET = function (request, response) {
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
Server.prototype.POST = function (request, response) {
    "use strict";

    var body = [],
        self = this;
    request.on("data", function (chunk) {
        body.push(chunk);
    }).on("end", function () {
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