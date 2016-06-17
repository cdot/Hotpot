/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Get current and predicted weather information from the UK
 * Met Office 3 hourly forecast updates.
 */
const Utils = require("./Utils.js");
const http = require("follow-redirects").http;
const Server = require("./Server.js");

const URL_ROOT = "http://datapoint.metoffice.gov.uk/public/data/val/wxfcs/";

const TAG = "MetOffice";

const IS_NUMBER = [
    "Feels Like Temperature",
    "Wind Gust",
    "Screen Relative Humidity",
    "Precipitation Probability",
    "Wind Speed",
    "Temperature",
    "Weather Type",
    "Max UV Index"
];

var MetOffice = function() {
    "use strict";
    // this.cached_id
    // this.before
    // this.after
    this.update();
};

/**
 * @private
 * Get the API key from the server config
 */
MetOffice.prototype.api_key = function() {
    "use strict";
    return "?key=" + Server.getConfig().getConfig("weather").get("api_key");
};

/**
 * @private
 * Process a list of locations returned by the weather service
 * to find the ID of the closest.
 * @param data data returned from the metoffice server
 * @param callback function to call when finished, passing the id
 */
MetOffice.prototype.findClosest = function(data, callback) {
    "use strict";
    var list = data.Locations.Location;
    var best, mindist = Number.MAX_VALUE;
    var here = Server.getConfig().get("location");
    for (var i in list) {
        var dist = Utils.haversine(here, list[i]);
        if (dist < mindist) {
            mindist = dist;
            best = list[i];
        }
    }
    console.TRACE(TAG, "Nearest location is " + best.name);
    this.cached_id = best.id;
    callback.call(this, best.id);
};

/**
 * @private
 * Find the ID of the nearest location to the given lat,long.
 * @param callback function called when the ID has been determined
 */
MetOffice.prototype.findNearestLocation = function(callback) {
    "use strict";
    if (typeof this.cached_id !== "undefined") {
        // Don't request again
        callback.call(self, this.cached_id);
        return;
    }

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
                self.findClosest(JSON.parse(result), callback);
            });
        })
        .on("error", function(err) {
            console.error("Failed to GET from " + url + ": " + err);
        });
};

/**
 * @private
 * Bracket the weather information returned, pulling out the information
 * for the time previous to now and the next predicted time and storing
 * them in "before" and "after" fields.
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
            if (time.valueOf() < Date.now())
                this.before = report;
            else {
                this.after = report;
                //console.TRACE(TAG, "Before " + Utils.dump(this.before) + " after " + Utils.dump(this.after));
                return;
            }
        }
    }
};

/**
 * @private
 * Get the forecast (before and after) for the current time for the
 * given location.
 * @param {string} id uid of the location
 * @param {function} callback function to call on this when complete
 * (no parameters)
 */
MetOffice.prototype.getWeather = function(id, callback) {
    "use strict";

    if (typeof this.after !== "undefined"
        && Date.now() < this.after.$) {
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
            console.error("Failed to GET from " + url + ": " + err);
        });
};

MetOffice.prototype.update = function() {
    "use strict";
    var self = this;
    this.findNearestLocation(function(id) {
        this.getWeather(id, function() {
            var wait = self.after.$ - Date.now();
            console.TRACE(TAG, "Next update in "
                          + (wait / 60000) + " minutes");
            setTimeout(function() {
                self.update();
            }, wait);
        });
    });
};

/**
 * Interpolate linearly between "before" and "after" to get a midpoint for
 * the given field (only useful for numerical fields such as pressure,
 * temperature.
 * @param {string} what the field name to interpolate
 * e.g. "Feels Like Temperature"
 * @return the weather item
 */
MetOffice.prototype.get = function(what) {
    "use strict";
    var est = this.before[what];
    if (this.after[what] !== est && IS_NUMBER.indexOf(what) >= 0) {
        var frac = (Date.now() - this.before.$)
            / (this.after.$ - this.before.$);
        est += (this.after[what] - est) * frac;
    }
    return est;
};

module.exports = new MetOffice();
