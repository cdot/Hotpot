/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
/* global HOTPOT_SIM */

import debug from "debug";
import { extend } from "../common/extend.js";
import { expandEnv } from "../common//expandEnv.js";
import { startTimer, cancelTimer } from "../common/Timers.js";
import { DataModel } from "../common/DataModel.js";
import { Time } from "../common/Time.js";
import { Timeline } from "../common/Timeline.js";
import { DS18x20 } from "./DS18x20.js";
import { Historian } from "./Historian.js";
import { Request } from "../common/Request.js";

const trace = debug("Thermostat");

// Default interval between polls
const DEFAULT_POLL_INTERVAL = 20; // seconds

// If there has been no response from the sensor in this time, email an
// alarm to the admin
const NO_RESPONSE_ALARM = 10 * 60 * 1000; // 10 mins in ms

/**
 * Interface to a DS18x20 thermostat. This object takes care of polling the
 * device for regular temperature updates that can then be read from the
 * object.
 *
 * A thermostat also maintains one or more `Thermostat.Request`s.
 * These are used to record a requirement for a target temperature
 * for a thermostat.
 *
 * Where two sources both request different targets, then the request that
 * expires first applies. If they both expire at the same time, then the
 * most recent request received applies.
 */
class Thermostat {

  /**
   * Construct from a configuration data block built using
   * {@link DataModel} and Model
   * @param {object} proto data block object containing fields
   * @param {string} name name of thermostat
   */
  constructor(proto, name) {

    /**
     * Unique ID used to communicate with this thermostat
     * @member {string}
     */
    this.id = undefined;

    /**
     * Polling frequency, in seconds
     * @member {Number}
     */
    this.poll_every = undefined;

    /**
     * Timeline
     * @member {Timeline}
     */
    this.timeline = undefined;

    /**
     * History
     * @member {Historian}
     */
    this.history = undefined;

    extend(this, proto);

    /**
     * @member {string}
     * @desc  Name of the thermostat e.g. "HW"
     */
    this.name = name;

    /**
     * Lists of requests
     * @member {Request[]}
     */
    this.requests = [];

    /**
     * Loaded asynchronously
     * @member
     */
    this.sensor = new DS18x20(this.id);

    /**
     * Last recorded temperature {float}
     * @member {number}
     */
    this.temperature = 0;

    /**
     * Remember the time of the last known good sample
     * @member {number}
     */
    this.lastKnownGood = Date.now();

    let hc = this.history;
    if (typeof hc !== "undefined") {
      if (typeof hc.interval === "undefined")
        hc.interval = 300; // 5 minutes
    }

    /**
     * Handler to be invoked if there's a problem requiring
     * an admin alert
     * @member
     */
    this.alertHandler = undefined;

    /**
     * Timeout id for the temperature poll timer
     * @member
     */
    this.pollTimer = undefined;
  }

  /**
   * Return a promise to intiialise the thermostat with a valid value read
   * from the probe.
   * @return {Promise} The promise resolves to the Thermostat
   */
  initialise() {
    let promise;
    if (typeof this.timeline === "string") {
      promise = Promise.resolve(DataModel.loadData(
        expandEnv(this.timeline), Timeline.Model))
      .then(data => {
        this.timeline = data;
      });
    } else
      promise = Promise.resolve();

    return promise
    .then(() => new Promise(resolve => {
      this.sensor.initialiseSensor()
      .then(s => s.getTemperature())
      .then(t => resolve(t))
      .catch(e => {
        console.error(`Thermostat ${this.id} initialisation failed ${e}`);
        trace(e.stack);
        if (typeof HOTPOT_SIM === "undefined") {
          console.error("--debug not enabled");
          // Don't do this, it raises an unhandled reject
          // throw e;
          // Do this instead:
          resolve(100);
          // that will make hotpot turn the relevant service on.
          // The temperature ultimately is limited by the hard
          // thermostats, so we don't risk anything by this.
        } else {
          // Fall back to debug
          this.sensor = HOTPOT_SIM.getService(this.name);
          console.error(`Falling back to simulator for thermostat '${this.name}'`);
          resolve(this.sensor.getTemperature());
        }
      });
    }))
    .then(temp => {
      this.temperature = temp;
      // Start the historian
      if (this.history) {
        trace(`starting historian for '${this.name}' at ${temp}`);
        this.history.start(() => {
          return Math.round(this.temperature * 10) / 10;
        });
      }
      trace(`'${this.name}' initialised`);
      return this;
    });
  }

  /**
   * Generate and return a promise for a serialisable version of the state
   * of the object, suitable for use in an AJAX response.
   * @return {Promise} a promise
   * @protected
   */
  getSerialisableState() {
    this.purgeRequests();
    return Promise.resolve({
      temperature: this.temperature,
      lastKnownGood: this.lastKnownGood,
      target: this.getTargetTemperature(),
      requests: this.requests
    });
  };

  /**
   * Synchronously get the temperature history of the thermostat as a
   * serialisable structure. Note that the history is sampled at intervals,
   * but not every sample time will have a event. The history is only
   * updated if the temperature changes.
   * @return {Promise} promise to get an array of alternating times and
   * temps. Times are all relative to a base time, which is in the first
   * array element.
   * @param {number} since optional param giving start of logs as a ms datime
   * @protected
   */
  getSerialisableLog(since) {
    if (this.history)
      return this.history.encodeTrace(since);
    return Promise.resolve();
  }

  /**
   * Set a handler to be invoked if there's a problem requiring
   * an admin alert
   * @param {function} func alert handler function
   */
  setAlertHandler(func) {
    this.alertHandler = func;
  }

