/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

// Test support

const fs = require("fs");

function TestSupport() {
    console.log("****** Running with TestSupport ******");
    this.temperature = { CH: 20, HW: 40 };
    this.thermoMap = {};
    this.pinMap = {};

    // Path for debug pin files
    this.pin_path = "/tmp/gpio";
}
module.exports = TestSupport;

// Map an ID - e.g. of a temp sensor - to a name
TestSupport.prototype.mapThermostat = function(id, name) {
    this.thermoMap[id] = name;
    this.temperature[name] = 20;
    this.warmDown(name);
};

// Map an ID - e.g. of a temp sensor - to a name
TestSupport.prototype.mapPin = function(id, name) {
    this.pinMap[name] = id;
};

TestSupport.prototype.warmDown = function(name) {
    var self = this;
    if (this.pinMap[name]) {
        var odl = this.temperature[name];
        var offset = Math.random() / 10;
        var pState = this.getPin(name);
        this.temperature[name] += (pState === 0) ? -offset : offset;
        if (this.temperature[name] < 13)
            this.temperature[name] = 13;
        if (this.temperature[name] > 60)
            this.temperature[name] = 60;
        //console.log("WTF " + name + " (" + pState + ") "
        //            + odl + " -> " + this.temperature[name]);
    }
    setTimeout(function() {
        self.warmDown(name);
    }, 1000);
};

// Simulate a ds18x20
TestSupport.prototype.get = function(id, fn) {
    var name = this.thermoMap[id];
    if (typeof fn !== "undefined")
        fn(null, this.temperature[name]);
    else
        return this.temperature[name];
};

// private
TestSupport.prototype.getPin = function(name) {
    return parseInt(fs.readFileSync(this.pin_path + this.pinMap[name]));
};

