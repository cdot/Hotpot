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

    console.TRACE(4, "Creating controller for pin " + pin);
    
    var init = function() {
        self.setFeature("direction", "out", function() {
            self.set(0);
        });
    };
    
    try {
	Fs.lstatSync("/sys/class/gpio/gpio" + pin);
        console.TRACE(4, "Pin already exported");
        init();
    } catch (e) {
        console.TRACE(4, "export pin " + pin);
        Fs.writeFile("/sys/class/gpio/export",
                     pin,
                     init);
    }
}
module.exports = PinController;

PinController.prototype.DESTROY = function() {
    console.TRACE(4, "unexport pin " + pin);
    Fs.writeFile("/sys/class/gpio/unexport", pin, function() {});
};

PinController.prototype.setFeature = function(feature, value, callback) {
    "use strict";
    console.TRACE(4, "Set pin " + this.pin + " " + feature + "=" + value);
    if (typeof callback === "undefined")
        callback = function() {};
    Fs.writeFile("/sys/class/gpio/gpio" + this.pin + "/" + feature,
                 value, callback);
}

PinController.prototype.set = function(state, callback) {
    "use strict";
    this.state = state;
    this.setFeature("value", state ? 1 : 0, callback);
};

PinController.prototype.state = function() {
    "use strict";
    return this.state;
};
