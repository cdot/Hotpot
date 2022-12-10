/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs").promises;
const Path = require("path");

define([ "js/common/Utils" ], Utils => {

  // Base path of all GPIO paths.
  const GPIO_PATH = "/sys/class/gpio";

  /**
   * An interface to GPIO pins.
   * It uses the "integer" sysfs interface, which is deprecated. However
   * support for libgpiod requires cross-compilation, so sticking with
   * sysfs for now.
   */
  class Gpio {

    /**
     * @param {number} gpio GPIO pin number
     */
    constructor(gpio) {
      this.gpio = gpio;
    }

    /**
     * Promise to initialise the pin. This will export the pin if necessary.
     * @param {string} direction in|out will set the pin direction
     * @param {string} active high|low
     */
    initialiseGpio(direction, active) {
      // First check if the pin is already exported
      return this.isExported()
      .catch(() => this.export())
      .then(() => this.setDirection(direction))
      .then(() => this.setActive(active))
      .catch(e => {
        console.error(`Failed to initialise GPIO ${this.gpio} ${e}`);
        throw e;
      });
    }

    /**
     * @return true if the pin is exported
     */
    isExported() {
      return Fs.access(`${GPIO_PATH}/gpio${this.gpio}`);
    }

    /**
     * Try and export the pin
     * @return {Promise} a promise to export the pin
     */
    export () {
      return Fs.writeFile(
        Path.resolve(GPIO_PATH, 'export'), `${this.gpio}`, "utf8")
      .then(() => {
        // Use a timeout to give it time to get set up;
        // it takes a while
        return new Promise(resolve => {
          Utils.startTimer(`export${this.gpio}`, resolve, 1000);
        });
      });
    }

    /**
     * Set the pin direction
     * @param {string} dirn in|out
     * @return {Promise} Promise to set the direction
     */
    setDirection(dirn) {
      return Fs.writeFile(
        Path.resolve(GPIO_PATH, `gpio${this.gpio}`, 'direction'),
        dirn);
    }

    /**
     * @return {Promise} Promise to set the active level
     * @param {string} lohi high|low
     */
    setActive(lohi) {
      let path = Path.resolve(
        GPIO_PATH, `gpio${this.gpio}`, 'active_low');
      return Fs.writeFile(path, (lohi == "low") ? "1" : "0");
    }

    /**
     * Return a promise to set the current state of the pin to the
     * given state
     * @return {Promise} Promise to set the state
     */
    setValue(state) {
      return Fs.writeFile(
        Path.resolve(GPIO_PATH, `gpio${this.gpio}`, 'value'),
        `${state}`, "utf8");
    }

    /**
     * Determine the current state of the pin
     * @return {Promise} Promise that resolves to the current state
     */
    getValue() {
      return Fs.readFile(
        Path.resolve(GPIO_PATH, `gpio${this.gpio}`, 'value'), "utf8")
      .then(data => parseInt(data));
    }
  }

  return Gpio;
});
