/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
var fs = require("fs");

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

    console.TRACE(TAG, "'" + this.name + "' constructed");

    this.pollTemperature();
    if (typeof this.history_config !== "undefined")
        this.pollHistory();
}
module.exports = Thermostat;

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 * @protected
 */
Thermostat.prototype.getSerialisableConfig = function() {
    "use strict";

    return {
        id: this.id
    };
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
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
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 * @protected
 */
Thermostat.prototype.getSerialisableLog = function() {
    "use strict";
    return this.getHistory();
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
            self.temperature = temp;
            setTimeout(function() {
                self.pollTemperature();
            }, self.poll_interval);
        }
    });
};

/**
 * Function for keeping temperature records
 * Records are written every minute
 * @private
 */
Thermostat.prototype.pollHistory = function() {
    "use strict";

    var self = this;

    var written = function(err) {
        if (err)
            console.error(TAG + " failed to write history file '"
                          + self.history_config.file + "': " + err);
    };

    var update = function(err, data) {
        if (err) {
            console.error(TAG + " failed to read history file '"
                          + self.history_config.file + "': " + err);
            update();
        }
        var report = (typeof data === "undefined") ? []
            : data.toString().split("\n");
        var t = self.temperature.toPrecision(5);
        if (report.length > 0) {
            var last = report[report.length - 1].split(",");
            if (parseFloat(last[1]) === t)
                return;
        }
        while (report.length > self.history_config.limit - 1)
            report.shift();
        report.push(new Date().getTime() + "," + t);
        fs.writeFile(self.history_config.file, report.join("\n"),
                     written);
    };

    fs.stat(
        self.history_config.file,
        function(err, stats) {
            if (err)
                console.error(TAG + " failed to stat history file '"
                              + self.history_config.file + "': " + err);
            if (stats && stats.isFile()) {
                // If we hit 2 * the size limit, open the file and
                // reduce the size. Each sample is about 25 bytes.
                var maxbytes = 1.5 * self.history_config.limit * 25;
                if (stats.size() > maxbytes * 1.5)
                    fs.readFile(self.history_config.file, update);
                else
                    // otherwise open for append
                    fs.appendFile(
                        self.history_config.file,
                        new Date().getTime() + "," + t,
                        function(err) {
                            console.error(
                                TAG + " failed to append to  history file '"
                                    + self.history_config.file + "': " + err);
                        });
            } else
                update();
        });
    setTimeout(function() {
        self.pollHistory();
    }, self.history_config.interval * 1000);

};

/**
 * Synchornously get the temperature history of the thermostat. Note that
 * the history is sampled at intervals, but not every sample time will
 * have a event. The history is only updated if the temperature changes.
 * @return {object} serialisable array of events, each with fields
 * time and temperature
 */
Thermostat.prototype.getHistory = function() {
    "use strict";
    if (typeof this.history === "undefined")
        return null;

    var data = fs.readFileSync(this.history_config.file).toString();
    var report = data.split("\n");
    for (var i in report) {
        var l = report[i].split(",");
        report[i] = { time: parseFloat(l[0]), temperature: parseFloat(l[1]) };
    }
    return report;
};
