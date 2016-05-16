/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

// Test support

const assert = require('assert');

TestSupport = {
    pinstate: {},
    temperature: {},
    ID2Name: {},

    mapID: function(id, name) {
        TestSupport.ID2Name[id] = name;
        TestSupport.temperature[name] = 20;
    },

    // Get TestSupport.temperature
    get: function(id, fn) {
        var name = TestSupport.ID2Name[id];
        var odl = TestSupport.temperature[name];
        if (TestSupport.pinstate[name])
            TestSupport.temperature[name] += Math.random();
        else
            TestSupport.temperature[name] -= Math.random();
        //console.log("WTF " + name + " (" + TestSupport.pinstate[name] + ") "
        // + odl + " -> " + TestSupport.temperature[name]);
        if (typeof fn !== "undefined")
            fn(null, TestSupport.temperature[name]);
        else
            return TestSupport.temperature[name];
    }
};

module.exports = TestSupport;
