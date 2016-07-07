/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const fs = require("fs");
const Time = require("../common/Time.js");
const Utils = require("../common/Utils.js");
const promise = require("promise");
const readFile = promise.denodeify(fs.readFile);
const writeFile = promise.denodeify(fs.writeFile);
const statFile = promise.denodeify(fs.stat);
const appendFile = promise.denodeify(fs.appendFile);

const TAG = "Thermostat";

// Default interval between polls
const DEFAULT_POLL_INTERVAL = 1; // seconds

// Default history interval - once a minute
const DEFAULT_HISTORY_INTERVAL = 60; // seconds
// Default history limit - number of seconds to store history for
const DEFAULT_HISTORY_LIMIT = 24 * 60 * 60;

// Singleton driver interface to DS18x20 thermometers
var ds18x20;

/**
 * Interface to a DS18x20 thermostat. This object takes care of polling the
 * device for regular temperature updates that can then be read from the
 * object.
 * @class
 * @param name {String} name by which the caller identifies the thermostat
 * @param config configuration for the pin, a Config object
 * @protected
 */
function Thermostat(name, config) {
    "use strict";

    if (!ds18x20) {
        // Load the driver asynchronously
        ds18x20 = require("ds18x20");
        if (!ds18x20.isDriverLoaded()) {
            try {
                ds18x20.loadDriver();
            } catch (err) {
                console.error(err.message);
                console.error("Temperature sensor driver not loaded - falling back to test sensor");
                ds18x20 = require("./TestSupport.js");
            }
        }
    }

    this.poll_interval = config.get("poll_interval");
    if (typeof this.poll_interval === "undefined")
        this.poll_interval = DEFAULT_POLL_INTERVAL;
   
    /**
     * Name of the thermostat e.g. "HW"
     * @type {string}
     * @public
     */
    this.name = name;

    /**
     * Last recorded temperature
     * @type {float}
     * @public
     */
    this.temperature = null;

    this.basetime = Math.floor(Time.nowSeconds());

    /**
     * Temperature history
     */
    var hc = config.get("history");
    if (typeof hc !== "undefined") {
        this.history_config = hc;
        if (typeof hc.interval === "undefined")
            hc.interval = DEFAULT_HISTORY_INTERVAL;
        if (typeof hc.limit === "undefined")
            hc.limit = DEFAULT_HISTORY_LIMIT;
        this.history = [];
    }

    /** @private */
    this.id = config.get("id"); // DS18x20 device ID

    if (typeof ds18x20.mapID !== "undefined")
        ds18x20.mapID(config.get("id"), name);

    this.pollTemperature();
    if (typeof this.history_config !== "undefined")
        this.pollHistory();
    console.TRACE(TAG, "'" + this.name + "' constructed");
}
module.exports = Thermostat;

/**
 * Generate and return a serialisable version of the configuration, suitable
 * for use in an AJAX response and for storing in a file.
 * @return {object} a serialisable structure
 * @protected
 */
Thermostat.prototype.getSerialisableConfig = function() {
    "use strict";

    return {
        id: this.id,
        basetime: this.basetime,
        history: this.history_config
    };
};

/**
 * Generate and return a serialisable version of the state of the object,
 * suitable for use in an AJAX response.
 * @return {object} a serialisable structure
 * @protected
 */
Thermostat.prototype.getSerialisableState = function() {
    "use strict";
    return {
        temperature: this.temperature
    };
};

Thermostat.prototype.loadHistory = function(data) {
    if (typeof data === "undefined") {
        var fn = Utils.expandEnvVars(this.history_config.file);
        data = fs.readFileSync(fn);
    }
    var lines = data.toString().split("\n");
    var basetime = this.basetime;
    var cutoff = Time.nowSeconds() - this.history_config.limit;
    var report = [];
    var p0;

    // Load report, discarding points that are before the cutoff
    for (var i in lines) {
        var point = lines[i].split(",");
        if (point.length === 1) // basetime
            basetime = parseFloat(point[0]);
        else if (point.length === 2) {
            point[0] = basetime + parseFloat(point[0]);
            point[1] = parseFloat(point[1]);
            if (point[0] < cutoff)
                p0 = point;
            else {
                if (p0 && p0[0] < point[0]) {
                    // Interpolate a point at the cutoff
                    report.push([
                        cutoff,
                        (point[0] - cutoff) /
                            (point[0] - p0[0]) * (point[1] - p0[1]) + p0[1]
                    ]);
                    p0 = null;
                }
                report.push(point);
            }
        } else
            throw "Corrupt history at line " + i;
    }
    return report;
};

