/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

// Test support

const Fs = require("fs");

// Heating and cooling rates, in degrees per minute
const RATES = [
    { HW: -0.01, CH: -0.03 }, // COOL
    { HW: 0.333, CH: 0.1 }   // WARM
];

var TestSupport = {
    // Path for debug pin files
    pin_path: "/tmp/gpio",
    
    ds18x20: {
        get: function(id, fn) {
            var sensor = TestSupport.thid2Sensor[id];
            fn(null, sensor.temperature);
        },

        isDriverLoaded: function() { return true; }
    },
    
    adjustSensor: function(sensor) {
        if (typeof TestSupport.name2gpio[sensor.name] !== "undefined") {
            var pState = parseInt(Fs.readFileSync(
                TestSupport.pin_path + TestSupport.name2gpio[sensor.name]));
            sensor.temperature += RATES[pState][sensor.name] / 120.0;
        }
        setTimeout(function() {
            TestSupport.adjustSensor(sensor);
        }, 500);
    },

    thid2Sensor: {},
    mapThermostat: function(th) {
        var sensor = {
            name: th.name,
            temperature: th.getTargetTemperature()
        };
        TestSupport.thid2Sensor[th.id] = sensor;
        TestSupport.adjustSensor(sensor);
    },

    name2gpio: {},
    mapPin: function(pin) {
        TestSupport.name2gpio[pin.name] = pin.gpio;
    },
};

module.exports = TestSupport;
