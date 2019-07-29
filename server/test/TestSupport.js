/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let Fs = require("fs-extra");

// Test support

// Heating and cooling rates, in degrees per minute
const RATES = [
    { HW: -0.01, CH: -0.03 }, // OFF = COOL
    { HW: 0.333, CH: 0.1 }   // ON = WARM
];

class TestSupport {

    constructor() {
        // Path for debug pin files
        this.pin_path = "/tmp/gpio";

        let self = this;
        this.ds18x20 = {
            get: function(id, fn) {
                let sensor = self.thid2Sensor[id];
                fn(null, sensor.temperature || 100);
            },

            isDriverLoaded: function() { return true; }
        };

        this.thid2Sensor = {};
        this.name2gpio = {};
    }
    
    adjustSensor(sensor) {
        if (typeof this.name2gpio[sensor.name] !== "undefined") {
            Fs.readFile(this.pin_path + this.name2gpio[sensor.name])
            .then((data) => {
                var pState = parseInt(data);
                if (isNaN(pState)) {
                    console.error("TestSupport: pState from " + this.pin_path
                                  + this.name2gpio[sensor.name]
                                  + " was unparseable; '" + data + "'");
                    pState = 0;
                }
                sensor.temperature += RATES[pState][sensor.name] / 120.0;
            })
            .catch((e) => {
                sensor.temperature = 100;
            });
        }
        let self = this;
        setTimeout(() => {
            self.adjustSensor(sensor);
        }, 500);
    }

    mapThermostat(th) {
        var sensor = {
            name: th.name,
            temperature: th.getTargetTemperature()
        };
        this.thid2Sensor[th.id] = sensor;
        this.adjustSensor(sensor);
    }

    mapPin(pin) {
        this.name2gpio[pin.name] = pin.gpio;
    }
}

module.exports = new TestSupport();

