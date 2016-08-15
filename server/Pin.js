/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);
const writeFile = Q.denodeify(Fs.writeFile);
const Historian = require("./Historian");

const TAG = "Pin";

// Base path of all GPIO operations
var GPIO_PATH = "/sys/class/gpio/";

// Paths to write to to export/unexport GPIO pins
const EXPORT_PATH = GPIO_PATH + "export";
const UNEXPORT_PATH = GPIO_PATH + "unexport";

// Request types
const REQUEST_OFF = 0;
const REQUEST_ON = 1;
const REQUEST_BOOST = 2;

/**
 * A Pin is the interface to a RPi GPIO pin.
 * @class
 * @param {string} name name of the pin e.g. HW
 * @param {Config} config configuration block for the pin. Only one field is used,
 * gpio (the number of the gpio pin)
 * @param {function} done callback invoked when pin is created
 * @protected
 */
function Pin(name, config, done) {
    "use strict";

    var self = this;

    /**
     * Name of the pin e.g. HW
     * @type {string}
     * @public
     */
    self.name = name;

    /** @property {integer} gpio gpio port */
    self.gpio = config.get("gpio");

    if (typeof HOTPOT_DEBUG !== "undefined")
        HOTPOT_DEBUG.mapPin(self.gpio, self.name);

    self.value_path = GPIO_PATH + "gpio" + self.gpio + "/value";

    /** @property {object} requests List of requests for this pin
     * (see #addRequest) */
    self.requests = [];

    console.TRACE(TAG, "'", self.name,
                  "' constructed on gpio ", self.gpio);
    
    var hc = config.get("history");
    if (typeof hc !== "undefined") {
        self.historian = new Historian({
            name: self.name + "_pin",
            file: hc.file,
            max_bytes: hc.max_bytes,
            max_samples: hc.max_samples
        });
    } else
        console.TRACE(TAG, self.name, " has no historian");
}

/**
 * Return a promise to initialise the pin
 */
Pin.prototype.initialise = function() {
    var self = this;
    var exported = false;

    // First check if the pin can be read. If it can, it is already
    // exported and we can move on to setting the direction, otherwise
    // we have to export it.
    function readCheck() {
        var m = self.value_path + " readCheck ";
        return readFile(self.value_path, "utf8")
            .then(function() {
                // Check passed, so we know it's exported
                exported = true;
                console.TRACE(TAG, m, " OK for ", self.name);
                return setDirection();
            })
            .catch(function(e) {
                m += " failed: " + e;
                if (exported)
                    // Already exported, no point trying again
                    return fallBackToDebug(m);
                else {
                    console.TRACE(TAG, m);
                    return exportPin();
                }
            });
    }

    // Try and export the pin
    function exportPin() {
        var m = EXPORT_PATH + "=" + self.gpio;
        return writeFile(EXPORT_PATH, self.gpio, "utf8")
            .then(function() {
                console.TRACE(TAG, m, " OK for ", self.name);
                // Use a timeout to give it time to get set up
                return Q.delay(1000).then(readCheck);
            })
            .catch(function(err) {
                return fallBackToDebug(m + " failed " + err);
            });
    }

    // The pin is known to be exported, set the direction
    function setDirection() {
        var path = GPIO_PATH + "gpio" + self.gpio + "/direction";
        return writeFile(path, "out")
            .then(function() {
                console.TRACE(TAG, path, "=out OK for ", self.name);
                return setActive();
            })
            .catch(function(e) {
                return fallBackToDebug(path + "=out failed: " + e);
            });
    }

    // This seems backwards, and runs counter to the documentation.
    // If we don't set the pin active_low, then writing a 1 to value
    // sets the pin low, and vice-versa. Ho hum.
    function setActive() {
        var path = GPIO_PATH + "gpio" + self.gpio + "/active_low";
        return writeFile(path, 1)
            .then(writeCheck)
            .catch(function(e) {
                return fallBackToDebug(path + "=1 failed: " + e);
            });
    }

    // Pin is exported and direction is set, should be OK to write
    function writeCheck() {
        return writeFile(self.value_path, 0, "utf8")
            .then(function() {
                console.TRACE(TAG, self.value_path, " writeCheck OK for ",
                              self.name);
                if (self.historian)
                    self.historian.record(0);
            })
            .catch(function(e) {
                return fallBackToDebug(
                    self.value_path + " writeCheck failed: " + e);
            });
    }

    // Something went wrong, but still use a file
    function fallBackToDebug(err) {
        console.TRACE(TAG, self.name, ":", self.gpio, " setup failed: ", err);
        if (typeof HOTPOT_DEBUG !== "undefined") {
            console.TRACE(TAG, "Falling back to debug for ", self.name);
            self.value_path = HOTPOT_DEBUG.pin_path + self.gpio;
        }
        return writeCheck();
    }

    return readCheck();
}
module.exports = Pin;