  /**
   * Return a promise to start polling thermometers
   * Thermostats are polled every <poll interval> seconds for
   * new values; results are cached in the Thermostat object.
   * @return {Promise} The promise resolves to the Thermostat.
   */
  poll() {
    delete this.pollTimer;
    return this.sensor.getTemperature()
    .then(temp => {
      trace(`${this.id} now ${temp}`);
      this.temperature = temp;
      this.lastKnownGood = Date.now();
      this.alerted = false;
      return this;
    })

    // If we didn't get a useable reading, use the last
    // temperature returned. Log how long it's been since we
    // last got a known-good reading.
    .catch(e => {
      let waiting = Date.now() - this.lastKnownGood;
      let mess = `${this.name} sensor ${this.id} has had no reading for ${Time.formatDelta(waiting)}`;
      console.error(mess, e);
      if (this.alerted || waiting < NO_RESPONSE_ALARM)
        return this;
      if (typeof this.alertHandler === "function")
        this.alertHandler(mess);
      this.alerted = true;
      return this;
    })

    .finally(() => {
      if (this.interrupted) {
        trace(`'${this.name}' interrupted`);
        this.interrupted = false;
        return;
      }
      this.pollTimer = startTimer(
        `poll${this.name}`,
        () => this.poll(),
        1000 * (this.poll_every || DEFAULT_POLL_INTERVAL));
    });
  };

  /**
   * Interrupt the temperature polling
   */
  stop() {
    if (this.pollTimer) {
      trace(`'${this.name}' interrupted ${this.pollTimer}`);
      cancelTimer(this.pollTimer);
      delete this.pollTimer;
    }
    if (this.history)
      this.history.stop();
  }

  /**
   * Get the target temperature specified by the timeline or active boost
   * or off request for this thermostat at the current time.
   * @return {number} the target temperature
   */
  getTargetTemperature() {
    this.purgeRequests();
    if (this.requests.length > 0) {
      for (let i = this.requests.length - 1; i >= 0; i--) {
        if (this.requests[i].until === Request.BOOST)
          // The current boost request
          return this.requests[i].temperature;
        if (this.requests[i].temperature === Request.OFF)
          // The current off request, BOOST overrides OFF
          return this.timeline.lowestValue;
			}
      // Otherwise the most recently-added request
      return this.requests[this.requests.length - 1].temperature;
    }
    let t;
    try {
      t = this.timeline.valueAtTime(Date.now() - Time.midnight());
    } catch (e) {
      trace("%o");
      if (typeof e.stack !== "undefined") trace("%O", e.stack);
      t = 0;
    }
    return t;
  };

  /**
   * Get the maximum temperature allowed by the timeline or active boost
   * requests for this thermostat at any time.
   * @return {number} the maximum temperature
   */
  getMaximumTemperature() {
    let max = this.timeline.highestValue;
    // If there's a promise to a higher temperature, honour it.
    if (this.requests.length > 0) {
      for (let i = this.requests.length - 1; i >= 0; i--)
        if (this.requests[i].temperature > max)
          max = this.requests[i].temperature;
    }
    return max;
  };

  /**
   * Add a request. A request is an override for rules that
   * suspends the normal rules either for a period of time
   * ('until' is a number), or until the rules purge the
   * request. A controller may have multiple requests, but only
   * one request from each source is kept.  When it adds a
   * request it purges all existing requests from the same
   * source before adding the new request. Where multiple
   * sources have active requests on the same thermostat, then
   * simple rules decide which request wins.
   * @param {Request} req request
   */
  addRequest(req) {
    this.purgeRequests({
      source: req.source
    }, true);

    trace(`Add request ${this.name} `, req);
    this.requests.push(req);
  };

  /**
   * Purge requests that have timed out, or are force-purged by matching
   * the parameters.
   * @param {object?} match map of request fields to match
   * e.g. { source: id }
   * All fields must match
   * @param {boolean?} clear true if requests are to be deleted
   * even if their targets have not yet been achieved
   */
  purgeRequests(match, clear) {
    if (match)
      trace(`Purge ${this.name} `, match, clear ? "clear" : "");
    match = match || {};
    const reqs = this.requests;
    for (let i = 0; i < reqs.length; i++) {
      let r = reqs[i];
      let matched = true;
      for (let k in match) {
        if (r[k] !== match[k]) {
          matched = false; // all fields must match
          break;
        }
      }
      if (matched) {
        let purge = clear;
        if (!purge && r.until === Request.BOOST) {
          if (this.temperature >= r.temperature) {
            purge = true;
            trace(`Purge because boost ${this.temperature} over ${r.temperature}`);
          }
        } else if (!purge && r.until < Date.now()) {
          purge = true;
          trace("Purge because 'until' was in the past");
        }
        if (purge) {
          trace(`Purge ${this.name} request ${r}`);
          reqs.splice(i--, 1);
        }
      }
    }
  };
}

/**
 * Configuration model, for use with {@link DataModel}
 * @typedef Thermostat.Model
 * @property {String} id unique ID used to communicate with this thermostat
 * @property {Number} poll Polling frequency, in seconds
 * @property {Timeline} timeline Timeline
 * @property {Historian} history Logger
 */
Thermostat.Model = {
  $class: Thermostat,
  id: {
    $class: String,
    $doc: "unique ID used to communicate with this thermostat"
  },
  poll_every: {
    $class: Number,
    $doc: "Polling frequency, in seconds",
    $optional: true
  },
  timeline: extend({}, {
    $fileable: true,
    $doc: "Timeline (object or filename)"
  }, Timeline.Model),
  history: extend({
    $optional: true
  }, Historian.Model)
};

export { Thermostat }
