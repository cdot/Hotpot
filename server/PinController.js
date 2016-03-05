/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Control pins
 *
 * Writes to GPIO pins
 */
function PinController(name, pin) {
    "use strict";

    var Gpio;
    this.name = name;
    try {
        Gpio = require("onoff").Gpio;
        this.Gpio = new Gpio(pin, "out");
    } catch (e) {
        console.error(e.message);
        console.error("Gpio not available, using test pins ");
        Gpio = require("./TestSupport.js").Gpio;
        this.Gpio = new Gpio(pin, name);
    }
    this.set(0);
}
module.exports = PinController;

PinController.prototype.set = function(state) {
    "use strict";
    this.state = state;
    this.Gpio.writeSync(state);
};

PinController.prototype.state = function() {
    "use strict";
    return this.state;
};