/**
 * Release all resources used by the pin
 * @protected
 */
Pin.prototype.DESTROY = function() {
    "use strict";

    console.TRACE(TAG, "Unexport gpio ", this.gpio);
    writeFile(UNEXPORT_PATH, this.gpio, "utf8");
};

/**
 * Set the pin state. Don't use this on a Y-plan system, use
 * {@link Controller.Controller#setPin|Controller.setPin} instead.
 * @param {integer} state of the pin
 * @return {Promise} a promise to set the pin state
 * @public
 */
Pin.prototype.set = function(state) {
    "use strict";
    var self = this;

    console.TRACE(TAG, self.value_path, " = ", (state === 1 ? "ON" : "OFF"));

    var promise = writeFile(self.value_path, state, "UTF8");
    if (self.historian)
        promise = promise.then(function() {
            self.historian.record(state);
        });
    return promise;
};

/**
 * Get the pin state
 * @return pin state {integer}
 * @public
 */
Pin.prototype.getState = function() {
    "use strict";
    return readFile(this.value_path, "utf8")
        .then(function(data) {
            return parseInt(data);
        });
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @param {boolean} ajax set true if this config is for AJAX
 * @return {object} a serialisable structure
 * @protected
 */
Pin.prototype.getSerialisableConfig = function(ajax) {
    "use strict";
    return {
        gpio: this.gpio
    };
};

/**
 * Generate and return a promise for a serialisable version of the
 * structure, suitable for use in an AJAX response.
 * @return {Promise} a promise
 * @protected
 */
Pin.prototype.getSerialisableState = function() {
    "use strict";
    this.purgeRequests();
    var state = {};
    var ar = this.getActiveRequest();
    if (typeof ar !== "undefined")
        state.request = ar;
    return this.getState()
        .then(function(value) {
            state.state = value;
            return state;
        });
};

/**
 * Purge requests that have timed out, or are force-purged by matching
 * the parameters.
 * @param {number} state state of requests to force-purge, or undefined
 * @param {string} source source of requests to force-purge, or undefined
 * @private
 */
Pin.prototype.purgeRequests = function(state, source) {
    var reqs = this.requests;
    for (var i = 0; i < reqs.length;) {
        var r = reqs[i];
        if ((typeof source !== "undefined" && r.source === source)
            || (typeof state !== "undefined" && r.state === state)
            // If there's an error finding a route then r.until will be -1
            // This means an ON request will only be active while the issuer
            // is a measurable distance away from home.
            || (r.state === REQUEST_ON && r.until <= Time.nowSeconds())
            // OFF requests are only timed out if r.until is > 0
            || (r.state === REQUEST_OFF
                && r.until > 0 && r.until <= Time.nowSeconds())) {
            // BOOST requests are explicitly expired by rules
            console.TRACE(TAG, "Purge request ", r);
            reqs.splice(i, 1);
        } else
            i++;
    }
};

/**
 * Add a request. A request is an override for rules that suspends the
 * normal rules either for a period of time ('until' is a number), or until
 * the rules purge the request. The interpretation
 * of requests is in the hands of the rules; the pin simply stores them. The
 * only thing the Pin does with a request is to expire those that have
 * passed their timeout (see #purgeRequests)
 * Active requests for state 0 override those for state 1 or 2.
 * @param {object} request { until: epoch s, state: 2|1|0, source: string }
 */ 
Pin.prototype.addRequest = function(request) {
    console.TRACE(TAG, "Add request ", request);
    this.purgeRequests(undefined, request.source);
    if (request.state >= 0)
        this.requests.push(request);
};

/**
 * Test what state is requested for the pin.
 * @return {object} request, if the service is requested. Requests that
 * turn off the pin (state 0) override those that turn it on. Format of a
 * request is documented in #addRequest.
 */
Pin.prototype.getActiveRequest = function() {
    "use strict";

    var active_req;
    this.purgeRequests();
    for (var i = 0; i < this.requests.length; i++) { 
        if (typeof active_req === "undefined") {
            active_req = this.requests[i];
            if (active_req.state === 0)
                return active_req;
        }
        else if (this.requests[i].state === 0)
            // Override active_req.state === 1
            return this.requests[i];
    }
    return active_req;
};
