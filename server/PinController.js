/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

var Fs = require("fs");

/**
 * Control pins
 *
 * Writes to GPIO pins
 */
function PinController(name, pin) {
    "use strict";

    var self = this;
    self.name = name;
    self.pin = pin;
    console.log("Creating controller for pin " + pin);
    var ok = false;
    try {
	Fs.lstatSync("/sys/class/gpio/gpio" + pin);
        console.log("Pin already exported");
    } catch (e) {
        console.log("export pin " + pin);
        Fs.writeFileSync("/sys/class/gpio/export", pin);
    }
    self.setFeature("direction", "out");
    self.set(0);
}
module.exports = PinController;

PinController.prototype.DESTROY = function() {
    console.log("unexport pin " + pin);
    Fs.writeFileSync("/sys/class/gpio/unexport", pin);
};

PinController.prototype.setFeature = function(feature, value) {
    "use strict";
    console.log("Set pin " + this.pin + " " + feature + "=" + value);
    Fs.writeFileSync("/sys/class/gpio/gpio" + this.pin + "/" + feature, value);
}

PinController.prototype.set = function(state) {
    "use strict";
    this.state = state;
    this.setFeature("value", state ? 1 : 0);
};

PinController.prototype.state = function() {
    "use strict";
    return this.state;
};
