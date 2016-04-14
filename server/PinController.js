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
        self.setFeature("direction", "out", function() {
            self.set(0);
        });
    };
    
    try {
	Fs.lstatSync("/sys/class/gpio/gpio" + gpio);
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
    console.TRACE("init", "unexport gpio " + gpio);
    Fs.writeFile("/sys/class/gpio/unexport", gpio, function() {});
};

PinController.prototype.setFeature = function(feature, value, callback) {
    "use strict";
    console.TRACE("change", "Set gpio " + this.gpio + " " + feature + "=" + value);
    if (typeof callback === "undefined")
        callback = function() {};
    Fs.writeFile("/sys/class/gpio/gpio" + this.gpio + "/" + feature,
                 value, callback);
}

PinController.prototype.set = function(state, callback) {
    "use strict";
    this.state = state;
    this.setFeature("value", state ? 1 : 0, callback);
};

PinController.prototype.serialisable = function() {
    return {
        name: this.name,
        gpio: this.gpio,
        state: this.state
    };
};
