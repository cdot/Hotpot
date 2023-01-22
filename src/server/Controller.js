/*@preserve Copyright (C) 2016-2023 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import Events from "events";
import Path from "path";
import { promises as Fs } from "fs";

import { Utils } from "../common/Utils.js";
import { Request } from "../common/Request.js";
import { DataModel } from "../common/DataModel.js";
import { Thermostat } from "./Thermostat.js";
import { Pin } from "./Pin.js";

const TAG = "Controller";

/* global HOTPOT_DEBUG */

/**
 * Controller for a number of pins, thermostats, calendars, weather agents,
 * and the rules that manage the system state based on inputs from all these
 * elements.
 *
 * @param {object} proto prototype object
 * @class
 */
class Controller extends Events.EventEmitter {

  /**
   * Construct from a configuration data block built using
   * {@link DataModel} and Model
   * @param {object} proto data block
   */
  constructor(proto) {
    super();
    Utils.extend(this, proto);
  }

  /**
   * Start the controller.
   * @return {Promise} Promise resolving to `this`
   */
  initialise() {
    Utils.TRACE(TAG, "Initialising Controller");

    return this.initialisePins()

    .then(() => this.resetValve())

    .then(() => this.initialiseThermostats())

    .then(() => this.initialiseCalendars())

    .then(() => this.initialiseWeatherAgents())

    // Start the poll loop; the promise returned resolves to this
    .then(() => this.pollRules());
  };

  /**
   * Create weather agents
   * @param {Array} configs array of weather agent configurations
   * @return {Promise} Agent creation doesn't depend on this
   * promise, it will resolve immediately.
   * @private
   */
  initialiseWeatherAgents() {
    let promises = [];
    for (let name in this.weather) {
      promises.push(this.weather[name].initialise());
    }
    return Promise.all(promises).then(() => {
      Utils.TRACE(TAG, "Initialised Weather Agents");
    });
  };

  /**
   * Add (or cancel) a request to a thermostat.
   * @param {string} service thermostat to add the request to, or "ALL"
   * to add the request to (remove requests from) all thermostats.
   * @param {Request} req request to add. If `until` is `Request.CLEAR`,
   * will remove all requests from the given `source`.
   * @private
   */
  makeRequest(service, req) {
    const remove = (req.until === Request.CLEAR);

    Utils.TRACE(TAG, "makeRequest ", service, req);

    if (/^ALL$/i.test(service)) {
      for (let name in this.thermostat) {
        const th = this.thermostat[name];
        if (remove)
          th.purgeRequests({
            source: req.source
          }, true);
        else
          th.addRequest(req);
      }
    } else if (!this.thermostat[service])
      throw Utils.exception(
        TAG, `Cannot add request, ${service} is not a known thermostat`);
    else if (remove)
			this.thermostat[service].purgeRequests({
				source: req.source
			}, true);
		else
      // will purge existing requests
			this.thermostat[service].addRequest(req);
  };

  /**
   * Attach handlers to calendars calendars
   * @param {Array} configs array of calendar configurations
   * @return {Promise} Calendar creation doesn't depend on this
   * promise, it will resolve immediately.
   * @private
   */
  initialiseCalendars() {
    Utils.TRACE(TAG, "Initialising Calendar");

    for (const name in this.calendar) {
      const cal = this.calendar[name];
      const source = `Calendar ${name}`;

      // Set the list of services the calendar must recognise
			cal.setServices(Object.keys(this.thermostat));

      // Set the function to be called when an event in the
      // calendar triggers
      cal.onTrigger(
        (service, request) => this.makeRequest(service, request));

      // Set the function to be called when an event is removed
      // from the calendar
      cal.onRemove(event => {
        if (/^ALL$/i.test(event.service)) {
          for (let name in this.thermostat) {
            let th = this.thermostat[name];
            th.purgeRequests({
              source: source
            }, true);
          }
        } else if (this.thermostat[event.service]) {
          this.thermostat[event.service].purgeRequests({
            source: source
          }, true);
        }  
      });

      // Queue an asynchronous calendar update
      cal.update(1000);
    }

    Utils.TRACE(TAG, "Initialised Calendars");
    return Promise.resolve();
  };

  /**
   * Create pins as specified by configs
   * @param {Map} configs map of pin configurations
   * @return {Promise} Pins are ready for use when this promise
   * is resolved.
   * @private
   */
  initialisePins() {
    const promises = [];
    for (let name in this.pin)
      promises.push(this.pin[name].initialise());
    return Promise.all(promises).then(() => {
      Utils.TRACE(TAG, "Initialised pins");
    });
  }

