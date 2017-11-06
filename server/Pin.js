/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const Q = require("q");
const readFile = Q.denodeify(Fs.readFile);
const writeFile = Q.denodeify(Fs.writeFile);
const Utils = require("../common/Utils");
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
 * A Pin is the interface to a RPi GPIO pin. A pin maintains a state,
 *  history, and one or more Pin.Requests. These are used to record a
 * requirement for a specific state for the pin:
 * ```
 * Pin.Request {
 *   until: epoch ms,
 *   state: 2|1|0,
 *   source: string
 * }
 * ```
 * Requests that turn off the pin (state 0) override those that turn it on
 * (state 1, pin on, and state 2, pin boost). "Boost" is a special pin state
 * that is used in rules to bring a thermostat up to a target temperature
 * and then turn the pin off. Requests have an optional `until` field that
 * can be used to expire the request at a given time.
 * @class
 * @param {string} name name of the pin e.g. HW
 * @param {object} proto see Pin.Model
 */
function Pin(proto, name) {
    "use strict";

    Utils.extend(this, proto);
    
    var self = this;

    /**
     * @property {string} name Name of the pin e.g. HW
     * @public
     */
    self.name = name;

    /**
     * @property {string} reason Descriptive reason the pin is currently in
     * the state it is.
     * @public
     */
    self.reason = "";
    
    if (typeof HOTPOT_DEBUG !== "undefined")
        HOTPOT_DEBUG.mapPin(self.gpio, self.name);

    self.value_path = GPIO_PATH + "gpio" + self.gpio + "/value";

    /** @property {object} requests List of requests for this pin
     * (see #addRequest) */
    self.requests = [];

    Utils.TRACE(TAG, "'", self.name,
                  "' constructed on gpio ", self.gpio);
}

Pin.Model = {
    $class: Pin,
    gpio: {
        $class: "number",
        $doc: "the number of the gpio pin"
    },
    history: Utils.extend({ $optional: true }, Historian.Model)
};

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
                Utils.TRACE(TAG, m, " OK for ", self.name);
                return setDirection();
            })
            .catch(function(e) {
                m += " failed: " + e;
                if (exported)
                    // Already exported, no point trying again
                    return fallBackToDebug(m);
                else {
                    Utils.ERROR(TAG, m);
                    return exportPin();
                }
            });
    }

    // Try and export the pin
    function exportPin() {
        var m = EXPORT_PATH + "=" + self.gpio;
        return writeFile(EXPORT_PATH, self.gpio, "utf8")
            .then(function() {
                Utils.TRACE(TAG, m, " OK for ", self.name);
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
                Utils.TRACE(TAG, path, "=out OK for ", self.name);
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
                Utils.TRACE(TAG, self.value_path, " writeCheck OK for ",
                              self.name);
                if (self.history)
                    self.history.record(0);
            })
            .catch(function(e) {
                return fallBackToDebug(
                    self.value_path + " writeCheck failed: " + e);
            });
    }

    // Something went wrong, but still use a file
    function fallBackToDebug(err) {
        Utils.ERROR(TAG, self.name, ":", self.gpio,
                    " setup failed: ", err);
        if (typeof HOTPOT_DEBUG === "undefined")
            throw "Pin setup failed";
        Utils.ERROR(TAG, "Falling back to debug for ", self.name);
        self.value_path = HOTPOT_DEBUG.pin_path + self.gpio;
        return writeCheck();
    }

    return readCheck();
};
module.exports = Pin;

/**
 * Release all resources used by the pin
 * @protected
 */
Pin.prototype.DESTROY = function() {
    "use strict";

    Utils.TRACE(TAG, "Unexport gpio ", this.gpio);
    writeFile(UNEXPORT_PATH, this.gpio, "utf8");
};

/**
 * Set the pin state. Don't use this on a Y-plan system, use
 * {@link Controller.Controller#setPromise|Controller.setPromise} instead.
 * @param {integer} state of the pin
* @param {String} reason Reason the pin is being set
 * @return {Promise} a promise to set the pin state
 * @public
 */
Pin.prototype.set = function(state, reason) {
    "use strict";
    var self = this;

    Utils.TRACE(TAG, self.value_path, " = ", (state === 1 ? "ON" : "OFF"));

    self.reason = reason;
    var promise = writeFile(self.value_path, state, "UTF8");
    if (self.history)
        promise = promise.then(function() {
            return self.history.record(state);
        });
    return promise;
};

/**
 * Get the pin state, synchronously. Intended for use in rules.
 * @return pin state {integer}
 * @public
 */
Pin.prototype.getState = function() {
    "use strict";
    var state = Fs.readFileSync(this.value_path, "utf8");
    return parseInt(state);
};

/**
 * Get a promise to get the pin state
 * @return a promise, passed the pin state
 * @public
 */
Pin.prototype.getStatePromise = function() {
    "use strict";
    return readFile(this.value_path, "utf8")
    .then(function(data) {
        return parseInt(data);
    });
};

/**
 * Generate and return a promise for a serialisable version of the
 * structure, suitable for use in an AJAX response.
 * @return {Promise} a promise that is passed the state
 * @protected
 */
Pin.prototype.getSerialisableState = function() {
    "use strict";
    var self = this;

    self.purgeRequests();
    return this.getStatePromise()
    .then(function(value) {
        var state = {
            requests: self.requests,
            reason: self.reason
        };
        var ar = self.getActiveRequest();
        if (typeof ar !== "undefined")
            state.request = ar;
        state.state = value;
        return state;
    });
};

/**
 * Get a promise for the current log of the pin state.
 * @param since optional param giving start of logs as a ms datime
 */
Pin.prototype.getSerialisableLog = function(since) {
    "use strict";
    if (!this.history)
        return Q();
    return this.history.getSerialisableHistory(since);
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
            // state === REQUEST_BOOST requests will be purged by rules
            || (typeof state !== "undefined" && r.state === state)
            || (r.state === REQUEST_ON && r.until <= Time.nowSeconds())
            // OFF requests are only timed out if r.until is > 0
            || (r.state === REQUEST_OFF
                && r.until > 0 && r.until <= Time.now())) {
            // BOOST requests are explicitly expired by rules
            Utils.TRACE(TAG, "Purge request ", r);
            reqs.splice(i, 1);
        } else
            i++;
    }
};

/**
 * Add a request. A request is an override for rules that suspends the
 * normal rules either for a period of time ('until' is a number), or until
 * the rules purge the request. The exact interpretation
 * of requests is in the hands of the rules; the pin simply stores them.
 * A pin may have multiple requests, but only one request from each source.
 * When it gets a request it purges all existing requests from the same source
 * before adding the new request. The special state -1 (none) is used to
 * remove all existing requests.
 * Where multiple sources have active requests, then requests for lower states
 * override requests for higher states.
 * @param {Pin.Request} request the request, see Pin.Request in the class
 * description
 */ 
Pin.prototype.addRequest = function(request) {
    Utils.TRACE(TAG, this.name + " add request ", request);
    this.purgeRequests(undefined, request.source);
    if (request.state >= 0)
        this.requests.push(request);
};

/**
 * Test what state is currently requested for the pin.
 * @return {Pin.Request} request
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
        else if (!active_req || this.requests[i].state < active_req.state)
            // Lower state overrides higher
            active_req = this.requests[i];
    }
    return active_req;
};
