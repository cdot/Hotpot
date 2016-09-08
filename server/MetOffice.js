/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
/*
 * @module MetOffice
 */

/*eslint-env node */

const Q = require("q");
const Fs = require("fs");
const Http = require("follow-redirects").http;
const Url = require("url");

const Location = require("../common/Location.js");
const Time = require("../common/Time.js");

const Utils = require("../common/Utils");

/** @private */
const USUAL_PATH = "/public/data/val/wxfcs/all/json/";

/** @private */
const TAG = "MetOffice";

/** @private */
const IS_NUMBER = [
    "Feels Like Temperature",
    "Screen Relative Humidity",
    "Wind Speed",
    "Temperature"
];

/**
 * Reference implementation of a weather service.
 *
 * None of the methods here (other than the constructor) are used by the
 * Hotpot system. Authors of rules can call any of the methods in your
 * own implementation simply by calling e.g.
 * this.weather.get("Feels Like Temperature")
 *
 * Note that nothing will happen until you call setLocation to set the
 * location for which the weather is being received (which must not be
 * done before you have called initialise())
 *
 * This reference implementation gets current and predicted
 * weather information from the UK Met Office 3 hourly forecast updates.
 * It then performs a simple interpolation to guess the current weather at
 * the server location.
 * @param {Config} config configuration
 * * `class`: name of this class
 * * `api_key`: API key for requests to the Met Office website
 * * `history`: Historian configuration for recording outside temperature
 * @class
 */
var MetOffice = function(config) {
    "use strict";
    this.url = Url.parse("http://datapoint.metoffice.gov.uk");
    this.name = "MetOffice";
    this.config = config;
    this.api_key = "?key=" + config.api_key;
    var hc = config.history;
    if (typeof hc !== "undefined") {
        var Historian = require("./Historian");
        this.historian = new Historian({
            name: this.name,
            file: hc.file,
            unordered: true
        });
    }
};

/**
 * Return a promise to initialise the agent
 */
MetOffice.prototype.initialise = function() {
    return Q();
}

/**
 * Return a promoise to set the lat/long of the place we are getting
 * weather data for
 * @param {Location} loc where
 */
MetOffice.prototype.setLocation = function(loc) {
    "use strict";
    var self = this;
    loc = new Location(loc);
    Utils.TRACE(TAG, "Set location ", loc);
    return this.findNearestLocation(loc)
    .then(function() {
        self.update();
    });
};

/**
 * Get a promise for the current state of the weather forecast. This
 * is just the estimated outside temperature.
 * @return {Promise} a promise, passed a structure containing the
 * current outside temperature
 */
MetOffice.prototype.getSerialisableState = function() {
    var self = this;
    return Q.fcall(function() {
        return { temperature: self.get("Temperature") };
    });
};

/**
 * Get a promise for the current log of the weather forecast. This
 * simply records the estimated outside temperature.
 */
MetOffice.prototype.getSerialisableLog = function() {
    "use strict";
    if (!this.historian)
        return Q();
    return this.historian.getSerialisableHistory();
};

/**
 * Process a list of locations returned by the weather service
 * to find the ID of the closest.
 * @param {Location} loc where is "here"
 * @param data data returned from the metoffice server
 * @private
 */
MetOffice.prototype.findClosest = function(data, loc) {
    "use strict";

    var list = data.Locations.Location;
    var best, mindist = Number.MAX_VALUE;
    for (var i in list) {
        var ll = new Location(list[i]);
        var dist = ll.haversine(loc);
        if (dist < mindist) {
            mindist = dist;
            best = list[i];
        }
    }
    Utils.TRACE(TAG, "Nearest location is ", best.name, " at ",
                new Location(best));
    this.location_id = best.id;
};

/**
 * Return a  promise to find the ID of the nearest location to the
 * given lat,long.
 * @param {Location} loc where is "here"
 * @private
 */
MetOffice.prototype.findNearestLocation = function(loc) {
    "use strict";

    var self = this;

    var path = USUAL_PATH + "sitelist" + this.api_key;
    var options = {
        protocol: this.url.protocol,
        hostname: this.url.hostname,
        port: this.url.port,
        path: path
    };

    return Q.Promise(function(resolve, reject) {
        Http.get(
            options,
            (res) => {
                var result = "";
                if (res.statusCode < 200 || res.statusCode > 299) {
                    reject(new Error(
                        TAG + " failed to load sitelist, status: "
                            + res.statusCode));
                    return;
                }
                res.on("data", function(chunk) {
                    result += chunk;
                });
                res.on("end", function() {
                    self.findClosest(JSON.parse(result), loc);
                    resolve();
                });
            })
        .on("error", (err) => {
            Utils.ERROR(TAG, "Failed to GET from ", url, ": ", err.toString());
            reject(err);
        });
    });
};

