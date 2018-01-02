/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Q = require("q");

const Utils = require("../common/Utils");
const Timeline = require("../common/Timeline");
const Historian = require("./Historian");

const TAG = "Thermostat";

// Default interval between polls
const DEFAULT_POLL_INTERVAL = 1; // seconds

// Singleton driver interface to DS18x20 thermometers
var ds18x20;

/**
 * Interface to a DS18x20 thermostat. This object takes care of polling the
 * device for regular temperature updates that can then be read from the
 * object.
 *
 * A thermostat also maintains one or more Requests. These are used to
 * record a requirement for a target temperature for a thermostat:
 * ```
 * Request {
 *   until: epoch ms || "boost",
 *   target: number,
 *   source: string
 * }
 * ```
 * Requests have an `until` field that is used to set the expiry of the
 * request.
 *
 * "boost" is a special until value that is used to bring a thermostat up
 * to a target temperature and then revert to the rules.
 *
 * target gives the target temperature for the thermostat, overriding the
 * temperature from the timeline.
 *
 * Where two sources both request different targets, then the request that
 * expires first applies. If they both expire at the same time, then the
 * most recent request received applies.
 *
 * @class
 * @param name {String} name by which the caller identifies the thermostat
 * @param proto configuration for the thermostat - see
 * Thermostat.Model
 */
function Thermostat(proto, name) {
    "use strict";

    Utils.extend(this, proto);

    // Name of the thermostat e.g. "HW"
    this.name = name;

    /** @property {object} requests map of lists of requests, one per service
     * (see #addRequest) */
    this.requests = [];

    if (!ds18x20) {
        // Load the driver asynchronously
        if (typeof HOTPOT_DEBUG !== "undefined")
            ds18x20 = HOTPOT_DEBUG.ds18x20;
        else
            ds18x20 = require("ds18x20");

        if (!ds18x20.isDriverLoaded())
            ds18x20.loadDriver();
    }

    // Last recorded temperature {float}
    this.temperature = 0;

    // Temperature history, sample on a time schedule
    var self = this;
    var hc = this.history;
    if (typeof hc !== "undefined") {
        if (typeof hc.interval === "undefined")
            hc.interval = 300; // 5 minutes
        hc.sample = function () {
            // Only log temperatures to one decimal place
            return Math.round(self.temperature * 10) / 10;
        };
    }

    if (typeof HOTPOT_DEBUG !== "undefined")
        HOTPOT_DEBUG.mapThermostat(this);
}

Thermostat.Model = {
    $class: Thermostat,
    id: {
        $class: String,
        $doc: "unique ID used to communicate with this thermostat"
    },
    timeline: Timeline.Model,
    history: Utils.extend({
        $optional: true
    }, Historian.Model)
};

/**
 * Return a promise to intiialise the thermostat with a valid value read
 * from the probe
 */
Thermostat.prototype.initialise = function () {
    var self = this;

    return Q.Promise(function (resolve, reject) {
        ds18x20.get(self.id, function (err, temp) {
            if (err !== null) {
                Utils.ERROR(TAG, "d218x20 error: ", err);
                reject(err);
            } else {
                if (typeof temp !== "number")
                    // At least once this has been "boolean"!
                    reject("Unexpected result from ds18x20.get");
                self.temperature = temp;
                // Start the polling loop
                self.pollTemperature();
                // Start the historian
                if (self.history)
                    self.history.start(function () {
                        return self.temperature;
                    });
                Utils.TRACE(TAG, "'", self.name, "' intialised");
                resolve();
            }
        });
    });
};
module.exports = Thermostat;

/**
 * Generate and return a promise for a serialisable version of the state
 * of the object, suitable for use in an AJAX response.
 * @return {Promise} a promise
 * @protected
 */
Thermostat.prototype.getSerialisableState = function () {
    "use strict";
    this.purgeRequests();
    var data = {
        temperature: this.temperature,
        target: this.getTargetTemperature(),
        requests: this.requests
    };
    return Q.fcall(function () {
        return data;
    });
};

