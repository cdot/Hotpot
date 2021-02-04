/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/
/*
 * @module MetOffice
 */

/*eslint-env node */

define("server/js/MetOffice", ["follow-redirects", "url", "common/js/Location", "common/js/Time", "common/js/Utils", "common/js/DataModel", "server/js/Historian"], function(Follow, Url, Location, Time, Utils, DataModel, Historian) {

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
     * Note that nothing will happen until you call setLocation to set the
     * location for which the weather is being received (which must not be
     * done before you have called initialise())
     *
     * This reference implementation gets current and predicted
     * weather information from the UK Met Office 3 hourly forecast updates.
     * It then performs a simple interpolation to guess the current weather at
     * the server location.
     * @param {object} proto prototype
     * @class
     */
    class MetOffice {

        constructor(proto) {
            Utils.extend(this, proto);
            this.url = Url.parse("http://datapoint.metoffice.gov.uk");
            this.name = "MetOffice";
            this.log = [];
        }

        /**
         * Return a promise to initialise the agent
         */
        initialise() {
            return Promise.resolve();
        };

        /**
         * Return a promise to set the lat/long of the place we are getting
         * weather data for. This will start the automatic updater that will
         * refresh the weather cache with new data as and when it comes available.
         * @param {Location} loc where
         */
        setLocation(loc) {
            loc = new Location(loc);
            Utils.TRACE(TAG, "Set location ", loc);
            return this.findNearestLocation(loc)
            .then(() => this.update(true));
        };

        /**
         * Stop the automatic updater.
         */
        stop() {
            if (typeof this.updateTimer !== undefined) {
                Utils.cancelTimer(this.updateTimer);
                delete this.updateTimer;
                Utils.TRACE(TAG, "Stopped");
            }
        };

        /**
         * Promise to get serialisable configuration. See common/DataModel
         */
        getSerialisable(context) {
            return DataModel.getSerialisable(
                this.history, Historian.Model, context.concat('history'))

            .then(h => {
                return {
                    api_key: this.api_key,
                    history: h
                }
            });
        };

        /**
         * Get a promise for the current state of the weather forecast. This
         * is just the estimated outside temperature.
         * @return {Promise} a promise, passed a structure containing the
         * current outside temperature
         */
        getSerialisableState() {
            return Promise.resolve({ temperature: this.get("Temperature") });
        };

        /**
         * Get a promise for the current log of the weather forecast. This
         * simply records the estimated outside temperature.
         * @param since optional param giving start of logs as a ms datime
         */
        getSerialisableLog(since) {
            if (!this.history)
                return Promise.resolve();
            return this.history.getSerialisableHistory(since)
            .then(h => {
                // Clip to the current time
                let before = -1,
                    after = -1;
                let now = Date.now();
                for (let i = 1; i < h.length; i += 2) {
                    if (h[0] + h[i] <= now)
                        before = i;
                    else {
                        after = i;
                        break;
                    }
                }
                let est;
                if (before >= 0 && after > before) {
                    est = h[before + 1];
                    if (h[after + 1] !== est) {
                        let frac = ((now - h[0]) - h[before]) / (h[after] - h[before]);
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
        findClosest(data, loc) {

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
        findNearestLocation(loc) {
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
                            this.findClosest(JSON.parse(result), loc);
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
        buildLog(data) {
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
         * @private
         */
        getWeather() {
            if (typeof this.after !== "undefined" &&
                Date.now() < this.after.$) {
                return Promise.resolve();
            }

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
                            this.buildLog(JSON.parse(result));
                            fulfill();
                        });
                    })
                .on("error", err => {
                    Utils.TRACE(TAG, "Failed to GET weather: ", err.toString());
                    fail(err);
                });
            });
        };

        bracket() {
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
         * Update the current forecast from the metoffice, and schedule the
         * next update.
         * @private
         */
        update() {
            Utils.TRACE(TAG, "Updating from MetOffice website");
            return this.getWeather()
            .then(() => {
                let br = this.bracket();
                this.last_update = Date.now();
                let wait = br.after.$ - this.last_update;
                Utils.TRACE(TAG, "Next update in ", wait / 60000, " minutes");
                this.updateTimer = Utils.startTimer(
					"meto", () => { this.update(); }, wait);
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
        get(what) {
            let b = this.bracket();
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

		/**
		 * Clear the update timer
		 */
		stop() {
			Utils.TRACE(TAG, `'${this.name}' stopped`);
            if (this.updateTimer) {
                Utils.cancelTimer(this.updateTimer);
				delete this.updateTimer;
			}
		}
    }

    MetOffice.Model = {
        $class: MetOffice,
        api_key: {
            $class: String,
            $doc: "API key for requests to the Met Office website"
        },
        history: Utils.extend({
            $optional: true
        }, Historian.Model)
    };

    return MetOffice;
});
