/*@preserve Copyright (C) 2016-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import Url from "url";
import Path from "path";
const __dirname = Path.dirname(Url.fileURLToPath(import.meta.url));
const root = Path.normalize(Path.join(__dirname, "..", ".."));
import debug from "debug";

import Cors from "cors";
import Express from "express";
import Session from "express-session";
import SessionFileStore from "session-file-store";
import BasicAuth from "express-basic-auth";
import HTTP from "http";
import HTTPS from "https";

import { extend } from "../common/extend.js";
import { Location } from "../common/Location.js";

const trace = debug("Server");

const SESSION_COOKIE = "HOTPOT.sid";
const SESSIONS_DIR = Path.join(root, ".sessions");

/**
 * Lightweight HTTP(S) server. Only supports POST and GET and Basic auth
 * The server sits on the selected port and processes GET and POST
 * requests.
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
    this.port = proto.port;

    /**
     * Where in the world the server is locate
     * @member {Location}
     */
    this.location = proto.location;

    if (proto.privacy) {
      /**
       * SSL configuration
       * @member
       */
      this.ssl = proto.privacy.ssl;

      /**
       * Session secret
       * @private
       */
      this.session_secret = proto.privacy.session_secret;

      /**
       * Password file
       */
      this.passwords = proto.privacy.passwords;
    }

    /**
     * Absolute path to use to resolve relative path names. Not
     * included in the model.
     */
    this.basePath = undefined;

    /**
     * @member
     * @private
     */
    this.ready = false;

    process.on("unhandledRejection", reason => {
      console.error("unhandledRejection", reason, reason ? reason.stack : "");
    });

    /**
     * Express server
     * @member {Express}
     * @private
     */
    this.express = new Express();

    // Headers not added by passport?
    this.express.use(Cors());

    // Parse incoming requests with url-encoded payloads
    this.express.use(Express.urlencoded({ extended: true }));

    // Parse incoming requests with a JSON body
    this.express.use(Express.json());

    // Grab all static files relative to the project root
    // html, images, css etc. The Content-type should be set
    // based on the file mime type (extension) but Express doesn't
    // always get it right.....
    /* c8 ignore next 2 */
    trace("static files from %s", root);

    this.express.use(Express.static(root));

    // Debug report incoming requests
    this.express.use((req, res, next) => {
      /* c8 ignore next 2 */
      trace("%s %s", req.method, req.url);
      next();
    });

    const FileStore = SessionFileStore(Session);
    const sessionStore = new FileStore({
      //logFn: console.debug,
      path: SESSIONS_DIR,
      ttl: 24 * 60 * 60 // keep sessions around for 24h
    });

    this.express.use(Session({
      name: SESSION_COOKIE,
      secret: this.session_secret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true
    }));

    if (this.passwords) {
      this.express.use(BasicAuth({
        users: this.passwords,
        challenge: true,
        realm: "hotpot"
      }));
    }

    // /
    this.express.get(
      "/",
      (req, res) => res.sendFile(Path.join(root, "index.html")));
  }

  /**
   * Get a promise to start the server.
   * @return {Promise} a promise to start the server
   */
  start() {
    const protocol = this.ssl
          ? HTTPS.Server(this.ssl, this.express)
          : HTTP.Server(this.express);
    this.listener = protocol.listen(this.port);
    trace("Server started on port %d", this.port);
  }

  stop() {
    this.listener.close();
  }
}

/**
 * Configuration model, for use with {@link DataModel}
 * @typedef Server.Model
 * @property {number} port Port to run the server on
 * @property {Location} location Where in the world the server is located
 * @property {object} ssl SSL configuration
 * @property {string} ssl.cert SSL certificate
 * @property {string} sslkey SSL key
 */
Server.Model = {
  $class: Server,
  $doc: "HTTP(S) server",
  port: {
    $doc: "Port to run the server on",
    $class: Number
  },
  location: extend({}, Location.Model, {
    $doc: "Where in the world the server is located"
  }),
  privacy: {
    $optional: true,
    $doc: "Privacy options",
    session_secret: {
      $class: String,
      $doc: "Session secret shared with browser"
    },
    passwords: {
      $optional: true,
      $map_of: { $class: String },
      $doc: "passwords (filepath, must be somewhere not visible to GET)"
    },
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
    }
  }
};

export { Server }
