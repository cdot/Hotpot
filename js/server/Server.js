/*@preserve Copyright (C) 2016-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs").promises;
const Url = require("url");
const Path = require("path");

define([
  "js/common/Utils", "js/common/DataModel", "js/common/Location"
], (
  Utils, DataModel, Location
) => {

  const TAG = "Server";

  /**
   * Super-lightweight HTTP(S) server with very few
   * dependencies. Only supports POST and GET and Basic auth
   * The server sits on the selected port and processes GET and POST
   * requests. The predefined root path `/ajax` is used to decide when to
   * route requests to a dispatcher function. Otherwise requests are
   * handled as files relative to the defined `docroot`.
   *
   * Yes, I could have used express, but I wrote this before I knew about
   * it, and it "just works".
   * @param {object} proto see Server.Model
   * @class
   */
  class Server {

    /**
     * Construct from a configuration data block built using
     * {@link DataModel} and Model
     */
    constructor(proto) {

      /**
       * Port to run the server on
       * @member {number}
       */
      this.port = undefined;

      /**
       * File path to server documents
       * @member {string}
       */
      this.docroot = undefined;

      /**
       * Where in the world the server is locate
       * @member {Location}
       */
      this.location = undefined;

      /**
       * SSL configuration
       * @member
       */
      this.ssl = undefined;

      /**
       * Basic auth to access the server
       * @member
       */
      this.auth = undefined;

      /**
       * Absolute path to use to resolve relative path names. Not
       * included in the model.
       */
      this.basePath = undefined;

      Utils.extend(this, proto);

      /**
       * @member
       * @private
       */
      this.ready = false;

      if (typeof this.auth !== "undefined") {
        this.authenticate = request => {
          let BasicAuth = require("basic-auth");
          let credentials = BasicAuth(request);
          if (typeof credentials === "undefined")
            return false;
          return (credentials.name === this.auth.user &&
                  credentials.pass === this.auth.pass);
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
      let handler = (request, response) => {
        if (typeof this.authenticate !== "undefined") {
          if (!this.authenticate(request)) {
            Utils.TRACE(TAG, "Authentication failed ", request.url);
            response.statusCode = 401;
            response.setHeader('WWW-Authenticate',
                               `Basic realm="${this.auth.realm}"`);
            response.end('Access denied');
            return;
          }
        }
        if (this[request.method]) {
          this[request.method].call(this, request, response);
        } else {
          response.statusCode = 405;
          response.write(`No support for ${request.method}`);
          response.end();
        }
      };

      let promise = Promise.resolve();

      if (typeof this.ssl !== "undefined") {
        const options = {};

        promise = promise

        .then(c => {
          options.key = this.ssl.key;
          options.cert = this.ssl.cert;
          Utils.TRACE(TAG, "SSL certificates loaded");
          if (typeof this.auth !== "undefined")
            Utils.TRACE(TAG, "Requires authentication");
          Utils.TRACE(TAG, "HTTPS starting on port ", this.port);
        })

        .then(() => require("https").createServer(options, handler));

      } else {
        if (typeof this.auth !== "undefined")
          Utils.TRACE(TAG, "Requires authentication");
        Utils.TRACE(TAG, "HTTP starting on port ", this.port);
        promise = promise
        .then(() => require("http").createServer(handler));
      }

      return promise
      .then(httpot => {
        this.ready = true;
        this.http = httpot;
        httpot.listen(this.port);
      })
      .catch(e => {
        Utils.TRACE(TAG, `Server error ${e}`);
      });
    }

    /**
     * return a promise to stop the server
     */
    stop() {
      return new Promise((resolve, reject) => {
        this.http.close(e => {
          if (e instanceof Error)
            reject(e);
          else
            resolve();
        });
      });
    }

    /**
     * Common handling for POST or GET
     * @private
     */
    handle(spath, params, request, response) {
      if (spath.indexOf("/") !== 0 || spath.length === 0)
        throw Utils.exception(TAG, "Bad command ", spath);
      spath = spath.substring(1);
      if (spath.length < 1 // default
          ||
          spath === "browser.html") // Legacy
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
        Utils.TRACE(TAG, `/ajax/${path.join("/")}`);
        promise = this.dispatch(path, params)

        .then(reply => {
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

        let filepath = Path.join(this.docroot, path.join(Path.sep));
        if (!Path.isAbsolute(filepath))
          filepath = Path.join(this.basePath, filepath);

        let m = /\.([A-Z0-9]+)$/i.exec(filepath);
        if (m) {
          let Mime = require("mime-types");
          contentType = Mime.lookup(m[1]);
        }
        promise = new Promise((resolve, reject) => {
          Fs.readFile(filepath)
          .then(resolve)
          .catch(error => {
            // Treat as FNF
            Utils.TRACE(TAG, error);
            if (error.code === 'ENOENT')
              error.status = 404;
            reject(error);
          });
        });
      }

      promise
      .then(responseBody => {
        response.statusCode = 200;
        response.setHeader("Content-Type", contentType);
        response.write(responseBody);
        response.end();
      })
      .catch(error => {
        // Send the error message in the payload
        response.statusCode = error.status || 500;
        response.setHeader("Content-Type", "text/plain");
        response.write(error.toString());
        response.end();
      });
    }

    /**
     * handler for incoming GET request
     * @private
     */
    GET(request, response) {
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
    }

    /**
     * Handler for incoming POST request
     * @private
     */
    POST(request, response) {
      let body = [];
      request
      .on("data", chunk => body.push(chunk))
      .on("end", () => {
        try {
          // Parse the JSON body and pass as the data
          let object;
          if (body.length > 0) {
            let sbody = Buffer.concat(body).toString();
            //Utils.TRACE(TAG, "Parsing message ", sbody);
            object = JSON.parse(sbody);
          }
          this.handle(request.url, object, request, response);
        } catch (e) {
          Utils.TRACE(TAG, e, " in ", request.url, "\n", e.stack);
          response.write(`${e} in ${request.url}\n`);
          response.statusCode = 400;
        }
      });
    }
  }

  /**
   * Configuration model, for use with {@link DataModel}
   * @typedef Server.Model
	 * @property {number} port Port to run the server on
	 * @property {string} docroot Absolute file path to server documents
	 * @property {Location} location Where in the world the server is located
	 * @property {object} ssl SSL configuration
	 * @property {string} ssl.cert SSL certificate
	 * @property {string} sslkey SSL key
	 * @property {object} auth Basic auth to access the server
	 * @property {string} auth.user Username
	 * @property {string} auth.pass Password
	 * @property {string} auth.realm Authentication realm
   */
  Server.Model = {
    $class: Server,
    $doc: "HTTP(S) server",
    port: {
      $doc: "Port to run the server on",
      $class: Number
    },
    docroot: {
      $doc: "Path to server document root, relative to configuration file",
      $class: String
    },
    location: Utils.extend({}, Location.Model, {
      $doc: "Where in the world the server is located"
    }),
    ssl: {
      $doc: "SSL configuration",
      $optional: true,
      cert: {
        $class: String,
        $fileable: true,
        $doc: "SSL certificate (filename or text)"
      },
      key: {
        $class: String,
        $fileable: true,
        $doc: "SSL key (filename or text)"
      }
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