  /**
   * Promise to reset pins to a known state on startup.
   * @return {Promise} resolves to `undefined`
   * @private
   */
  resetValve() {
    const pins = this.pin;
    const valveBack = this.valve_return;

    Utils.TRACE(TAG, "Resetting valve");
    return pins.HW.setState(1, "Reset")

    .then(() => {
      Utils.TRACE(TAG, "Reset: HW(1) done");
      return new Promise(resolve => {
        Utils.startTimer("HWreset", resolve, valveBack);
      });
    })

    .then(() => {
      Utils.TRACE(TAG, "Reset: delay done");
      return pins.CH.setState(0, "Reset");
    })

    .then(() => {
      Utils.TRACE(TAG, "Reset: CH(0) done");
      return pins.HW.setState(0, "Reset");
    })

    .then(() => {
      Utils.TRACE(TAG, "Valve reset");
    })

    .catch(e => {
      Utils.TRACE(TAG, "Failed to reset valve: ", e);
    });
  }

  /**
   * Create thermostats as specified by config
   * @return {Promise} resolves when thermostats are initialised
   * @private
   */
  initialiseThermostats() {
    let promises = [];
    for (let name in this.thermostat) {
      promises.push(
        this.thermostat[name].initialise()
        .then(th => {
          th.setAlertHandler(
            mess => this.sendMailToAdmin("HOTPOT ALERT", mess));
          return th.poll();
        }));
    }
    return Promise.all(promises).then(() => {
      Utils.TRACE(TAG, "Initialised thermostats");
    });
  };

  /**
   * Set a handler to be invoked if there's a problem requiring
   * an admin alert
   * @param {function} func handler function
   */
  setAlertHandler(func) {
    for (let name in this.thermostat)
      this.thermostat[name].setAlertHandler(func);
  }

  /**
   * Set the location of the server
   * @param {Location} location where the server is
   */
  setLocation(location) {
    for (let name in this.weather) {
      this.weather[name].setLocation(location);
    }
  };

  /**
   * Generate and return a promise for a serialisable version of
   * the structure, suitable for use in an AJAX response.
   * @return {Promise} resolves to the serialisable state object
   */
  getSerialisableState() {

    let state = {
      time: Date.now() // local time
    };

    let promises = [];

    for (let field in this) {
      let block = this[field];
      for (let key in block) {
        let item = block[key];
        if (typeof item === "undefined")
          continue;
        if (typeof item.getSerialisableState === "function") {
          if (typeof state[field] === "undefined")
            state[field] = {};
          promises.push(
            item.getSerialisableState()
            .then(value => {
              state[field][key] = value;
              return field;
            }));
        }
      }
    }

    if (Utils.TRACEing(TAG)) {
      state.timers = {};
      let timers = Utils.getTimers();
      for (let tid in timers) {
        Utils.TRACE(TAG, "\t", tid, new Date(timers[tid].when));
        state.timers[tid] = new Date(timers[tid].when).toString();
      }
    }

    return Promise.all(promises)
    .then(() => state);
  };

  /**
   * Get the logs for a set
   * @param {string} set  e.g. pin, thermostat, weather
   * @param {number} since optional param giving start of logs
   * as a ms datime
   * @return {Promise} resolves to the logs
   * @private
   */
  getLogsFor(set, since) {
    let promises = [];
    let logset;

    for (let key in set) {
      let item = set[key];
      if (typeof item !== "undefined" &&
          typeof item.getSerialisableLog === "function") {
        promises.push(
          item.getSerialisableLog(since)
          .then(value => {
            if (!logset)
              logset = {};
            logset[key] = value;
          }));
      }
    }

    return Promise.all(promises).then(() => logset);
  };

  /**
   * Generate and promise to return a serialisable version of the
   * logs, suitable for use in an AJAX response.
   * @param {number} since optional param giving start of logs
   *  as a ms datime
   * @return {Promise} a promise that resolves to a serialisable structure
   */
  getSerialisableLog(since) {

    let logs = {};
    let promises = [];

    for (let field in this) {
      promises.push(
        this.getLogsFor(this[field], since)
        .then(logset => {
          if (logset)
            logs[field] = logset;
        }));
    }

    return Promise.all(promises)
    .then(() => logs);
  };

