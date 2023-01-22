/*@preserve Copyright (C) 2016-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import { promises as Fs } from "fs";
import { Utils } from "../common/Utils.js";
import { TimeValue } from "../common/TimeValue.js";

const TAG = "Historian";

/**
 * Logger. Can either log according to a time interval using a sampling
 * callback, or only on demand.
 * @param {string} name identifier
 * @param {object} proto see Historian.Model
 * @class
 */
class Historian {

  /**
   * @param {object} proto data block with initial fields
   * @param {string} name name of the historian
   */
  constructor(proto, name) {
    Utils.extend(this, proto);

    this.name = name;

    this.timeout = null;
    Utils.TRACE(TAG, "for ", name, " in ", this.path());
  }

  /**
   * Get the file name with environment variables expanded
   * @return {string} file name
   */
  path() {
    return Utils.expandEnvVars(this.file);
  }

  /**
   * Return a promise to rewrite the history file with the given data
   * @private
   */
  _rewriteFile(report) {
    let s = "";
    for (let i = 0; i < report.length; i++)
      s += `${report[i].time},${report[i].value}\n`;
    return Fs.writeFile(this.path(), s)
    .then(() => {
      Utils.TRACE(TAG, "Wrote ", this.path());
    });
  };

  /**
   * Load history from the data file
   * @private
   */
  _loadFromFile() {
    return Fs.readFile(this.path())
    .then(data => {
      let lines = data.toString().split("\n");
      let report = [];
      let i;

      // Load report
      for (i in lines) {
        let csv = lines[i].split(",", 2);
        if (csv.length === 2) {
          report.push(new TimeValue(
            parseFloat(csv[0]),
            parseFloat(csv[1])
          ));
        }
      }
      if (this.unordered && report.length > 1) {
        // Sort samples by time. If two samples occur at the same
        // time, keep the most recently added.
        let doomed = report;
        report = [];
        for (i = 0; i < doomed.length; i++)
          doomed[i].index = i;
        doomed.sort((a, b) => {
          if (a.time < b.time)
            return -1;
          if (a.time > b.time)
            return 1;
          if (a.index < b.index)
            a.dead = true;
          else
            b.dead = true;
          return 0;
        });
        for (i = 0; i < doomed.length; i++) {
          if (!doomed[i].dead)
            report.push(new TimeValue(
              doomed[i].time, doomed[i].value));
        }
        if (report.length !== doomed.length)
          this._rewriteFile(report);
      }

      return report;
    })
    .catch(e => {
      Utils.TRACE(TAG, "Failed to open history ", e);
      return [];
    });
  };

  /**
   * Get a promise for a serialisable 1D array for the history.
   * @param {number} since earliest datime we are interested
   * in, ignore samples before this.
   * @return {Promise} resolves to an array. First element is
   * the base time in epoch ms, subsequent elements are
   * alternating delta times (relative to basetime, in ms) and
	 * sample values.
   */
  encodeTrace(since) {
    return this._loadFromFile()
    .then(trace => TimeValue.encodeTrace(trace, since));
  };

  /**
   * Start the history polling loop.
   * Records are written according to the interval set in the config.
   * Requires the `interval` option to be given.
   * @param {function} sample sampling function - required
   */
  start(sample) {

    if (typeof sample !== "function")
      throw Utils.exception(TAG, "Cannot start; sample not a function");
    this.sampler = sample;

    if (typeof this.interval === "undefined")
      throw Utils.exception(TAG, "Cannot start; interval not defined");
    this.timeout = Utils.startTimer(
      `hist${this.name}`, () => this._poll(), 100);
  }

  /**
   * Woken on each poll
   * @private
   */
  _poll() {
    let datum = this.sampler();

    let p;
    // Don't record repeat of same sample
    if (typeof datum === "number" && datum !== this.last_sample)
      p = this.record(datum);
    else
      p = Promise.resolve();

    p.then(() => {
      if (this.timeout) {
        // Existance of a timer indicates we must continue
        // to poll
        this.timeout = Utils.startTimer(
          `hist${this.name}`, () => this._poll(), this.interval);
      }
    });
  }

  /**
   * Stop the polling loop
   */
  stop() {
    if (this.timeout) {
      Utils.cancelTimer(this.timeout);
      this.timeout = null;
      Utils.TRACE(TAG, this.name, " stopped");
    }
  };

  /**
   * Get a promise to record a sample in the log.
   * @param {number} sample the data to record
   * @param {int} time (optional) time in ms to force into the record
   * @return {Promise} resolves when the sample has been appended
   * @public
   */
  record(sample, time) {

    if (typeof time === "undefined")
      time = Date.now();

    let line = "";

    // If we've skipped recording an interval since the last
    // recorded sample, pop in a checkpoint
    if (typeof this.last_time !== "undefined" &&
        time > this.last_time + 5 * this.interval / 4)
      line = `${time - this.interval},${this.last_sample}\n`;

    line += `${time},${sample}\n`;
    this.last_time = time;
    this.last_sample = sample;

    return Fs.appendFile(this.path(), line)
    .catch(ferr => {
      Utils.TRACE(TAG, `failed to append to '${this.path()}': `, ferr);
    });
  };
}

/**
 * Configuration model, for use with {@link DataModel}
 * @typedef Historian.Model
 * @property {Strin} file Full path to the log file
 * @property {Boolean} unordered Set if sample events may be added out of order"
 * @property {Number} interval Sample frequency in ms, required if `start()` is called
 */
Historian.Model = {
  $class: Historian,
  file: {
    $doc: "Full path to the log file",
    $class: String
  },
  unordered: {
    $doc: "Set if sample events may be added out of order",
    $optional: true,
    $class: Boolean
  },
  interval: {
    $doc: "Sample frequency in ms, required if `start()` is called",
    $optional: true,
    $class: Number
  }
};

export { Historian }
