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
    self.name = name;
    self.gpio = config.gpio;

    console.TRACE("init", "Creating controller for gpio " + self.gpio);
    
    var init = function() {
	// This seems backwards, and runs counter to the documentation.
	// If we don't set the pin active_low, then writing a 1 to value
	// sets the pin low, and vice-versa. Ho hum.
        self.setFeature("active_low", 1);
        self.set("init", false);
        self.setFeature("direction", "out");
    };
    
    try {
	var val = Fs.readFileSync(
            "/sys/class/gpio/gpio" + self.gpio + "/value");
        console.TRACE("init", "Pin already exported (" + val + ")");
        init();
    } catch (e) {
        console.TRACE("init", "export gpio " + self.gpio);
        Fs.writeFile("/sys/class/gpio/export",
                     self.gpio,
                     init);
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

PinController.prototype.setFeature = function(feature, value, callback) {
    "use strict";

    if (typeof callback === "undefined")
        callback = function() {};
    Fs.writeFile("/sys/class/gpio/gpio" + this.gpio + "/" + feature,
                 value, callback);
};

PinController.prototype.set = function(state, actor, callback) {
    "use strict";

    this.actor = actor;
    console.TRACE("pin", actor + " set gpio "
                  + this.gpio + " " + (state ? "ON" : "OFF"));
    this.setFeature("value", state ? 1 : 0, callback);
};

PinController.prototype.get = function() {
    "use strict";
    return Fs.readFileSync(
        "/sys/class/gpio/gpio" + this.gpio + "/value", "utf8");
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
