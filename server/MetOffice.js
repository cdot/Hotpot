/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
/*
 * @module MetOffice
 */

/*eslint-env node */

const http = require("follow-redirects").http;

//const Utils = require("../common/Utils.js");
const Location = require("../common/Location.js");

const Apis = require("./Apis.js");
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
 * @class
 * @protected
 */
var MetOffice = function() {
    "use strict";
    Utils.TRACE(TAG, "starting");
    // this.before = undefined
    // this.after = undefined
    // this.location_id = undefined;
};

/**
 * Get the API key from the server config
 * @private
 */
MetOffice.prototype.api_key = function() {
    "use strict";
    return "?key=" + Apis.get("weather").api_key;
};

/**
 * Set the lat/long of the place we are getting weather data for
 *@param {Location} loc where
 */
MetOffice.prototype.setLocation = function(loc) {
    "use strict";
    var self = this;
    this.findNearestLocation(loc, function() { self.update(); });
};

/**
 * Process a list of locations returned by the weather service
 * to find the ID of the closest.
 * @param {Location} loc where is "here"
 * @param data data returned from the metoffice server
 * @param {function} chain a function to call when we've got a result
 * @private
 */
MetOffice.prototype.findClosest = function(data, loc, chain) {
    "use strict";

    var list = data.Locations.Location;
    var best, mindist = Number.MAX_VALUE;
    for (var i in list) {
        var ll = new Location(list[i]);
        var dist = loc.haversine(ll);
        if (dist < mindist) {
            mindist = dist;
            best = list[i];
        }
    }
    Utils.TRACE(TAG, "Nearest location is ", best.name, " at ",
                  new Location(best));
    this.location_id = best.id;
    if (typeof chain === "function")
        chain();
};

/**
 * Find the ID of the nearest location to the given lat,long.
 * @param {Location} loc where is "here"
 * @param {function} chain a function to call when we've got a result
 * @private
 */
MetOffice.prototype.findNearestLocation = function(loc, chain) {
    "use strict";

    var self = this;

    var url = URL_ROOT + "all/json/sitelist" + this.api_key();
    http.get(
        url,
        function(res) {
            var result = "";
            res.on("data", function(chunk) {
                result += chunk;
            });
            res.on("end", function() {
                self.findClosest(JSON.parse(result), loc, chain);
            });
        })
        .on("error", function(err) {
            console.ERROR(TAG, "Failed to GET from " + url + ": " + err);
        });
};

/**
 * Bracket the weather information returned, pulling out the information
 * for the time previous to now and the next predicted time and storing
 * them in "before" and "after" fields.
 * @private
 */
MetOffice.prototype.bracketWeather = function(data) {
    "use strict";

    var lu = data.SiteRep.Wx.Param;
    var s2c = { "$": "$" }, i, j, k;
    for (i in lu)
        s2c[lu[i].name] = lu[i].$;

    var periods = data.SiteRep.DV.Location.Period;
    for (i in periods) {
        var period = periods[i];
        var baseline = Date.parse(period.value).valueOf();
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
            var time = new Date(baseline + report.$ * 60 * 1000);
            report.$ = time.valueOf();
            if (time.valueOf() < Time.now())
                this.before = report;
            else {
                this.after = report;
                //Utils.TRACE(TAG, "Before ", this.before, " after ", this.after));
                return;
            }
        }
    }
};

/**
 * Get the forecast (before and after) for the current time for the
 * given location.
 * @param {string} id uid of the location
 * @param {function} callback function to call on this when complete
 * (no parameters)
 * @private
 */
MetOffice.prototype.getWeather = function(id, callback) {
    "use strict";

    if (typeof this.after !== "undefined"
        && Time.now() < this.after.$) {
        callback.call(self);
    }

    var self = this;
    var url = URL_ROOT + "all/json/" + id + this.api_key() + "&res=3hourly";
    http.get(
        url,
        function(res) {
            var result = "";
            res.on("data", function(chunk) {
                result += chunk;
            });
            res.on("end", function() {
                self.bracketWeather(JSON.parse(result));
                callback.call(self);
            });
        })
        .on("error", function(err) {
            console.ERROR(TAG, "Failed to GET from " + url + ": " + err);
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
    this.getWeather(this.location_id, function() {
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

module.exports = new MetOffice();
