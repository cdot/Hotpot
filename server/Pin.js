/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

const Fs = require("fs");
const Promise = require("promise");
const readFile = Promise.denodeify(Fs.readFile);
const writeFile = Promise.denodeify(Fs.writeFile);

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
    
    function fallBackToDebug(err) {
        console.TRACE(TAG, self.name + " setup failed: "
                      + err + "; falling back to debug");
        self.debug = require("./TestSupport.js");
        done();
    }

    function setup() {
        console.TRACE(TAG, self.name + " gpio " + self.gpio + " is ready");
        // This seems backwards, and runs counter to the documentation.
        // If we don't set the pin active_low, then writing a 1 to value
        // sets the pin low, and vice-versa. Ho hum.
        self.setFeature(
            "active_low", 1,
            function() {
                self.set(0)
                    .then(function() {
                        self.setFeature(
                            "direction", "out")
                            .then(done)
                            .catch(function(e) {
                                fallBackToDebug("set direction: " + e);
                            });
                    })
                    .catch(function(e) {
                        fallBackToDebug("set: " + e);
                    });
            });
    }

    function exportPin() {
        writeFile(EXPORT_PATH, self.gpio, "utf8")
            .then(function() {
                console.TRACE(TAG, EXPORTPATH + "=" + self.gpio + " OK");
                readCheck(2);
            })
            .catch(function(err) {
                fallBackToDebug(EXPORT_PATH + "=" + self.gpio
                                + " failed " + err);
            });
    }

    function writeCheck(num) {
        writeFile(self.value_path, 0, "utf8")
            .then(function() {
                console.TRACE(TAG, self.value_path + " writeCheck "
                              + num + " OK");
                setup();
            })
            .catch(function(e) {
                fallBackToDebug(
                    self.value_path + " writeCheck "
                        + num + " failed: " + e);
            });
    }

    function readCheck(num) {
        readFile(self.value_path, "utf8")
            .then(function() {
                console.TRACE(TAG, self.value_path + " readCheck "
                              + num + " OK");
                writeCheck(num);
            })
            .catch(function(e) {
                var m = self.value_path + " readCheck "
                    + num + " failed: " + e;
                if (num === 1) {
                    exportPin();
                } else {
                    fallBackToDebug(m);
                }
            });
    }

    readCheck(1);
}
module.exports = Pin;

/**
 * Release all resources used by the pin
 * @protected
 */
Pin.prototype.DESTROY = function() {
    "use strict";

    console.TRACE(TAG, "Unexport gpio " + this.gpio);
    writeFile(UNEXPORT_PATH, this.gpio, "utf8");
};

/**
 * Set a feature of the controller e.g. direction, value
 * @param {function} callback called when state has been set.
 * callback(err), this is the Pin object.
 * @private
 */
Pin.prototype.setFeature = function(feature, value) {
    "use strict";

    var self = this;
    var path = GPIO_PATH + "gpio" + self.gpio + "/" + feature;

    return new Promise(function(fulfill, reject) {
        if (typeof self.debug !== "undefined") {
            console.TRACE(TAG, self.name + " " + path + " = " + value);
            fulfill();
        } else {
            writeFile(path, value, "utf8")
                .then(fulfill)
                .catch(function(err) {
                    console.TRACE(TAG, "failed to write " + path + ": " + err);
                    reject(err);
                });
        }
    });
};

/**
 * Set the pin state. Don't use this on a Y-plan system, use
 * {@link Controller.Controller#setPin|Controller.setPin} instead.
 * @param {integer} state of the pin
 * @return a Promise
 * @public
 */
Pin.prototype.set = function(state) {
    "use strict";

    console.TRACE(TAG, this.name + " set gpio "
                  + this.gpio + " = " + (state === 1 ? "ON" : "OFF"));

    if (typeof this.debug !== "undefined")
        this.debug.pinstate[this.name] = state;
    return this.setFeature("value", state);
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
        return parseInt(Fs.readFileSync(this.value_path, "utf8"));
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
