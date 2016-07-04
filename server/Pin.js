/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

var fs = require("fs");

const TAG = "Pin";

// Base path of all GPIO operations
const GPIO_PATH = "/sys/class/gpio/";

// Paths to write to to export/unexport GPIO pins
const EXPORT_PATH = GPIO_PATH + "export";
const UNEXPORT_PATH = GPIO_PATH + "unexport";

/**
 * A Pin is the interface to a RPi GPIO pin.
 * @class
 * @param {string} name name of the pin e.g. HW
 * @param {Config} config configuration block for the pin. Only one field is used,
 * gpio (the number of the gpio pin)
 * @param {function} done callback invoked when pin is created
 * @protected
 */
function Pin(name, config, done) {
    "use strict";

    var self = this;

    /**
     * Name of the pin e.g. HW
     * @type {string}
     * @public
     */
    this.name = name;

    /** @property {integer} gpio gpio port */
    self.gpio = config.get("gpio");

    self.value_path = GPIO_PATH + "gpio" + self.gpio + "/value";

    console.TRACE(TAG, "'" + self.name +
                  "' construction starting on gpio " + self.gpio);

    var fallBackToDebug = function(err) {
        console.TRACE(TAG, self.name + " setup failed: "
                      + err + "; falling back to debug");
        self.debug = require("./TestSupport.js");
        done();
    };

    var setup = function(err) {
        if (err) {
            fallBackToDebug("Export was OK, but check failed: "
                            + err);
        } else {
            console.TRACE(TAG, "gpio " + self.gpio + " is ready");
            // This seems backwards, and runs counter to the documentation.
            // If we don't set the pin active_low, then writing a 1 to value
            // sets the pin low, and vice-versa. Ho hum.
            self.setFeature(
                "active_low", 1,
                function() {
                    self.set(0, function() {
                        self.setFeature(
                            "direction", "out", done);
                    });
                });
        }
    };

    var exported = function(err) {
        if (err) {
            fallBackToDebug(EXPORT_PATH + "=" + self.gpio + " failed " + err);
        } else {
            console.TRACE(TAG, "Exported gpio " + self.gpio + " OK");
            try {
                fs.readFile(self.value_path, setup);
            } catch (e) {
                fallBackToDebug(self.value_path + " threw: " + e.message);
            }
        }
    };

    var checked = function(err) {
        if (err) {
            console.TRACE(TAG, self.value_path + " failed: " + err);
            try {
                console.TRACE(EXPORT_PATH + "=" + self.gpio);
                fs.writeFile(EXPORT_PATH, self.gpio, exported);
            } catch (e) {
                fallBackToDebug("Export " + self.gpio + " failed " + e.message);
            }
        } else {
            console.TRACE(TAG, "Checked " + self.value_path + " OK");
            setup();
        }
    };

    try {
        console.TRACE(TAG, "'" + self.name + "' checking " + self.value_path);
	fs.readFile(self.value_path, checked);
    } catch (e1) {
        console.TRACE(TAG, self.value_path + " threw: " + e1.message);
        try {
            fs.writeFile(EXPORT_PATH, self.gpio, exported);
        } catch (e2) {
            fallBackToDebug(EXPORT_PATH + "=" + self.gpio + " threw: " + e2.message);
        }
    }
}
module.exports = Pin;

/**
 * Release all resources used by the pin
 * @protected
 */
Pin.prototype.DESTROY = function() {
    "use strict";

    console.TRACE(TAG, "Unexport gpio " + this.gpio);
    fs.writeFile(UNEXPORT_PATH, this.gpio, function() {});
};

/**
 * Set a feature of the controller e.g. direction, value
 * @private
 */
Pin.prototype.setFeature = function(feature, value, callback) {
    "use strict";

    var path = GPIO_PATH + "gpio" + this.gpio + "/" + feature;

    if (typeof callback === "undefined")
        callback = function() {};
    if (typeof this.debug !== "undefined") {
        console.TRACE(TAG, this.name + " " + path + " = " + value);
        if (callback)
            callback.call(this);
    } else
        fs.writeFile(path, value, callback);
};

/**
 * Set the pin state. Don't use this on a Y-plan system, use
 * {@link Controller.Controller#setPin|Controller.setPin} instead.
 * @param {integer} state of the pin
 * @param {function} callback called when state has been set
 * @public
 */
Pin.prototype.set = function(state, callback) {
    "use strict";

    console.TRACE(TAG, this.name + " set gpio "
                  + this.gpio + " = " + (state === 1 ? "ON" : "OFF"));

    if (typeof this.debug !== "undefined")
        this.debug.pinstate[this.name] = state;
    this.setFeature("value", state, callback);
};

/**
 * Get the pin state
 * @return pin state {integer}
 * @public
 */
Pin.prototype.getState = function() {
    "use strict";
    if (typeof this.debug !== "undefined")
        return this.debug.pinstate[this.name];
    else
        return parseInt(fs.readFileSync(this.value_path, "utf8"));
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 * @protected
 */
Pin.prototype.getSerialisableConfig = function() {
    "use strict";
    return {
        gpio: this.gpio
    };
};


/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 * @protected
 */
Pin.prototype.getSerialisableState = function() {
    "use strict";
    return {
        state: this.getState()
    };
};
