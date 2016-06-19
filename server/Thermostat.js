/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Talk to a DS18x20 thermometer.
 *
 * Thermostats are polled every second for new values; results are returned
 * asyncrhonously and cached in the Thermostat object
 */

const TAG = "Thermostat";

// Polling frequency
const POLL_INTERVAL = 1000; // milliseconds

// Singleton driver interface to DS18x20 thermometers
var ds18x20;

/**
 * Construct a thermostat
 * @param name {String} name by which the caller identifies the thermostat
 * @param config configuration for the pin, a Config object
 * @class
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
    self.name = name;
    self.id = config.get("id"); // DS18x20 device ID

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
 * Release all resources used by the object
 */
Thermostat.prototype.DESTROY = function() {
    "use strict";
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
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
 */
Thermostat.prototype.getSerialisableState = function() {
    "use strict";
    return {
        temperature: this.temperature
    };
};

/**
 * Function for polling thermometers
 * @private
 */
Thermostat.prototype.poll = function() {
    "use strict";

    var self = this;
    ds18x20.get(this.id, function(err, temp) {
        var i;
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