/**
 * Bracket the weather information returned, pulling out the information
 * for the time previous to now and the next predicted time and storing
 * them in "before" and "after" fields, and storing the temperature history
 * in the historian.
 * @private
 */
MetOffice.prototype.analyseWeather = function(data) {
    "use strict";

    var lu = data.SiteRep.Wx.Param;
    var s2c = { "$": "$" }, i, j, k;
    for (i in lu)
        s2c[lu[i].name] = lu[i].$;

    this.before = null;
    this.after = null;
    var periods = data.SiteRep.DV.Location.Period;

    for (i in periods) {
        var period = periods[i];
        var baseline = Date.parse(period.value) / 1000;

        var dvs = period.Rep;
        for (j in dvs) {
            var report = {};
            for (k in dvs[j]) {
                var key = s2c[k];
                if (IS_NUMBER.indexOf(key) >= 0)
                    report[key] = parseFloat(dvs[j][k]);
                else
                    report[key] = dvs[j][k];
            }
            // Convert baseline from minutes into epoch s
            report.$ = baseline + report.$ * 60;
            if (this.historian)
                this.historian.record(report.Temperature, report.$);
            if (report.$ <= Time.nowSeconds()) {
                if (!this.before || this.before.$ < report.$) {
                    this.before = report;
                    Utils.TRACE(TAG, "Before ", report.Temperature,
                               " ", Date, new Date(report.$ * 1000));
                }
            } else if (!this.after || this.after.$ > report.$) {
                this.after = report;
                Utils.TRACE(TAG, "After ", report.Temperature,
                               " ", Date, new Date(report.$ * 1000));
            }
        }
    }
};

/**
 * Return a promise to get the forecast for the current time
 * @private
 */
MetOffice.prototype.getWeather = function() {
    "use strict";

    if (typeof this.after !== "undefined"
        && Time.nowSeconds() < this.after.$) {
        return Q();
    }

    var self = this;
    var path = USUAL_PATH + "sitelist" + this.api_key;
    var options = {
        protocol: this.url.protocol,
        hostname: this.url.hostname,
        port: this.url.port,
        path: USUAL_PATH + this.location_id + this.api_key + "&res=3hourly"
    };

    return Q.Promise(function(fulfill, fail) {
        Http.get(
            options,
            (res) => {
                var result = "";
                res.on("data", function(chunk) {
                    result += chunk;
                });
                res.on("end", function() {
                    self.analyseWeather(JSON.parse(result));
                    fulfill();
                });
            })
            .on("error", (err) => {
                Utils.ERROR(TAG, "Failed to GET from ",
                            url, ": ", err.toString());
                fail(err);
            });
    });
};

/**
 * Update the current forecast from the metoffice, and schedule the
 * next update.
 * @private
 */
MetOffice.prototype.update = function() {
    "use strict";
    var self = this;
    Utils.TRACE(TAG, "Updating from MetOffice website");
    this.getWeather()
    .done(function() {
        var wait = self.after.$ - Time.nowSeconds();
        Utils.TRACE(TAG, "Next update in ", wait / 60, " minutes");
        setTimeout(function() {
            self.update();
        }, wait * 1000);
    });
};

/**
 * Get the current weather estimate for the given field. If the field
 * is a number, interpolate linearly between "before" and "after" to get
 * a midpoint.
 * @param {string} what the field name to interpolate
 * e.g. "Feels Like Temperature"
 * @return the weather item
 * @public
 */
MetOffice.prototype.get = function(what) {
    "use strict";
    if (typeof this.before === "undefined")
        return 0;
    var est = this.before[what];
    if (this.after[what] !== est && IS_NUMBER.indexOf(what) >= 0) {
        var frac = (Time.nowSeconds() - this.before.$)
            / (this.after.$ - this.before.$);
        est += (this.after[what] - est) * frac;
    }
    return est;
};

module.exports = MetOffice;
