/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
/*
 * @module MetOffice
 */

/*eslint-env node */

const Q = require("q");
const http = require("follow-redirects").http;

const Location = require("../common/Location.js");
const Time = require("../common/Time.js");

const Utils = require("../common/Utils");

/** @private */
const URL_ROOT = "http://datapoint.metoffice.gov.uk/public/data/val/wxfcs/";

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
 * location for which the weather is being received.
 *
 * This reference implementation gets current and predicted
 * weather information from the UK Met Office 3 hourly forecast updates.
 * It then performs a simple interpolation to guess the current weather at
 * the server location.
 * @param {Config} config configuration
 * * `class`: name of this class
 * * `api_key`: API key for requests to the Met Office website
 * * `history`: Historian configuration for recording outside temperature
 * @param {Location} location (optional) location (can be set later)
 * @class
 */
var MetOffice = function(config, location) {
    "use strict";
    this.name = "MetOffice";
    this.config = config;
    this.api_key = "?key=" + config.api_key;
    if (typeof location !== "undefined")
        this.setLocation(location);
    var hc = config.history;
    if (typeof hc !== "undefined") {
        var Historian = require("./Historian");
        this.historian = new Historian({
            name: this.name,
            file: hc.file,
            unique: true
        });
    }
};

/**
 * Return a promoise to set the lat/long of the place we are getting weather data for
 * @param {Location} loc where
 */
MetOffice.prototype.setLocation = function(loc) {
    "use strict";
    var self = this;
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
 * Returna  promise to find the ID of the nearest location to the
 * given lat,long.
 * @param {Location} loc where is "here"
 * @private
 */
MetOffice.prototype.findNearestLocation = function(loc) {
    "use strict";

    var self = this;

    var url = URL_ROOT + "all/json/sitelist" + this.api_key;
    return Q.Promise(function(resolve, reject) {
        http.get(
            url,
            function(res) {
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
        .on("error", function(err) {
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

    var periods = data.SiteRep.DV.Location.Period;
    for (i in periods) {
        var period = periods[i];
        var baseline = Date.parse(period.value);

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
            // Convert baseline from minutes into epoch ms
            report.$ = baseline + report.$ * 60 * 1000;
            if (report.$ <= Time.now()) {
                if (this.historian)
                    this.historian.record(report.Temperature, report.$ / 1000);
                this.before = report;
            } else {
                this.after = report;
                //Utils.TRACE(TAG, "Before ", this.before, " after ", this.after));
                return;
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
        && Time.now() < this.after.$) {
        return Q();
    }

    var self = this;
    var url = URL_ROOT + "all/json/" + this.location_id
        + this.api_key + "&res=3hourly";
    return Q.Promise(function(fulfill, fail) {
        http.get(
            url,
            function(res) {
                var result = "";
                res.on("data", function(chunk) {
                    result += chunk;
                });
                res.on("end", function() {
                    self.analyseWeather(JSON.parse(result));
                    fulfill();
                });
            })
            .on("error", function(err) {
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
        var wait = self.after.$ - Time.now();
        Utils.TRACE(TAG, "Next update in ", wait / 60000, " minutes");
        setTimeout(function() {
            self.update();
        }, wait);
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
        var frac = (Time.now() - this.before.$)
            / (this.after.$ - this.before.$);
        est += (this.after[what] - est) * frac;
    }
    return est;
};

module.exports = MetOffice;
