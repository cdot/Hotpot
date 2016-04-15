/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

var Fs = require("fs");

/**
 * Control pins
 *
 * Writes to GPIO pins
 */
function PinController(name, gpio) {
    "use strict";

    var self = this;
    self.name = name;
    self.gpio = gpio;

    console.TRACE("init", "Creating controller for gpio " + gpio);
    
    var init = function() {
	// This seems backwards, and runs counter to the documentation.
	// If we don't set the pin active_low, then writing a 1 to value
	// sets the pin low, and vice-versa. Ho hum.
        self.setFeature("active_low", 1);
        self.set(false);
        self.setFeature("direction", "out");
    };
    
    try {
	Fs.readFileSync("/sys/class/gpio/gpio" + gpio + "/value");
        console.TRACE("init", "Pin already exported");
        init();
    } catch (e) {
        console.TRACE("init", "export gpio " + gpio);
        Fs.writeFile("/sys/class/gpio/export",
                     gpio,
                     init);
    }
}
module.exports = PinController;

PinController.prototype.DESTROY = function() {
    "use strict";
    console.TRACE("init", "unexport gpio " + this.gpio);
    Fs.writeFile("/sys/class/gpio/unexport", this.gpio, function() {});
};

PinController.prototype.setFeature = function(feature, value, callback) {
    "use strict";
    console.TRACE("change", "Set gpio " + this.gpio + " " + feature + "=" + value);
    if (typeof callback === "undefined")
        callback = function() {};
    Fs.writeFile("/sys/class/gpio/gpio" + this.gpio + "/" + feature,
                 value, callback);
};

PinController.prototype.set = function(state, callback) {
    "use strict";
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
        gpio: this.gpio,
        state: this.get()
    };
};
