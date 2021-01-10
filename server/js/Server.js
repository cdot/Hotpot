/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

// Yes, I could have used express, but I wrote this before I knew about
// it, and it "just works".

define("server/js/Server", ["fs", "url", "common/js/Utils", "common/js/DataModel", "common/js/Location"], function(fs, Url, Utils, DataModel, Location) {

    const TAG = "Server";

	const Fs = fs.promises;
	
    /**
     * Super-lightweight HTTP(S) server with very few
     * dependencies. Only supports POST and GET and Basic auth
     * The server sits on the selected port and processes GET and POST
     * requests. The predefined root path `/ajax` is used to decide when to
     * route requests to a dispatcher function. Otherwise requests are
     * handled as files relative to the defined `docroot`.
     * @param proto see Server.Model
     * @class
     */
    class Server {

        constructor(proto) {

            Utils.extend(this, proto);

            let self = this;
            self.ready = false;
            if (typeof this.auth !== "undefined") {
                self.authenticate = function (request) {
                    let BasicAuth = require("basic-auth");
                    let credentials = BasicAuth(request);
                    if (typeof credentials === "undefined")
                        return false;
                    return (credentials.name === self.auth.user &&
                            credentials.pass === self.auth.pass);
                };
            }
        }

        /**
         * @param {function} (optional) dispatch function for handling
         * ajax requests
         * ```
         * dispatch(Array path, Object params) => Promise
         * ```
         * where `path` is an array of path elements parsed from the
         * URL and `params` is an object mapping parameter names to
         * values. The return value is a promise that resolves to an
         * object (or undefined, or null) that will be serialised to
         * form the body of the response.  The object must be
         * JSON-ifiable. Without a dispatch function, the server will
         * be a simple file server.
         */
        setDispatch(dispatch) {
            this.dispatch = dispatch;
        };

        /**
         * Get a promise to start the server.
         * @return {Promise} a promise to start the server
         */
        start() {
            let self = this;

            let handler = function (request, response) {
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

            let promise = Promise.resolve();

            if (typeof this.ssl !== "undefined") {
                let options = {};

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
            })
            .catch((e) => {
				Utils.TRACE(TAG, `Server error ${e}`);
			});
        };

		/**
		 * return a promise to stop the server
		 */
        stop() {
            return new Promise((resolve, reject) => {
				this.http.close((e) => {
					if (e instanceof Error)
						reject(e);
					else
						resolve();
				});
			});
        };

        /**
         * Common handling for POST or GET
         * @private
         */
        handle(spath, params, request, response) {
            if (spath.indexOf("/") !== 0 || spath.length === 0)
                throw new Utils.exception(TAG, "Bad command ", spath);
            spath = spath.substring(1);
            if (spath.length < 1 // default
				|| spath === "browser.html") // Legacy
                spath = 'index.html';
			
            let path = spath.split(/\/+/);

            if (!this.ready) {
                // Not ready
                response.statusCode = 503;
                response.write("Not ready");
                response.end();
                return;
            }
            let contentType = "text/plain";
            let promise;

            // Allow cross-domain posting
            response.setHeader("Access-Control-Allow-Origin", "*");
            response.setHeader("Access-Control-Allow-Methods", "POST,GET");

            if (path[0] === "ajax") {
                // AJAX command, destined for the dispatcher
                path.shift();
                Utils.TRACE(TAG, `ajax ${path.join("/")}`);
                promise = this.dispatch(path, params)

                .then((reply) => {
                    if (typeof reply === "undefined" || reply === null)
						return "";
					else {
						contentType = "application/json";
						return JSON.stringify(reply);
					}
                });
            } else if (path.join("") === "") {
                promise = Promise.resolve("");
            } else {
                // Handle file lookup
                Utils.TRACE(TAG, "GET ", path.join("/"));
                let filepath = Utils.expandEnvVars(this.docroot +
                                                   "/" + path.join("/"));

                let m = /\.([A-Z0-9]+)$/i.exec(filepath);
                if (m) {
                    let Mime = require("mime-types");
                    contentType = Mime.lookup(m[1]);
                }
                promise = new Promise((resolve, reject) => {
					Fs.readFile(filepath)
					.then(resolve)
					.catch((error) => {
						// Treat as FNF
						Utils.ERROR(TAG, error);
						if (error.code === 'ENOENT')
							error.status = 404;
						reject(error);
					});
				});
            }

            promise
            .then((responseBody) => {
                response.statusCode = 200;
                response.setHeader("Content-Type", contentType);
                response.write(responseBody);
                response.end();
            })
            .catch((error) => {
                // Send the error message in the payload
                response.statusCode = error.status || 500;
                response.setHeader("Content-Type", "text/plain");
                response.write(error.toString());
                response.end();
			});
        };

        /**
         * handler for incoming GET request
         * @private
         */
        GET(request, response) {
            "use strict";
            try {
                // Parse URL parameters and pass them as the data
                let req = Url.parse("" + request.url, true);
                this.handle(req.pathname, req.query, request, response);
            } catch (e) {
                Utils.TRACE(TAG, `${e} in ${request.url}\n`,
                            typeof e.stack !== "undefined" ? e.stack : e);
                response.write(`${e} in ${request.url}\n`);
                response.statusCode = 400;
                response.end();
            }
        };

        /**
         * Handler for incoming POST request
         * @private
         */
        POST(request, response) {
            "use strict";

            let body = [],
                self = this;
            request.on("data", function (chunk) {
                body.push(chunk);
            }).on("end", function () {
                try {
                    // Parse the JSON body and pass as the data
                    let object;
                    if (body.length > 0) {
                        let sbody = Buffer.concat(body).toString();
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
    }
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
    return Server;
});