/**
 * Synchronously get the temperature history of the thermostat as a
 * serialisable structure. Note that the history is sampled at intervals,
 * but not every sample time will have a event. The history is only
 * updated if the temperature changes.
 * @return {Promise} promise to get an array of alternating times and
 * temps. Times are all relative to a base time, which is in the first
 * array element.
 * @param since optional param giving start of logs as a ms datime
 * @protected
 */
Thermostat.prototype.getSerialisableLog = function (since) {
    "use strict";
    if (!this.history)
        return Q();
    return this.history.getSerialisableHistory(since);
};

/**
 * Function for polling thermometers
 * Thermostats are polled every second for new values; results are returned
 * asynchronously and cached in the Thermostat object
 * @private
 */
Thermostat.prototype.pollTemperature = function () {
    "use strict";

    var self = this;

    ds18x20.get(self.id, function (err, temp) {
        if (err !== null) {
            Utils.ERROR(TAG, "Sensor error: ", err);
        } else {
            if (typeof temp === "number")
                // At least once this has been "boolean"!
                self.temperature = temp;
            setTimeout(function () {
                    self.pollTemperature();
                }, typeof self.poll_interval === "undefined" ?
                DEFAULT_POLL_INTERVAL :
                self.poll_interval);
        }
    });
};

/**
 * Get the target temperature specified by the timeline for this thermostat
 * at the current time. This may be overridden by a request.
 */
Thermostat.prototype.getTargetTemperature = function () {
    this.purgeRequests();
    if (this.requests.length > 0) {
        // The most recent boost request
        for (var i = this.requests.length - 1; i >= 0; i--)
            if (this.requests[i].until == "boost")
                return this.requests[i].target;
        // Otherwise the most recently-added request
        return this.requests[this.requests.length - 1].target;
    }
    return this.timeline.valueAtTime(Time.time_of_day());
};

/**
 * Get the maximum temperature allowed by the timeline for this thermostat
 * at any time.
 */
Thermostat.prototype.getMaximumTemperature = function () {
    return this.timeline.getMaxValue();
};

/**
 * Add a request. A request is an override for rules that suspends the
 * normal rules either for a period of time ('until' is a number), or until
 * the rules purge the request. A controller may have multiple requests, but
 * only one request from each source is kept.
 * When it adds a request it purges all existing requests from the same source
 * before adding the new request.
 * Where multiple sources have active request on the same service, then the
 * service resolves which requests win.
 * @private
 */
Thermostat.prototype.addRequest = function (source, target, until) {
    if (source)
        this.purgeRequests({
            source: source
        });

    var req = {
        source: source,
        target: target,
        until: until
    };

    Utils.TRACE(TAG, "Add request ", this.name, " ", req);
    this.requests.push(req);
};

/**
 * Purge requests that have timed out, or are force-purged by matching
 * the parameters.
 * @param match map of request fields to match
 * @private
 */
Thermostat.prototype.purgeRequests = function (match) {
    if (match)
        Utils.TRACE(TAG, "Purge ", this.name, match);
    match = match || {};
    var reqs = this.requests;
    for (var i = 0; i < reqs.length; i++) {
        var r = reqs[i];
        var purge = false;
        for (var k in match) {
            purge = true;
            if (k !== "service" && r[k] !== match[k]) {
                purge = false;
                break;
            }
        }
        if (r.until == "boost") {
            if (this.temperature >= r.target ||
                this.temperature >= this.timeline.max) {
                purge = true;
                Utils.TRACE(TAG, "Purge because over temp");
            }
        } else if (r.until < Time.nowSeconds()) {
            purge = true;
            Utils.TRACE(TAG, "Purge because old");
        }
        if (purge) {
            Utils.TRACE(TAG, "Purge ", this.name, " request ", r);
            reqs.splice(i--, 1);
        }
    }
};