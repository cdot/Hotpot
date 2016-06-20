/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * @module Time
 */
const ONE_DAY = 86400000; // one day in ms

/**
 * Functions for comparing times around the current time. All computations are
 * in Local time.
 * @ignore
 */
var Time = module.exports = {
    /**
     * Get midnight, today, as a Date
     * @return {Date} date object representing midnight
     */
    midnight: function() {
        "use strict";
        var d = new Date();
        // Get midnight, in ms
        return new Date(
            d.getFullYear(), d.getMonth(), d.getDate());
    },

    /**
     * Convert a HH[:MM] string to a Date
     * @param {string} s time
     * @return {Date} the date
     */
    parse: function(s) {
        "use strict";
        var d = Time.midnight();
        var hms = s.split(/:/);
        // Set according to local time
        d.setHours(hms[0], hms[1]);
        return d;
    },

    /**
     * Get the current time in ms
     * @return current time in epoch milliseconds
     */
    now: function() {
        "use strict";
        return (new Date()).getTime();
    },

    /**
     * Get the current time in s
     * @return current time in epoch seconds
     */
    nowSeconds: function() {
        "use strict";
        return (new Date()).getTime() / 1000;
    },

    /**
     * Determine if current time is between two times. t1 is assumed
     * to be in the current 24 hour period, t2 is always
     * taken to be after t1, even if that's tomorrow
     * @param {Date} t1 time, also accepts a string
     * @param {Date} t2 time, also accepts a string
     * @return boolean
     */
    between: function(t1, t2) {
        "use strict";
        if (typeof t1 === "string")
            t1 = Time.parse(t1);
        if (typeof t2 === "string")
            t2 = Time.parse(t2);

        if (t1.getTime() > t2.getTime())
            t2 = new Date(t2.getTime() + ONE_DAY);

        var now = Time.now();
        return (t1.getTime() <= now && now < t2.getTime());
    },

    /**
     * Determine if the given time was in the past
     * If no day/date is given, assumes the current 24 hour period
     * @return true if the current time is after the given time
     * @param {Date} t1 time, also accepts a string
     * @return boolean
     */
    after: function(t1) {
        "use strict";
        if (typeof t1 === "string")
            t1 = Time.parse(t1);
        return (t1.getTime() < Time.now());
    },

    /**
     * Determine if the given time is in the future
     * If no day/date is given, assumes the current 24 hour period
     * @return true if the current time is before the given time
     * @param {Date} t1 time, also accepts a string
     * @return boolean
     */
    before: function(t1) {
        "use strict";
        if (typeof t1 === "string")
            t1 = Time.parse(t1);
        return (t1.getTime() < Time.now());
    }
};
