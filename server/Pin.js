/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

var Fs = require("fs");

/**
 * GPIO pin
 */

/**
 * Constructor
 * @param name name of the pin e.g. HW
 * @param config configuration block for the pin. Only one field is used,
 * gpio (the number of the gpio pin)
 * @param done callback invoked when pin is created
 */
function Pin(name, config, done) {
    "use strict";

    var self = this;

    self.name = name;
    self.gpio = config.gpio;
    self.last_changed_by = "init";

    console.TRACE("pin " + self.name,
                  "Creating controller for gpio " + self.gpio);

    var fallBackToDebug = function(err) {
        console.TRACE("pin " + self.name, "GPIO " + self.gpio
                      + " setup failed: " + err + "; falling back to debug");
        self.debug = require("./TestSupport.js");
        done();
    };

    var setup = function(err) {
        if (err) {
            fallBackToDebug("/export was OK, but check /value faile: "
                            + err);
        } else {
            // This seems backwards, and runs counter to the documentation.
            // If we don't set the pin active_low, then writing a 1 to value
            // sets the pin low, and vice-versa. Ho hum.
            self.setFeature(
                "active_low", 1,
                function() {
                    self.set(0, "init", function() {
                        self.setFeature(
                            "direction", "out", done);
                    });
                });
        }
    };

    var exported = function(err) {
        if (err) {
            fallBackToDebug("/export failed " + err);
        } else {
            try {
                Fs.readFile(
                    "/sys/class/gpio/gpio" + self.gpio + "/value",
                    setup);
            } catch (e) {
                fallBackToDebug("/export was OK, but check /value threw: "
                                + e.message);
            }
        }
    };

    var checked = function(err) {
        if (err) {
            console.TRACE("pin " + self.name, "/value failed: " + err
                          + ", exporting gpio " + self.gpio);
            try {
                Fs.writeFile("/sys/class/gpio/export",
                             self.gpio,
                             exported);
            } catch (e) {
                fallBackToDebug("Export failed " + e.message);
            }
        } else
            setup();
    };

    try {
	Fs.readFile(
            "/sys/class/gpio/gpio" + self.gpio + "/value",
            checked);
    } catch (e1) {
        console.TRACE("pin " + self.name, "/value threw: " + e1.message
                      + ", exporting gpio " + self.gpio);
        try {
            Fs.writeFile("/sys/class/gpio/export",
                         self.gpio,
                         exported);
        } catch (e2) {
            fallBackToDebug("/export threw: " + e2.message);
        }
    }
}
module.exports = Pin;

/**
 * Release all resources used by the pin
 */
Pin.prototype.DESTROY = function() {
    "use strict";

    console.TRACE("pin", "unexport gpio " + this.gpio);
    Fs.writeFile("/sys/class/gpio/unexport", this.gpio, function() {});
};

/**
 * Set a feature of the controller e.g. direction, value
 * @private
 */
Pin.prototype.setFeature = function(feature, value, callback) {
    "use strict";

    if (typeof callback === "undefined")
        callback = function() {};
    if (typeof this.debug !== "undefined") {
        console.TRACE("pin " + this.name,
                      "Set feature " + feature + " = " + value);
        if (callback)
            callback.call(this);
    } else
        Fs.writeFile("/sys/class/gpio/gpio" + this.gpio + "/" + feature,
                     value, callback);
};

/**
 * Set the pin state
 * @param state boolean
 * @param actor name of thing that caused the state to change
 * @param callback called when state has been set
 */
Pin.prototype.set = function(state, actor, callback) {
    "use strict";

    console.TRACE("pin " + this.name, actor + " set gpio "
                  + this.gpio + " = " + (state === 1 ? "ON" : "OFF"));

    this.actor = actor;
    if (typeof this.debug !== "undefined")
        this.debug.pinstate[this.name] = state;
    this.setFeature("value", state ? 1 : 0, callback);
};

/**
 * Get the pin state
 * @return pin state (boolean)
 */
Pin.prototype.get = function() {
    "use strict";
    if (typeof this.debug !== "undefined")
        return this.debug.pinstate[this.name];
    else
        return parseInt(Fs.readFileSync(
            "/sys/class/gpio/gpio" + this.gpio + "/value", "utf8")) === 1;
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return a serialisable structure
 */
Pin.prototype.serialisable = function() {
    "use strict";
    return {
        name: this.name,
        actor: this.actor,
        gpio: this.gpio,
        state: this.get()
    };
};