  /**
   * Get a promise to set the on/off state of a pin, suitable for
   * calling from Rules. This is more
   * sophisticated than a simple `Pin.setState()` call, because there is a
   * relationship between the state of the pins in Y-plan systems
   * that must be respected.
   * @param {String} channel e.g. "HW" or "CH"
   * @param {number} state 1 (on) or 0 (off)
   * @return {Promise} resolves when state has been set
   */
  setPromise(channel, newState) {
    let pins = this.pin;

    // Avoid race condition during initialisation
    if (pins[channel] === "undefined")
      return Promise.resolve();

    if (this.pending) {
      return new Promise(resolve => {
        Utils.startTimer("setPromise", () => resolve(
          this.setPromise(channel, newState)),
                         this.valve_return);
      });
    }

    return pins[channel].getState()

    .then(curState => {
      if (curState === newState)
        return Promise.resolve(); // already in the right state

      // Y-plan systems have a state where if the heating is
      // on but the hot water is off, and the heating is
      // turned off, then the grey wire to the valve (the
      // "hot water off" signal) is held high, stalling the
      // motor. They are designed for this so it's not a big
      // problem, but we can resolve it by briefly turning
      // on the hot water while we turn the heating off,
      // then turning it off again. That will allow the spring
      // to return, powering down the motor.

      if (channel === "CH" && curState === 1 && newState === 0) {
        // CH is on, and it's going off
        return pins.HW.getState()
        .then(hwState => {
          // HW is on, so just turn CH off
          if (hwState !== 0)
            return pins.CH.setState(newState);

          // HW is 0 but CH is 1, so we're in state 3 (grey
          // live and white live).
          // Need to switch on HW to kill the grey wire.
          // This allows the spring to fully return. Then after a
          // timeout, turn CH off.
          this.pending = true;
          return pins.CH.setState(0) // switch off CH
          .then(() => pins.HW.setState(1)) // switch on HW
          // wait for spring return
          .then(() => new Promise(
            resolve => Utils.startTimer(
              "springReturn",
              resolve, this.valve_return)))
          .then(() => pins.HW.setState(0)) // switch off HW
          .then(() => {
            this.pending = false;
          });
        });
      }

      // Otherwise this is a simple state transition, just
      // promise to set the appropriate pin
      return pins[channel].setState(newState);
    });
  };

  getLog(type, service, since) {
    // Get the log for the given object of the given type
    return this[type][service].getSerialisableLog(since);
  }

  /**
   * Command handler for ajax commands, suitable for calling by a Server.
   * @params {array} path the url path components
   * @param {object} data structure containing parameters. These
   * vary according to the command (commands are documented in
   * README.md)
   * @return {Promise} resolves to an object for serialisation
   * in the response
   */
  addRoutes(router) {

    router.get("/state", (req, res) => this.getSerialisableState()
               .then(state => res.json(state)));

    // /log/thermostat/HW
    router.get(
      "/log/:type/:name",
      (req, res) =>
      this.getLog(req.params.type, req.params.name, req.body.since)
      .then(log => res.json(log)));

    // /config?path=/to/config/node
    router.get(
      "/config",
      (req, res) => {
        const p = DataModel.at(this, Controller.Model, req.query.path);
        DataModel.getSerialisable(p.node, p.model)
        .then(response => res.json(response));
      });

    // /config?path=/to/config/node
    router.post(
      "/config",
      (req, res) => {
        const path = req.query.path;

        // Locate the data in the Controller model
        const p = DataModel.at(this, Controller.Model, path);

        if (typeof p.parent === "undefined" ||
            typeof p.key === "undefined" ||
            typeof p.node === "undefined")
          throw Utils.exception(
            TAG,
            `Cannot update ${path}, insufficient context`);

        // Now remodel the data using the sub-model
        DataModel.remodel({
          index: p.key,
          data: req.body,
          model: p.model,
          context: path,
          loadFileable: f => Fs.readFile(f)
          .catch(e => {
            const failover = Path.join(this.basePath, f);
            console.error("Failover", failover, e);
            return Fs.readFile(failover);
          })
        })

        // Assign the remodeled data to the right place in the
        // controller data
        .then(rebuilt => {
          p.parent[p.key] = rebuilt;
          Utils.TRACE(TAG, `setconfig ${path} = `, rebuilt);
          return rebuilt;
        })
        // finally trigger a save at the right place in
        // the controller data. This will walk up the
        // structure until $read_from is found.
        .then(() => DataModel.saveData(this, Controller.Model, path))
        .then(() => res.end());
      });

    router.use(
      "/request",
      (req, res) => {
        // Push a request onto a service (or all services). Requests may come
        // from external sources such as browsers.
        // /request?source=;service=;temperature=;until=
        // source: identifier for the calendar
        // service: the name of a thermostat, or "all"
        // temperature: celcius or "off"
        // until: an epoch-ms date, or "boost" or "clear"
        const request = new Request(req.body);
        this.makeRequest(req.body.service, request);
        res.end();
      });
    for (const cal of Object.values(this.calendar)) {
      cal.addRoutes(router);
    }
  }

  /**
   * Evaluate rules at regular intervals.
   * @private
   */
  pollRules() {
    Utils.TRACE(TAG, "Polling rules");

    // Purge completed requests
    for (let name in this.thermostat)
      this.thermostat[name].purgeRequests();

    // Test each of the rules. Rule evaluation functions
    // return a promise to set a pin state, which is decided
    // by reading the thermostats. Requests in the thermostats
    // may define a temperature target, or if not the timeline
    // is used.
    let promises = [];
    for (let name in this.rule) {
      let rule = this.rule[name];
      promises.push(rule.test(this));
    }

    return Promise.all(promises)
    .then(() => {
      // Queue the next poll
      this.pollTimer = Utils.startTimer(
        "pollRules", () => this.pollRules(), this.rule_interval);
      return this;
    });
  }

