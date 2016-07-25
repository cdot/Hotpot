/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Fs = require("fs");
const promise = require("promise");
const readFile = promise.denodeify(Fs.readFile);
const writeFile = promise.denodeify(Fs.writeFile);
const Historian = require("./Historian");

const TAG = "Pin";

// Base path of all GPIO operations
var GPIO_PATH = "/sys/class/gpio/";

// Paths to write to to export/unexport GPIO pins
const EXPORT_PATH = GPIO_PATH + "export";
const UNEXPORT_PATH = GPIO_PATH + "unexport";

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

    self.value_path = GPIO_PATH + "gpio" + self.gpio + "/value";

    /** @property {object} requests List of requests for this pin
     * (see #addRequest) */
    self.requests = [];

    console.TRACE(TAG, "'", self.name,
                  "' construction starting on gpio ", self.gpio);
    
    var exported = false;
    var hc = config.get("history");
    if (typeof hc !== "undefined") {
	self.historian = new Historian({
	    name: self.name + "_pin",
	    file: hc.file,
	    interval: hc.interval,
	    limit: hc.limit,
	    datum: function() {
		return self.getState();
	    }
	});
    }

    // First check if the pin can be read. If it can, it is already
    // exported and we can move on to setting the direction, otherwise
    // we have to export it.
    function readCheck() {
        var m = self.value_path + " readCheck ";
        readFile(self.value_path, "utf8")
            .then(function() {
                // Check passed, so we know it's exported
                exported = true;
                console.TRACE(TAG, m, " OK");
                setDirection();
            })
            .catch(function(e) {
                m += " failed: " + e;
                if (exported)
                    // Already exported, no point trying again
                    fallBackToDebug(m);
                else {
                    console.TRACE(TAG, m);
                    exportPin();
                }
            });
    }

    // Try and export the pin
    function exportPin() {
        var m = EXPORT_PATH + "=" + self.gpio;
        writeFile(EXPORT_PATH, self.gpio, "utf8")
            .then(function() {
                console.TRACE(TAG, m, " OK");
                // Use a timeout to give it time to get set up
                setTimeout(readCheck, 1000);
            })
            .catch(function(err) {
                fallBackToDebug(m + " failed " + err);
            });
    }

    // The pin is known to be exported, set the direction
    function setDirection() {
        var path = GPIO_PATH + "gpio" + self.gpio + "/direction";
        writeFile(path, "out")
            .then(function() {
                console.TRACE(TAG, path, "=out OK");
                setActive();
            })
            .catch(function(e) {
                fallBackToDebug(path + "=out failed: " + e);
            });
    }

    // This seems backwards, and runs counter to the documentation.
    // If we don't set the pin active_low, then writing a 1 to value
    // sets the pin low, and vice-versa. Ho hum.
    function setActive() {
        var path = GPIO_PATH + "gpio" + self.gpio + "/active_low";
        writeFile(path, 1)
            .then(function() {
                writeCheck();
            })
            .catch(function(e) {
                fallBackToDebug(path + "=1 failed: " + e);
            });
    }

    // Pin is exported and direction is set, should be OK to write
    function writeCheck() {
        writeFile(self.value_path, 0, "utf8")
            .then(function() {
                console.TRACE(TAG, self.value_path, " writeCheck OK");
		if (self.historian)
		    self.historian.start();
                done();
            })
            .catch(function(e) {
                fallBackToDebug(
                    self.value_path + " writeCheck failed: " + e);
            });
    }

    // Something went wrong, but still use a file
    function fallBackToDebug(err) {
        console.TRACE(TAG, self.name, ":", self.gpio, " setup failed: ",
                      err, "; falling back to debug");
        self.value_path = "/tmp/gpio" + self.gpio;
        writeCheck();
    }

    readCheck();
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
 * @return {Promise} a promise
 * @public
 */
Pin.prototype.set = function(state) {
    "use strict";
    console.TRACE(TAG, this.value_path, " = ", (state === 1 ? "ON" : "OFF"));
    if (this.debug)
        this.debug.pinstate[this.name] = state;
    return writeFile(this.value_path, state, "utf8");
};

/**
 * Get the pin state
 * @return pin state {integer}
 * @public
 */
Pin.prototype.getState = function() {
    "use strict";
    var data = Fs.readFileSync(this.value_path, "utf8");
    return parseInt(data);
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 * @protected
 */
Pin.prototype.getSerialisableConfig = function() {
    "use strict";
    return {
        gpio: this.gpio
    };
};

/**
 * Generate and return a serialisable version of the structure, suitable
 * for use in an AJAX response.
 * @return {object} a serialisable structure
 * @protected
 */
Pin.prototype.getSerialisableState = function() {
    "use strict";
    this.purgeRequests();
    var state = {
        state: this.getState()
    };
    var ar = this.getActiveRequest();
    if (typeof ar !== "undefined")
        state.request = ar;
    return state;
};

/**
 * Purge requests that have passed their timeout, or have the same source
 * as specified by "purge". Each mobile can only have one request outstanding
 * against a pin.
 * @purge {string} source of requests to force-purge
 * @private
 */
Pin.prototype.purgeRequests = function(purge) {
    var reqs = this.requests;
    for (var i = 0; i < reqs.length;) {
        if (reqs[i].source === purge
            || Time.now() > reqs[i].until) {
            console.TRACE(TAG, "Expire/purge request ", reqs[i]);
            reqs.splice(i, 1);
        } else
            i++;
    }
};

/**
 * Add a request.
 * Requests time out after a period of time.
 * Active requests for state 0 override those for state 1.
 * @param {object} request { until: epoch ms, state: 1|0, source: string }
 */ 
Pin.prototype.addRequest = function(request) {
    console.TRACE(TAG, "Add request ", request);
    this.purgeRequests(request.source);
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
