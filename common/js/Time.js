/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser,node */

const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms

define("common/js/Time", function() {
    /**
     * Functions for handling times within the current 24 hour period.
     * Use Time.now() rather than Date.now() so that tests can be written
     * that change the current date/time.
     * @namespace
     */
    let Time = {
        now: Date.now
    };

    /**
     * Debug support. Force now to a specific time until unset.
     */
    Time.force = function (now) {
        now = Date.parse(now);
        Time.now = function () {
            return now;
        };
    };

    /**
     * Debug support. Revert to system time
     */
    Time.unforce = function () {
        Time.now = Date.now;
    };

    /**
     * Get midnight, today, as a number of ms since the epoch
     * @return {number} midnight as number of ms since epoch
     */
    Time.midnight = function () {
        "use strict";
        let d = new Date(Time.now());
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };

    /**
     * Parse a server local time HH[:MM[:SS]] string to a number of ms offset
     * from midnight.
     * Times must be in the range 00:00:00..23:59:59
     * @param {string} s time string
     * @return {number} number of ms since midnight
     */
    Time.parse = function (str) {
        "use strict";
        let hms = str.split(":");
        let h = Number.parseInt(hms.shift());
        let m = Number.parseInt(hms.shift() || "0");
        let s = Number.parseFloat(hms.shift() || "0");
        // Set according to local time
        if (h > 23 || m > 59 || s >= 60 || h < 0 || m < 0 || s < 0)
            throw new Utils.exception("Time", "out of range 00:00:00..23:59:59");
        return (((h * 60) + m) * 60 + s) * 1000;
    };

    /**
     * Get the current time in s
     * @return current time in epoch seconds
     */
    Time.nowSeconds = function () {
        "use strict";
        return Time.now() / 1000;
    };

    /**
     * Get the current time as an offset in ms from the preceding midnight
     */
    Time.time_of_day = function () {
        return Time.now() - Time.midnight();
    };

    /**
     * Generate a string that gives the given number of ms since midnight as
     * a time string suitable for use with Time.parse
     * @param {number} number of ms since midnight
     * @result {string} string representation
     */
    Time.unparse = function (t) {
        function pad(n, w) {
            let k = Math.trunc(n);
            let pad = "";
            for (let pl = w - ("" + k).length; pl > 0; pl--)
                pad += "0";
            return pad + n;
        }
        if (t < 0 || t > ONE_DAY)
            throw new Utils.exception("Time", "unparse time out of range");
        let ms = t % 1000;
        t = Math.trunc(t / 1000); // to seconds
        let s = t % 60; // seconds
        t = Math.trunc(t / 60); // to minutes
        let m = Math.trunc(t % 60); // minutes
        let h = Math.trunc(t / 60); // hours
        let ts = pad(h, 2) + ":" + pad(m, 2);
        if (s + ms > 0) {
            ts += ":" + pad(s, 2);
            if (ms > 0)
                ts += "." + pad(ms, 3);
        }
        return ts;
    };

	/**
	 * Generate a time difference as an HMS string
	 * @param ms delta time in ms
	 */
	Time.formatDelta = function (ms) {
		let h = Math.floor(ms / (60 * 60 * 1000))
		ms %= 60 * 60 * 1000;
		let m = Math.floor(ms / (60 * 1000));
		ms %= 60 * 1000;
		let s = Math.floor(ms / 1000);
		let d = ((h > 0) ? `${h}h` : "")
			+ ((m > 0) ? `${m}m` : "")
			+ ((s > 0) ? `${s}s` : "");
		return (d === "") ? "0s" : d;
	}

    return Time;
});
