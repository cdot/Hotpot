/*@preserve Copyright (C) 2021-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs").promises;
const Path = require("path");

define([ "js/common/Utils" ], Utils => {

  const TAG = "DS18x20";

  // Base path of all one-wire device paths. This is declared as static so it
  // can be overridded in DebugSupport.js
  const ONE_WIRE_PATH = "/sys/bus/w1/devices";

  /**
   * Interface to DS18x20 temperature sensors
   */
  class DS18x20 {

    constructor(id) {
      this.id = id;
    }

    /**
     * Ensure the sensor exists and can be read.
     */
    initialiseSensor() {
      return this.getTemperature()
      .then(() => this);
    }

    /**
     * Return a promise to get the temperature from the sensor
     */
    async getTemperature() {
      // Javascript is single-threaded, so the await should be
      // enough to block any other attempt to read from the wire
      // bus.
      Utils.TRACE(TAG, `Polling ${this.id}`);
      return await Fs.readFile(
        Path.resolve(ONE_WIRE_PATH, this.id, 'w1_slave'), 'latin1')
      .then(content => {
        let lines = content.split("\n");
        if (lines[0].substr(-3) != "YES")
          throw new Error(`DS18x20 ${this.id} CRC check failed '${content}'`);
        let parts = lines[1].split('t=');
        if (parts.length !== 2)
          throw new Error("DS18x20 ${this.id} format error");
        // Temperature of 85000 is out of range, and indicates an
        // error. https://forum.arduino.cc/t/why-does-this-fix-work-for-ds18b20-error-code-85/529580/12
        const val = parseFloat(parts[1]);
        if (val === 85000)
          throw new Error("DS18x20 ${this.id} power on reset");
        this.lastKnownGood = Date.now();
        return val / 1000;
      })
      .catch(e => {
        Utils.TRACE(TAG, `Poll failed ${e}`);
        throw e;
      });
    }
  }

  /**
   * Return a promise to get a list of available sensors
   */
  DS18x20.list = () => {
    return Fs.readdir(ONE_WIRE_PATH)
    .then(list => {
      let sensors = [];
      for (let i in list) {
        if (/^[\da-f][\da-f]-[\da-f]{12}$/i.test(list[i]))
          sensors.push(list[i]);
      }
      return sensors;
    });
  };

  return DS18x20;
});
