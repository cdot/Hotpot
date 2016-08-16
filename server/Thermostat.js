/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Q = require("q");

const Historian = require("./Historian.js");

const TAG = "Thermostat";

// Default interval between polls
const DEFAULT_POLL_INTERVAL = 1; // seconds

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
                console.ERROR(TAG, "Temperature sensor '"
                              + name + "' driver not loaded: "
                              + err.message);
                if (typeof HOTPOT_DEBUG !== "undefined")
                    ds18x20 = HOTPOT_DEBUG;
                else
                    throw err;
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
     * Temperature history, sample on a time schedule
     */
    var hc = config.get("history");
    var self = this;
    if (typeof hc !== "undefined") {
        if (typeof hc.interval == "undefined")
            hc.interval = 300; // 5 minutes
        this.historian = new Historian({
            name: self.name,
            file: hc.file,
            interval: hc.interval,
            max_samples: hc.max_samples,
            max_bytes: hc.max_bytes,
            sample: function() {
                // Only log temperatures to one decimal place
                return Math.round(self.temperature * 10) / 10;
            }
        });
    }

    /** @private */
    this.id = config.get("id"); // DS18x20 device ID

    if (typeof HOTPOT_DEBUG !== "undefined")
        HOTPOT_DEBUG.mapThermostat(config.get("id"), name);

    this.pollTemperature();
    if (this.historian)
        this.historian.start();
    console.TRACE(TAG, "'", this.name, "' constructed");
}
module.exports = Thermostat;

/**
 * Generate and return a serialisable version of the configuration, suitable
 * for use in an AJAX response and for storing in a file.
 * @param {boolean} ajax set true if this config is for AJAX
 * @return {object} a serialisable structure
 * @protected
 */
Thermostat.prototype.getSerialisableConfig = function(ajax) {
    "use strict";

    return {
        id: this.id,
        history: this.history_config
    };
};

/**
 * Generate and return a promise for a serialisable version of the state
 * of the object, suitable for use in an AJAX response.
 * @return {Promise} a promise
 * @protected
 */
Thermostat.prototype.getSerialisableState = function() {
    "use strict";
    var data = {
        temperature: this.temperature
    };
    return Q.fcall(function() {
        return data;
    });
};

/**
 * Synchronously get the temperature history of the thermostat as a
 * serialisable structure. Note that the history is sampled at intervals,
 * but not every sample time will have a event. The history is only
 * updated if the temperature changes.
 * @return {object} array of alternating times and temps. Times are all
 * relative to a base time, which is in the first array element.
 * @protected
 */
Thermostat.prototype.getSerialisableLog = function() {
    "use strict";
    if (!this.historian)
        return Q();
    return this.historian.getSerialisableHistory();
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
            console.ERROR(TAG, "d218x20 error: " + err);
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
