/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

const TAG = "Thermostat";

// Polling frequency
const POLL_INTERVAL = 1000; // milliseconds

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

    var self = this;

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

    /** @private */
    this.id = config.get("id"); // DS18x20 device ID

    if (typeof ds18x20.mapID !== "undefined")
        ds18x20.mapID(config.get("id"), name);

    console.TRACE(TAG, "'" + self.name + "' constructed");

    // Don't start polling until after the first timeout event because otherwise
    // the event emitter won't work
    setTimeout(function() {
        console.TRACE(TAG, "'" + self.name + "' started");
        self.poll();
    }, 10);
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
 * Function for polling thermometers
 * Thermostats are polled every second for new values; results are returned
 * asynchronously and cached in the Thermostat object
 * @private
 */
Thermostat.prototype.poll = function() {
    "use strict";

    var self = this;
    ds18x20.get(this.id, function(err, temp) {
        if (err !== null) {
            console.error("ERROR: " + err);
        } else {
            self.temperature = temp;

            setTimeout(function() {
                self.poll();
            }, POLL_INTERVAL);
        }
    });
};
