/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

// Test support

const fs = require("fs");
const Utils = require("../common/Utils.js");

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
};

// Map an ID - e.g. of a temp sensor - to a name
TestSupport.prototype.mapPin = function(id, name) {
    this.pinMap[name] = id;
};

// Simulate a ds18x20
TestSupport.prototype.get = function(id, fn) {
    var name = this.thermoMap[id];
    var odl = this.temperature[name];
    var offset = Math.random() / 100;
    var pstate = this.getPin(name);
    this.temperature[name] += (pstate === 0) ? -offset / 100 : offset;
    //console.log("WTF " + name + " (" + this.pinstate[name] + ") "
    // + odl + " -> " + this.temperature[name]);
    if (typeof fn !== "undefined")
        fn(null, this.temperature[name]);
    else
        return this.temperature[name];
};

// private
TestSupport.prototype.getPin = function(name) {
    return parseInt(fs.readFileSync(this.pin_path + this.pinMap[name]));
}

