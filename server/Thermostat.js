/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const fs = require("fs");
const Time = require("../common/Time.js");
const Utils = require("../common/Utils.js");

const TAG = "Thermostat";

// Default interval between polls
const DEFAULT_POLL_INTERVAL = 1; // seconds

// Default history interval - once a minute
const DEFAULT_HISTORY_INTERVAL = 60; // seconds
// Default history limit - 24 hours, at one sample per minute
const DEFAULT_HISTORY_LIMIT = 24 * 60;

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

/**
 * Synchronously get the temperature history of the thermostat as a
 * serialisable structure. Note that the history is sampled at intervals,
 * but not every sample time will have a event. The history is only
 * updated if the temperature changes.
 * @return {object} structure containing log data. basetime is an offset for
 * all times in the data; data is an array of alternating times and temps.
 * @protected
 */
Thermostat.prototype.getSerialisableLog = function() {
    "use strict";
    if (typeof this.history === "undefined")
        return null;
    var fn = Utils.expandEnvVars(this.history_config.file);
    var data = fs.readFileSync(fn).toString();    
    data = "report=[" + data.substring(0, data.length - 1) + "]";
    var report;
    eval(data);
    var res = [];
    var basetime;
    for (var i in report) {
        if (typeof basetime === "undefined")
            basetime = report[i][0];
        res.push(report[i][0] - basetime);
        res.push(report[i][1]);
    }
    return {
        basetime: basetime,
        data: res
    };
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
    var fn = Utils.expandEnvVars(this.history_config.file);

    function written(err) {
        if (err)
            console.error(TAG + " failed to write history file '"
                          + fn + "': " + err);
    }

    function update(err, data) {
        if (err) {
            console.error(TAG + " failed to read history file '"
                          + fn + "': " + err);
            update();
        }
        var report;
        if (typeof data === "undefined")
            report = [];
        else
            eval("report=" + data);
        var t = parseFloat(self.temperature.toPrecision(3));
        if (report.length > 0) {
            var last = report[report.length - 1];
            if (last[1] === t)
                return;
        }
        while (report.length > self.history_config.limit - 1)
            report.shift();
        report.push([Mathi.round(Time.now() / 1000), t]);
        var s = JSON.stringify(report);
        fs.writeFile(fn,
                     s.substring(1, s.length - 1) + ",",
                     written);
    }

    if (typeof self.temperature === "number") {
        fs.stat(
            fn,
            function(err, stats) {
                if (err)
                    console.TRACE(TAG, "Failed to stat history file '"
                                  + fn + "': " + err);
                if (stats && stats.isFile()) {
                    // If we hit 2 * the size limit, open the file and
                    // reduce the size. Each sample is about 25 bytes.
                    var maxbytes = 1.5 * self.history_config.limit * 25;
                    var t = self.temperature.toPrecision(3);
                    if (stats.length > maxbytes * 1.5)
                        fs.readFile(fn, update);
                    else
                        // otherwise open for append
                        fs.appendFile(
                            fn,
                            "[" + Math.round(new Date().getTime() / 1000)
                                + "," + t + "],",
                            function(ferr) {
                                if (ferr)
                                    console.error(
                                        TAG + " failed to append to  history file '"
                                            + fn + "': "
                                            + ferr);
                            });
                } else
                    update();
            });
    }

    setTimeout(function() {
        self.pollHistory();
    }, self.history_config.interval * 1000);

};
