/*@preserve Copyright (C) 2021-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import debug from "debug";
import { promises as Fs } from "fs";
import Path from "path";

// Base path of all one-wire device paths.
const ONE_WIRE_PATH = "/sys/bus/w1/devices";

const trace = debug("DS18x20");

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
    // Hotpot server is single-threaded, so the await should be
    // enough to block any other attempt to read from the wire
    // bus.
    trace(`Polling ${this.id}`);
    return await Fs.readFile(
      Path.resolve(ONE_WIRE_PATH, this.id, 'w1_slave'), 'latin1')
    .then(content => {
      let lines = content.split("\n");
      if (lines[0].substr(-3) != "YES")
        throw new Error(`DS18x20 ${this.id} CRC check failed '${content}'`);
      let parts = lines[1].split('t=');
      if (parts.length !== 2)
        throw new Error(`DS18x20 ${this.id} format error`);
      // Temperature of 85000 is out of range, and indicates an
      // error. https://forum.arduino.cc/t/why-does-this-fix-work-for-ds18b20-error-code-85/529580/12
      const val = parseFloat(parts[1]);
      if (val === 85000)
        throw Error(`DS18x20 ${this.id} error 85`);
      this.lastKnownGood = Date.now();
      return val / 1000;
    })
    .catch(e => {
      trace(`Poll failed ${e}`);
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

export { DS18x20 }