/**
 * Synchronously get the temperature history of the thermostat as a
 * serialisable structure. Note that the history is sampled at intervals,
 * but not every sample time will have a event. The history is only
 * updated if the temperature changes.
 * @return {object} array of alternating times and temps. Times are all
 * relative to basetime.
 * @protected
 */
Thermostat.prototype.getSerialisableLog = function() {
    "use strict";
    if (typeof this.history === "undefined")
        return null;
    var report = this.loadHistory();
    var res = [ this.basetime ];
    for (var i in report) {
        res.push(report[i][0] - this.basetime);
        res.push(report[i][1]);
    }
    return res;
};

/**
 * Function for polling thermometers
 * Thermostats are polled every second for new values; results are returned
 * asynchronously and cached in the Thermostat object
 * @private
 */
Thermostat.prototype.pollTemperature = function() {
    "use strict";

    var self = this;

    ds18x20.get(this.id, function(err, temp) {
        if (err !== null) {
            console.error("ERROR: " + err);
        } else {
            if (typeof temp === "number")
                // At least once this has been "boolean"!
                self.temperature = temp;
            setTimeout(function() {
                self.pollTemperature();
            }, self.poll_interval);
        }
    });
};

/**
 * Function for keeping temperature records
 * Records are written every minute or so (set in config)
 * @private
 */
Thermostat.prototype.pollHistory = function() {
    "use strict";

    var self = this;
    var t = Math.round(self.temperature / 10) * 10;

    var fn = Utils.expandEnvVars(this.history_config.file);

    function rewriteHistory(data) {
        var report = (typeof data === "undefined")
            ? [] : self.loadHistory(data);
        var s = self.basetime + "\n";
        for (var i in report)
            s += (report[i][0] - self.basetime) + "," + report[i][1] + "\n";
        writeFile(fn, s)
            .then(repoll,
                  function(err) {
                      console.error(TAG + " failed to write history file '"
                                    + fn + "': " + err);
                      repoll();
                  });
    }

    function repoll() {
        setTimeout(function() {
            self.pollHistory();
        }, self.history_config.interval * 1000);
    }

    if (typeof self.temperature !== "number") {
        repoll();
        return;
    }

/*    if (t === self.last_recorded_temp) {
        repoll();
        return;
    }
*/
    console.TRACE(TAG + "History", "Add " + t + " to "
                  + this.name + " history");
    self.last_recorded_temp = t;

    statFile(fn).then(
        function(stats) {
            // If we hit 2 * the size limit, open the file and
            // reduce the size. Each sample is about 15 bytes.
            var maxbytes =
                2 * (self.history_config.limit
                       / self.history_config.interval) * 15;
            if (stats.size > maxbytes) {
                console.TRACE(TAG, self.name + " history is full");
                readFile(fn)
                    .then(
                        function(data) {
                            rewriteHistory(data);
                        },
                        function(err) {
                            console.error(
                                TAG + " failed to read history file '"
                                    + fn + "': " + err);
                            repoll();
                        });
                return;
            }
            // otherwise simply append
            appendFile(
                fn,
                Math.round(Time.nowSeconds() - self.basetime)
                    + "," + t + "\n")
                .then(
                    repoll,
                    function(ferr) {
                        console.error(
                            TAG + " failed to append to  history file '"
                                + fn + "': "
                                + ferr);
                        repoll();
                    });
        },
        function(err) {
            console.TRACE(TAG, "Failed to stat history file '"
                          + fn + "': " + err);
            // Probably the first time; write the whole history file
            rewriteHistory(undefined);
        });
};