  /**
   * Stop the controller polling loop, and the polling loops associated
   * with sensors
   */
  stop() {
    this.stopped = true;
    if (typeof this.pollTimer !== "undefined") {
      Utils.cancelTimer(this.pollTimer);
      delete this.pollTimer;
    }
    for (let name in this.thermostat) {
      this.thermostat[name].stop();
    }
    for (let name in this.calendar) {
      this.calendar[name].stop();
    }
    for (let name in this.weather) {
      this.weather[name].stop();
    }
  }

  /**
   * Return a promise to send mail to the admin. The promise resolves
   * to an info block used by tests, which can safely be ignored.
   * @param {string} subject subject of the mail
   * @param {string} text body of the mail
   */
  sendMailToAdmin(subject, text) {
    return import("nodemailer")
    .then(NodeMailer => {
      let promise;

      if (typeof this.mail === "undefined") {
        if (typeof HOTPOT_DEBUG === "undefined") {
          console.error("Mail not configured and no --debug");
          return null;
        }
        promise = HOTPOT_DEBUG.setupEmail(NodeMailer)
        .then(mail => {
          this.mail = mail;
        });
      } else
        promise = Promise.resolve();

      return promise
      .then(() => NodeMailer.createTransport({
        host: this.mail.host,
        port: this.mail.port,
        secure: this.mail.port == 465,
        auth: {
          user: this.mail.user,
          pass: this.mail.pass
        }
      }))
      .then(transporter => new Promise((resolve, reject) => {
        transporter.sendMail({
          from: this.mail.from,
          to: this.mail.to,
          subject: subject,
          html: text,
          text: text
        }, (err, info) => {
          if (err !== null) reject(err)
          else resolve(info);
        });
      }))
      .then(info => {
        // ethereal mail host used in testing
        if (this.mail.host === "smtp.ethereal.email")
          console.log("Mail preview URL: ",
                      NodeMailer.getTestMessageUrl(info));
        return info;
      })
      .catch(err => console.error(`Mail error ${err}`));
    });
  }
}

/**
 * Configuration model, for use with {@link DataModel}
 * @typedef Controller.Model
 * @property {object} mail Admin mail configuration
 * @property {string} mail.host Send mail host
 * @property {number} mail.port Mail host port
 * @property {string} mail.user Mail host user
 * @property {string} mail.pass Mail host pass
 * @property {string} mail.from Mail sender
 * @property {string} mail.to Mail recipient
 * @property {object.<string,Thermostat>} thermostat Set of Thermostats
 * @property {object.<string,Pin>} pin Set of Pins
 * @property {object.<string,Rule>} rule Set of Rules
 * @property {object.<string,Calendar>} calendar Set of Calendars e.g. GoogleCalendar
 * @property {object.<string,Weather>} weather Set of weather agents e.g. MetOffice
 * @property {number} valve_return Time to wait for the multiposition valve to return to the discharged state, in ms
 * @property {number} rule_interval Frequency at which rules are re-evaluated, in ms

 */
Controller.Model = {
  $class: Controller,
  mail: {
    $doc: "Admin mail configuration",
    $optional: true,
    host: {
      $doc: "Send mail host",
      $class: String
    },
    port: {
      $doc: "Mail host port",
      $class: Number
    },
    user: {
      $doc: "Mail host user",
      $class: String
    },
    pass: {
      $doc: "Mail host pass",
      $class: String
    },
    from: {
      $doc: "Mail sender",
      $class: String
    },
    to: {
      $doc: "Mail recipient",
      $class: String
    }
  },
  thermostat: {
    $doc: "Set of Thermostats",
    $map_of: Thermostat.Model
  },
  pin: {
    $doc: "Set of Pins",
    $map_of: Pin.Model
  },
  valve_return: {
    $doc: "Time to wait for the multiposition valve to return to the discharged state, in ms",
    $class: Number,
    $default: 8000
  },
  rule_interval: {
    $doc: "Frequency at which rules are re-evaluated, in ms",
    $class: Number,
    $default: 5000
  },
  rule: {
    $doc: "Set of Rules",
    $map_of: {
      $instantiable: true
    }
  },
  calendar: {
    $doc: "Set of Calendars e.g. HotpotCalendar",
    $map_of: {
      $instantiable: true
    }
  },
  weather: {
    $doc: "Set of weather agents e.g. MetOffice",
    // We don't know what class the agents are yet
    $map_of: {
      $instantiable: true
    }
  }
};

export { Controller }
