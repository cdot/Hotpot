/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

// Test support

const assert = require('assert');
const Server = require("./Server.js");

TestSupport = {
    gpiopath:    "/tmp",
    temperature: { CH: 20, HW: 40 },
    ID2Name: {},
    pinstate: {},

    mapID: function(id, name) {
        TestSupport.ID2Name[id] = name;
        TestSupport.temperature[name] = 20;
    },

    // Get TestSupport.temperature
    get: function(id, fn) {
        var name = TestSupport.ID2Name[id];
        var odl = TestSupport.temperature[name];
        var offset = Math.random() / 1000;
        if (TestSupport.pinstate[name] > 0)
            TestSupport.temperature[name] += offset;
        else if (TestSupport.temperature[name] > 0)
            TestSupport.temperature[name] -= offset;
        //console.log("WTF " + name + " (" + TestSupport.pinstate[name] + ") "
        // + odl + " -> " + TestSupport.temperature[name]);
        if (typeof fn !== "undefined")
            fn(null, TestSupport.temperature[name]);
        else
            return TestSupport.temperature[name];
    }
};

module.exports = TestSupport;
