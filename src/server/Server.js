/*@preserve Copyright (C) 2016-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import Url from "url";
import Path from "path";
const __dirname = Path.dirname(Url.fileURLToPath(import.meta.url));
const root = Path.normalize(Path.join(__dirname, "..", ".."));

import Cors from "cors";
import Express from "express";
import Session from "express-session";
import SessionFileStore from "session-file-store";
import { hash, compare } from "bcrypt";
import Passport from "passport";
import { Strategy } from "passport-strategy";
import HTTP from "http";
import HTTPS from "https";
import { promises as Fs } from "fs";

import { Utils } from "../common/Utils.js";
import { Location } from "../common/Location.js";

const TAG = "Server";

const SESSION_COOKIE = "HOTPOT.sid";
const SESSIONS_DIR = Path.join(root, ".sessions");

function pw_hash(pw) {
  if (typeof pw === "undefined")
    return Promise.resolve(pw);
  else
    return hash(pw, 10);
}

function pw_compare(pw, hash) {
  if (typeof pw === "undefined")
    return Promise.resolve(typeof hash === "undefined");
  else
    return compare(pw, hash);
}

class HotpotPass extends Strategy {

  /**
   * @param {function} checkUserPass function used to check name and pass
   * @param {function} checkUserToken function used to check reset token
   */
  constructor(checkUserPass, checkToken) {
    super();
    this.name = "xanado";
    this._checkUserPass = checkUserPass;
    this._checkToken = checkToken;
  }

  /*
   * @param {Request} req incoming signin request
   */
  authenticate(req) {
    let promise;
    if (req.body.signin_username)
      promise = this._checkUserPass(
        req.body.signin_username, req.body.signin_password);
    else
      promise = this._checkToken(req.params.token);
    return promise.then(uo => this.success(uo))
    .catch (e => {
      //console.assert(false, `${user}: ${e.message}`);
      this.fail(e.message);
    });
  }
}

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

    /**
     * SSL configuration
     * @member
     */
    this.ssl = proto.ssl;

    /**
     * Session secret
     * @private
     */
    this.session_secret = proto.session_secret;

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
    Utils.TRACE(TAG, "static files from ", root);

    this.express.use(Express.static(root));

    // Debug report incoming requests
    this.express.use((req, res, next) => {
      /* c8 ignore next 2 */
      Utils.TRACE(TAG, `${req.method} ${req.url}`);
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

    this.express.use(Passport.initialize());

    // Connect Passport to the expression Session middleware.
    this.express.use(Passport.session());

    Passport.serializeUser((userObject, done) => {
      // Decide what info from the user object loaded from
      // the DB needs to be shadowed in the session as
      // req.user
      //this.debug("UserManager: serializeUser", userObject);
      done(null, userObject);
    });

    Passport.deserializeUser((userObject, done) => {
      // Session active, look it up to get user
      //this.debug("UserManager: deserializeUser",userObject);
      // attach user object as req.user
      done(null, userObject);
    });

    Passport.use(new HotpotPass(
      (user, pass) => this.getUser({ name: user, pass: pass }),
      token => this.getUser({ token: token })));

    // /
    this.express.get(
      "/",
      (req, res) => res.sendFile(Path.join(root, "index.html")));

    // /trace?ids=...
    this.express.get(
      "/trace",
      (req, res) => {
        // Set tracing level
        Utils.TRACEfilter(req.query.ids);
        res.end();
      });

  }

  getUserDB() {
    return Fs.readFile(this.passwd)
    .then(buf => JSON.parse(buf));
  }

  saveUserDB(db) {
    return Fs.writeFile(this.passwd, JSON.stringify(db));
  }

  /**
   * Promise to get the user object for the described user.
   * You can lookup a user without name if you have email or key.
   * @param {object} desc user descriptor
   * @param {string?} desc.key match the user key. This will take
   * precedence over any other type of matching.
   * @param {string?} desc.user user name - if you give this you also
   * have to either give `password` or `ignorePass`
   * @param {string?} desc.pass user password, requires user, may be undefined
   * but must be present if `user` is given.
   * @param {boolean} desc.ignorePass true will ignore passwords
   * @param {string?} desc.email user email
   * @return {Promise} resolve to user object, or throw
   */
  getUser(desc, ignorePass) {
    return this.getUserDB()
    .then(db => {
      if (typeof desc.key !== "undefined") {
        const uo = db.find(uo => uo.key === desc.key);
        if (uo)
          return uo;
      }

      for (const uo of db) {
        if (typeof desc.token !== "undefined"
            && uo.token === desc.token) {
          // One-time password change token
          delete uo.token;
          return this.writeDB()
          .then(() => uo);
        }

        if (typeof desc.name !== "undefined"
            && uo.name === desc.name) {

          if (ignorePass)
            return uo;
          if (typeof uo.pass === "undefined") {
            if (desc.pass === uo.pass)
              return uo;
            throw new Error(/*i18n*/"wrong-pass");
          }
          return pw_compare(desc.pass, uo.pass)
          .then(ok => {
            if (ok)
              return uo;
            throw new Error(/*i18n*/"wrong-pass");
          })
          .catch(e => {
            /* c8 ignore next 2 */
            Utils.TRACE(TAG, "UserManager: getUser", desc, "failed; bad pass", e);
            throw new Error(/*i18n*/"wrong-pass");
          });
        }

        if (typeof desc.email !== "undefined"
            && uo.email === desc.email)
          return uo;
      }
      /* c8 ignore next 2 */
      Utils.TRACE(TAG, "getUser", desc, "failed; no such user in",
                   db.map(uo=>uo.key).join(";"));
      throw new Error(/*i18n*/"player-unknown");
    });
  }

  /**
   * Add a new user to the DB, if they are not already there
   * @param {object} desc user descriptor
   * @param {string} desc.user user name
   * @param {string} desc.provider authentication provider e.g. google
   * @param {string?} desc.pass user password, requires user.
   * Will be encrypted if defined before saving.
   * @param {string?} desc.email user email
   * @param {string?} key optionally force the key to this
   * @return {Promise} resolve to user object, or reject if duplicate
   */
  addUser(desc) {
    return this.getUserDB()
    .then(() => pw_hash(desc.pass))
    .then(pw => {
      if (typeof pw !== "undefined")
        desc.pass = pw;
      /* c8 ignore next 2 */
      Utils.TRACE(TAG, "UserManager: add user", desc);
      this.db.push(desc);
      return this.writeDB()
      .then(() => desc);
    });
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
    Utils.TRACE(TAG, `Server started on port ${this.port}`);
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
  location: Utils.extend({}, Location.Model, {
    $doc: "Where in the world the server is located"
  }),
  session_secret: {
    $class: String,
    $doc: "Session secret"
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
};

export { Server }
