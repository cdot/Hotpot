/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
/*
 * @module MetOffice
 */

/*eslint-env node */

const Q = require("q");
const Http = require("follow-redirects").http;
const Url = require("url");

const Location = require("../common/Location.js");
const Time = require("../common/Time.js");

const Utils = require("../common/Utils");
const Config = require("../common/Config");
const Historian = require("./Historian");

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
 * @class
 */
var MetOffice = function(config) {
    "use strict";
    this.url = Url.parse("http://datapoint.metoffice.gov.uk");
    this.name = "MetOffice";
    this.config = config;
    Config.check(this.name, config, this.name, MetOffice.prototype.Config);
    this.api_key = "?key=" + config.api_key;
    this.log = [];
    var hc = config.history;
    if (typeof hc !== "undefined") {
        hc.unordered = true;
        this.historian = new Historian(this.name, hc);
    }
};

MetOffice.prototype.Config = {
    api_key: {
        $type: "string",
        $doc: "API key for requests to the Met Office website"
    },
    history: Utils.extend(Historian.prototype.Config, { $optional: true })
};

/**
 * Return a promise to initialise the agent
 */
MetOffice.prototype.initialise = function() {
    return Q();
};

/**
 * Return a promise to set the lat/long of the place we are getting
 * weather data for. This will start the automatic updater that will
 * refresh the weather cache with new data as and when it comes available.
 * @param {Location} loc where
 */
MetOffice.prototype.setLocation = function(loc) {
    "use strict";
    var self = this;
    loc = new Location(loc);
    Utils.TRACE(TAG, "Set location ", loc);
    return this.findNearestLocation(loc)
    .then(function() {
        return self.update(true);
    });
};

/**
 * Stop the automatic updater.
 */
MetOffice.prototype.stop = function() {
    if (typeof this.timeout !== undefined) {
        clearTimeout(this.timeout);
        delete this.timeout;
        Utils.TRACE(TAG, "Stopped");
    }
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
 * @param since optional param giving start of logs as a ms datime
 */
MetOffice.prototype.getSerialisableLog = function(since) {
    "use strict";
    if (!this.historian)
        return Q();
    return this.historian.getSerialisableHistory(since)
    .then(function(h) {
        // Clip to the current time
        var before = -1, after = -1;
        var now = Time.now();
        for (var i = 1; i < h.length; i += 2) {
            if (h[0] + h[i] <= now)
                before = i;
            else {
                after = i;
                break;
            }
        }
        var est;
        if (before >= 0 && after > before) {
            est = h[before + 1];
            if (h[after + 1] !== est) {
                var frac = ((now - h[0]) - h[before]) / (h[after] - h[before]);
                est += (h[after + 1] - est) * frac;
            }
        }
        h.splice(after);
        if (typeof est !== "undefined") {
            h.push(now - h[0]);
            h.push(est);
        }
        return h;
    });
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
            Utils.ERROR(TAG, "Failed to GET sitelist: ", err.toString());
            reject(err);
        });
    });
};

/**
 * Parse the weather information returned, pushing it into the log
 * and storing the temperature history in the historian.
 * @private
 */
MetOffice.prototype.buildLog = function(data) {
    "use strict";

    if (!data.SiteRep) return;
    if (!data.SiteRep.Wx) return;
    if (!data.SiteRep.Wx.Param) return;
    
    var lu = data.SiteRep.Wx.Param;
    var s2c = { "$": "$" }, i, j, k;
    for (i in lu)
        s2c[lu[i].name] = lu[i].$;

    if (!data.SiteRep.DV) return;
    if (!data.SiteRep.DV.Location) return;

    var periods = data.SiteRep.DV.Location.Period;
    var rebased = false;
    var new_reports = 0;

    for (i = 0; i < periods.length; i++) {
        var period = periods[i];
        var baseline = Date.parse(period.value);

        var dvs = period.Rep;
        for (j = 0; j < dvs.length; j++) {
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
            if (this.historian)
                this.historian.record(report.Temperature, report.$);
            if (!rebased) {
                // Delete log entries after the time of the current report
                for (k = 0; k < this.log.length; k++) {
                    if (this.log[k].$ >= report.$) {
                        this.log.splice(k);
                        break;
                    }
                }
                rebased = true;
            }
            this.log.push(report);
            new_reports++;
        }
    }
    Utils.TRACE(TAG, new_reports, " new reports");
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
    var options = {
        protocol: this.url.protocol,
        hostname: this.url.hostname,
        port: this.url.port,
        path: USUAL_PATH + this.location_id + this.api_key + "&res=3hourly"
    };

    return Q.Promise(function(fulfill, fail) {
        Http.get(
            options,
            function(res) {
                var result = "";
                res.on("data", function(chunk) {
                    result += chunk;
                });
                res.on("end", function() {
                    self.buildLog(JSON.parse(result));
                    fulfill();
                });
            })
            .on("error", function(err) {
                Utils.ERROR(TAG, "Failed to GET weather: ", err.toString());
                fail(err);
            });
    });
};

MetOffice.prototype.bracket = function() {
    var now = Time.now();
    var b = {};

    for (var i = 0; i < this.log.length; i++) {
        var report = this.log[i];
        if (report.$ <= now) {
            if (!b.before || b.before.$ < report.$)
                b.before = report;
        } else if (!b.after || b.after.$ > report.$) {
            b.after = report;
            break;
        }
    }
    return b;
};

/**
 * Update the current forecast from the metoffice, and schedule the
 * next update.
 * @private
 */
MetOffice.prototype.update = function() {
    "use strict";
    var self = this;
    if (self.timeout)
        clearTimeout(self.timeout);
    delete self.timeout;
    Utils.TRACE(TAG, "Updating from MetOffice website");
    return this.getWeather()
    .then(function() {
        var br = self.bracket();
        self.last_update = Time.now();
        var wait = br.after.$ - self.last_update;
        Utils.TRACE(TAG, "Next update in ", wait / 60000, " minutes");
        self.timeout = setTimeout(function() {
            self.update().done();
        }, wait);
    });
};

/**
 * Get the current weather estimate for the given field. If the field
 * is a number, interpolate linearly to get a midpoint.
 * @param {string} what the field name to interpolate
 * e.g. "Feels Like Temperature"
 * @return the weather item
 * @public
 */
MetOffice.prototype.get = function(what) {
    "use strict";

    var b = this.bracket();
    if (!b.before || !b.after)
        return 0;
    var est = b.before[what];
    if (b.after[what] !== est && IS_NUMBER.indexOf(what) >= 0) {
        var frac = (Time.now() - b.before.$)
            / (b.after.$ - b.before.$);
        est += (b.after[what] - est) * frac;
    }
    return est;
};

module.exports = MetOffice;
