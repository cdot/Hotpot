/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Q = require("q");

const Utils = require("../common/Utils");
const Timeline = require("../common/Timeline");
const Historian = require("./Historian");

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
 * @param proto configuration for the thermostat - see
 * Thermostat.Model
 */
function Thermostat(proto, name) {
    "use strict";

    if (!ds18x20) {
        // Load the driver asynchronously
        ds18x20 = require("ds18x20");
        if (!ds18x20.isDriverLoaded()) {
            try {
                ds18x20.loadDriver();
            } catch (err) {
                Utils.ERROR(TAG, "Temperature sensor '",
                            name, "' driver not loaded: ", err.message);
                if (typeof HOTPOT_DEBUG !== "undefined")
                    ds18x20 = HOTPOT_DEBUG;
                else
                    throw err;
            }
        }
    }

    Utils.extend(this, proto);

    // Name of the thermostat e.g. "HW"
    this.name = name;

    // Last recorded temperature {float}
    this.temperature = 0;

    // Temperature history, sample on a time schedule
    var self = this;
    var hc = this.history;
    if (typeof hc !== "undefined") {
        if (typeof hc.interval === "undefined")
            hc.interval = 300; // 5 minutes
        hc.sample = function() {
            // Only log temperatures to one decimal place
            return Math.round(self.temperature * 10) / 10;
        };
    }

    if (typeof HOTPOT_DEBUG !== "undefined")
        HOTPOT_DEBUG.mapThermostat(this.id, name);
}

Thermostat.Model = {
    $class: Thermostat,
    id: {
        $class: String,
        $doc: "unique ID used to communicate with this thermostat"
    },
    timeline: Timeline.Model,
    history: Utils.extend({ $optional: true }, Historian.Model)
};

/**
 * Return a promise to intiialise the thermostat with a valid value read
 * from the probe
 */
Thermostat.prototype.initialise = function() {
    var self = this;

    return Q.Promise(function(resolve, reject) {
        ds18x20.get(self.id, function(err, temp) {
            if (err !== null) {
                Utils.ERROR(TAG, "d218x20 error: ", err);
                reject(err);
            } else {
                if (typeof temp !== "number")
                    // At least once this has been "boolean"!
                    reject("Unexpected result from ds18x20.get");
                self.temperature = temp;
                // Start the polling loop
                self.pollTemperature();
                // Start the historian
                if (self.history)
                    self.history.start(function() {
                        return self.temperature;
                    });
                Utils.TRACE(TAG, "'", self.name, "' intialised");
                resolve();
            }
        });
    });
};
module.exports = Thermostat;

/**
 * Generate and return a promise for a serialisable version of the state
 * of the object, suitable for use in an AJAX response.
 * @return {Promise} a promise
 * @protected
 */
Thermostat.prototype.getSerialisableState = function() {
    "use strict";
    var data = {
        temperature: this.temperature,
        target: this.getTargetTemperature()
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
 * @return {Promise} promise to get an array of alternating times and
 * temps. Times are all relative to a base time, which is in the first
 * array element.
 * @param since optional param giving start of logs as a ms datime
 * @protected
 */
Thermostat.prototype.getSerialisableLog = function(since) {
    "use strict";
    if (!this.history)
        return Q();
    return this.history.getSerialisableHistory(since);
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
            Utils.ERROR(TAG, "d218x20 error: ", err);
        } else {
            if (typeof temp === "number")
                // At least once this has been "boolean"!
                self.temperature = temp;
            setTimeout(function() {
                self.pollTemperature();
            }, typeof self.poll_interval === "undefined"
                       ? DEFAULT_POLL_INTERVAL
                       : self.poll_interval);
        }
    });
};

/**
 * Get the target temperature specified by the timeline for this thermostat
 * at the current time/
 */
Thermostat.prototype.getTargetTemperature = function() {
    return this.timeline.valueAtTime(Time.time_of_day());
};

/**
 * Get the maximum temperature allowed by the timeline for this thermostat
 * at any time.
 */
Thermostat.prototype.getMaximumTemperature = function() {
    return this.timeline.getMaxValue();
};
