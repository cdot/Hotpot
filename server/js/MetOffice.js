/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/
/*
 * @module MetOffice
 */

/*eslint-env node */

define("server/js/MetOffice", ["follow-redirects", "url", "common/js/Location", "common/js/Time", "common/js/Utils", "common/js/DataModel", "server/js/Weather", "server/js/Historian"], function (Follow, Url, Location, Time, Utils, DataModel, Weather, Historian) {

    const Http = Follow.http;

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
     * This reference implementation gets current and predicted
     * weather information from the UK Met Office 3 hourly forecast updates.
     * It then performs a simple interpolation to guess the current weather at
     * the server location.
     * @param {object} proto prototype
     * @extends Weather
     */
    class MetOffice extends Weather {

        constructor(proto) {
			super(proto, "MetOffice");
			/**
			 * MetOffice URL
			 * @member {string}
			 */
            this.url = Url.parse("http://datapoint.metoffice.gov.uk");
			/**
			 * Log of updates. Each update contains the fields provided
			 * by the MetOffice service. The `$` field is converted from
			 * minutes to epoch ms.
			 * @member {object[]}
			 */
            this.log = [];
        }

        /**
         * Return a promise to set the lat/long of the place we are
         * getting weather data for. This will start the automatic
         * updater that will refresh the weather cache with new data
         * as and when it comes available.
         * @param {Location} loc where
         */
        setLocation(loc) {
            Utils.TRACE(TAG, "Set location ", loc);
            return this._findNearestLocation(loc)
            .then(() => super.setLocation(loc));
        };

        /**
         * Get a promise for the current state of the weather forecast. This
         * is just the estimated outside temperature.
         * @return {Promise} a promise, passed a structure containing the
         * current outside temperature
         */
        getSerialisableState() {
            return Promise.resolve({
                temperature: this.get("Temperature")
            });
        };

        /**
         * Process a list of locations returned by the weather service
         * to find the ID of the closest.
         * @param {Location} loc where is "here"
         * @param {object} data data returned from the metoffice server
         * @private
         */
        _findClosest(data, loc) {
            let list = data.Locations.Location;
            let best, mindist = Number.MAX_VALUE;
            for (let i in list) {
                let ll = new Location(list[i]);
                let dist = ll.haversine(loc);
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
        _findNearestLocation(loc) {
            let path = `${USUAL_PATH}sitelist?key=${this.api_key}`;
            let options = {
                protocol: this.url.protocol,
                hostname: this.url.hostname,
                port: this.url.port,
                path: path
            };
            return new Promise((resolve, reject) => {
                Http.get(
                        options,
                        res => {
                            let result = "";
                            if (res.statusCode < 200 || res.statusCode > 299) {
                                reject(new Error(
                                    TAG + " failed to load sitelist, status: " +
                                    res.statusCode));
                                return;
                            }
                            res.on("data", chunk => {
                                result += chunk;
                            });
                            res.on("end", () => {
                                this._findClosest(JSON.parse(result), loc);
                                resolve();
                            });
                        })
                    .on("error", err => {
                        Utils.TRACE(TAG, "Failed to GET sitelist: ", err.toString());
                        reject(err);
                    });
            });
        };

        /**
         * Parse the weather information returned, pushing it into the log
         * and storing the temperature history in the historian.
         * @private
         */
        _buildLog(data) {
            if (!data.SiteRep) return;
            if (!data.SiteRep.Wx) return;
            if (!data.SiteRep.Wx.Param) return;

            let lu = data.SiteRep.Wx.Param;
            let s2c = {
                    "$": "$"
                },
                i, j, k;
            for (i in lu)
                s2c[lu[i].name] = lu[i].$;

            if (!data.SiteRep.DV) return;
            if (!data.SiteRep.DV.Location) return;

            let periods = data.SiteRep.DV.Location.Period;
            let rebased = false;
            let new_reports = 0;

            for (i = 0; i < periods.length; i++) {
                let period = periods[i];
                let baseline = Date.parse(period.value);

                let dvs = period.Rep;
                for (j = 0; j < dvs.length; j++) {
                    let report = {};
                    for (k in dvs[j]) {
                        let key = s2c[k];
                        if (IS_NUMBER.indexOf(key) >= 0)
                            report[key] = parseFloat(dvs[j][k]);
                        else
                            report[key] = dvs[j][k];
                    }
                    // Convert baseline from minutes into epoch ms
                    report.$ = baseline + report.$ * 60 * 1000;
                    if (this.history) {
                        this.history.record(report.Temperature, report.$);
                    }
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
		 * @override
         */
        getWeather() {
            if (typeof this.after !== "undefined" &&
                Date.now() < this.after.$) {
                return Promise.resolve();
            }

            Utils.TRACE(TAG, "Updating from MetOffice website");

            let options = {
                protocol: this.url.protocol,
                hostname: this.url.hostname,
                port: this.url.port,
                path: USUAL_PATH + this.location_id + "?key=" +
                    this.api_key + "&res=3hourly"
            };

            return new Promise((fulfill, fail) => {
                Http.get(
                        options,
                        res => {
                            let result = "";
                            res.on("data", chunk => {
                                result += chunk;
                            });
                            res.on("end", () => {
                                this._buildLog(JSON.parse(result));
                                fulfill();
                            });
                        })
                    .on("error", err => {
                        Utils.TRACE(TAG, "Failed to GET weather: ", err.toString());
                        fail(err);
                    });
            })
            .then(() => {
                let br = this._bracket();
                return br.after.$ - Date.now();
			});
        };

        _bracket() {
            let now = Date.now();
            let b = {};

            for (let i = 0; i < this.log.length; i++) {
                let report = this.log[i];
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
         * Get the current weather estimate for the given field. If the field
         * is a number, interpolate linearly to get a midpoint.
         * @param {string} what the field name to interpolate
         * e.g. "Feels Like Temperature"
         * @return {object} the weather item
         * @public
         */
        get(what) {
            let b = this._bracket();
            if (!b.before || !b.after)
                return 0;
            let est = b.before[what];
            if (b.after[what] !== est && IS_NUMBER.indexOf(what) >= 0) {
                let frac = (Date.now() - b.before.$) /
                    (b.after.$ - b.before.$);
                est += (b.after[what] - est) * frac;
            }
            return est;
        };
    }

    /**
     * Configuration model, for use with {@link DataModel}
	 * @typedef MetOffice.Model
     * @property {string} api_key API key for requests to the Met Office website
     */
    MetOffice.Model = Utils.extend(Weather.Model, {
        $class: MetOffice,
        api_key: {
            $class: String,
            $doc: "API key for requests to the Met Office website"
        }
    });

    return MetOffice;
});
