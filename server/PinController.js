/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

var Fs = require("fs");

/**
 * Control pins
 *
 * Writes to GPIO pins
 */

/**
 * Constructor
 * @param name name of the pin e.g. HW
 * @param config configuration block for the pin, as described in README.md
 */
function PinController(name, config) {
    "use strict";

    var self = this;
    var val;

    self.name = name;
    self.gpio = config.gpio;
    self.last_changed_by = "init";

    console.TRACE("pin " + this.name,
                  "Creating controller for gpio " + self.gpio);
    
    var init = function(err) {
        if (err) {
            console.TRACE("pin " + self.name, "GPIO " + self.gpio
                          + " setup failed: " + err);
            self.debug = require("./TestSupport.js");
        } else {
	    try {
                Fs.readFileSync(
                    "/sys/class/gpio/gpio" + self.gpio + "/value");
            } catch (e) {
                console.TRACE("pin " + self.name,
                              "Failed to access driver for GPIO "
                              + self.gpio + ": " + e.message);
                self.debug = require("./TestSupport.js");
            }
        }
	// This seems backwards, and runs counter to the documentation.
	// If we don't set the pin active_low, then writing a 1 to value
	// sets the pin low, and vice-versa. Ho hum.
        self.setFeature("active_low", 1);
        self.set(0, "init");
        self.setFeature("direction", "out");
    };

    try {
        console.TRACE("pin " + this.name, "checking " + self.gpio);
	Fs.readFileSync(
            "/sys/class/gpio/gpio" + self.gpio + "/value");
        console.TRACE("pin " + self.name, "Pin already exported");
        init();
    } catch (e) {
        try {
            console.TRACE("pin " + this.name, "exporting gpio " + self.gpio);
            Fs.writeFileSync("/sys/class/gpio/export",
                         self.gpio,
                         init);
        } catch (e) {
            console.TRACE("pin " + self.name, "export failed: " + e.message);
            init();
        }
    }
}
module.exports = PinController;

/** Not worked out how to do this yet :-(
    PinController.prototype.DESTROY = function() {
    "use strict";

    console.TRACE("pin", "unexport gpio " + this.gpio);
    Fs.writeFile("/sys/class/gpio/unexport", this.gpio, function() {});
    };
*/

/** PRIVATE */
PinController.prototype.setFeature = function(feature, value, callback) {
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

PinController.prototype.set = function(state, actor, callback) {
    "use strict";

    console.TRACE("pin " + this.name, actor + " set gpio "
                  + this.gpio + " = " + (state ? "ON" : "OFF"));

    this.actor = actor;
    if (typeof this.debug !== "undefined")
        this.debug.pinstate[this.name] = state;
    this.setFeature("value", state ? 1 : 0, callback);
};

PinController.prototype.get = function() {
    "use strict";
    if (typeof this.debug !== "undefined")
        return this.debug.pinstate[this.name];
    else
        return parseInt(Fs.readFileSync(
            "/sys/class/gpio/gpio" + this.gpio + "/value", "utf8"));
};

PinController.prototype.serialisable = function() {
    "use strict";
    return {
        name: this.name,
        actor: this.actor,
        gpio: this.gpio,
        state: this.get()
    };
};
