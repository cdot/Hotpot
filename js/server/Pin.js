/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
/*global HOTPOT_DEBUG*/

define([
  "js/common/Utils",
  "js/server/Gpio", "js/server/Historian"
], (
  Utils,
  Gpio, Historian
) => {

  const TAG = "Pin";

  /**
   * A Pin is the interface to a RPi GPIO pin.
   * @class
   */
  class Pin {

    /**
     * @param {string} name name of the pin e.g. HW
     * @param {object} proto see Pin.Model
     */
    constructor(proto, name) {

      /**
       * The number of the gpio pin
       * @member {number}
       */
      this.gpio = undefined;

      /**
       * History of this pin
       * @member {Historian}
       */
      this.history = undefined;

      Utils.extend(this, proto);

      /**
       * Name of the pin e.g. HW
       * @member {string}
       */
      this.name = name;

      /**
       * Descriptive reason the pin is currently in
       * the state it is.
       * @member {string}
       */
      this.reason = "";

      Utils.TRACE(TAG, `'${this.name}' constructed on gpio ${this.gpio}`);

      /**
       * The object that interfaces to the actual GPIO pins
       * @member
       * @private
       */
      this.Gpio = new Gpio(this.gpio);
    }

    initialise() {
      Utils.TRACE(TAG, `Initialising pin ${this.name}`);
      return this.Gpio.initialiseGpio("out", "low")
      .catch(e => {
        console.error(`Pin ${this.name} initialisation failed ${e}`);
        if (typeof HOTPOT_DEBUG === "undefined") {
          console.error("--debug not enabled");
          // if we can't talk to GPIO and we can't start debug,
          // then this is something the sysadmin has to resolve.
          throw e;
        }
        // Fall back to debug
        this.Gpio = HOTPOT_DEBUG.getService(this.name);
        console.error(`Falling back to simulator for pin '${this.name}'`);
        return this;
      });
    }

    /**
     * Set the pin state. Don't use this on a Y-plan system, use
     * {@link Controller.Controller#setPromise|Controller.setPromise} instead.
     * @param {integer} state of the pin
     * @return {Promise} a promise to set the pin state
     * @public
     */
    setState(state) {
      Utils.TRACE(TAG, `gpio${this.gpio}=${state === 1 ? "ON" : "OFF"}`);

      let promise = this.Gpio.setValue(state);
      if (this.history)
        promise = promise.then(() => this.history.record(state));
      return promise;
    };

    /**
     * Get a promise to get the pin state
     * @return {Promise} a promise, passed the pin state
     * @public
     */
    getState() {
      return this.Gpio.getValue();
    };

    /**
     * Generate and return a promise for a serialisable version of the
     * structure, suitable for use in an AJAX response.
     * @return {Promise} a promise that is passed the state
     * @protected
     */
    getSerialisableState() {
      return this.getState()
      .then(value => {
        return {
          reason: this.reason,
          state: value
        };
      });
    };

    /**
     * Get a promise for a trace of the pin state.
     * @param {number} since optional param giving start of
     * required logs as a ms datime
     * @return {Promise} resolves to the trace {@link Historian#encodeTrace}
     */
    getSerialisableLog(since) {
      if (!this.history)
        return Promise.resolve();
      return this.history.encodeTrace(since);
    };
  }

  /**
   * Configuration model, for use with {@link DataModel}
   * @typedef Pin.Model
   * @property {Number} gpio the number of the gpio pin
   * @property{Historian} history Logger
   */
  Pin.Model = {
    $class: Pin,
    gpio: {
      $class: Number,
      $doc: "the number of the gpio pin"
    },
    history: Utils.extend({
      $optional: true
    }, Historian.Model)
  };

  return Pin;
});
