/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

// Test support

const assert = require('assert');

// Global object that records current pin state
var pinstate = {};

function DS18x20() {
    this.cur = 20;
    this.mapID = {};
}

DS18x20.prototype.get = function(id, fn) {
    if (pinstate[this.mapID[id]] === 1)
        this.cur += Math.random();
    else
        this.cur -= Math.random();
    console.TRACE("debug", "GET DS18x20: " + id + ": " + this.mapID[id] +
                  "(" + pinstate[this.mapID[id]] + ")=" + this.cur);
    if (fn)
        fn(null, this.cur);
    else
        return this.cur;
};

function Wpi() {
}

Wpi.prototype.setup = function(shat) {
    if (shat !== "gpio")
        debugger;
}

Wpi.prototype.digitalWrite = function(pin, state) {
    pinstate[pin] = state;
    console.TRACE("debug", "SET GPIO: " + pin + " = " + state);
};

module.exports = {
    Wpi: Wpi,
    DS18x20: DS18x20,
    pinstate: pinstate
};
