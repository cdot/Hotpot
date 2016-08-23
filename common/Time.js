/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms

/**
 * Functions for comparing times around the current time. All computations are
 * in Local time.
 * @namespace
 */
var Time = {
    now: Date.now
};

if (typeof module !== "undefined") // browserify
    module.exports = Time;
 
/**
 * Convert a variety f types to a Date
 */
Time.toDate = function(d) {
    switch (typeof d) {
    case "string":
        return Time.parse(d);
    case "number":
        return new Date(d);
    case "object":
        return d;
    }
    throw "Unconvertible date type " + (typeof d);
};

/**
 * Debug support - force now to a specific time
 */
Time.force_now = function(now) {
    Time.now = function() {
        return now;
    };
};

Time.unforce_now = function() {
    Time.now = Date.now;
};

/**
 * Get midnight, today, as a Date
 * @return {Date} date object representing midnight
 */
Time.midnight = function() {
    "use strict";
    var d = new Date(Time.now());
    d.setHours(0, 0, 0, 0);
    return d;
};

/**
 * Parse a server local time HH[:MM[:SS]] string to a Date relative to midnight.
 * Times must be in the range 00:00:00..23:59:59
 * @param {string} s time string
 * @return {Date} the date
 */
Time.parse = function(str) {
    "use strict";
    var hms = str.split(/:/);
    var h = hms.shift();
    var m = hms.shift() || 0;
    var s = hms.shift() || 0;
    var d = new Date(Time.now());
    // Set according to local time
    if (h > 23 || m > 59 || s > 59 || h < 0 || m < 0 || s < 0)
        throw "Time out of range 00:00:00..23:59:59";
    d.setHours(h, m, s, 0);
    return d;
};

/**
 * Get the current time in s
 * @return current time in epoch seconds
 */
Time.nowSeconds = function() {
    "use strict";
    return Time.now() / 1000;
};

/**
 * Determine if current time is between two times.
 * t1 is always taken to be in the current 24 hour period (i.e. to be
 * a time relative to midnight today.
 * @param {Date} t1 time, also accepts a string or a number (ms)
 * @param {Date} t2 time, also accepts a string or a number (ms)
 * @return boolean
 */
Time.between = function(t1, t2) {
    "use strict";
    t1 = Time.toDate(t1);
    t2 = Time.toDate(t2);

    if (t1 > t2) {
        // e.g. 22:00..02:00, check 12:00..02:00 tomorrow
        if (Time.between(Time.midnight(), t2))
            return true;
        // Now check t1..midnight tonight
        t2 = new Date(Time.midnight() + ONE_DAY);
    }

    // Now all within current 24 hour period, t1 < t2
    var now = Time.now();
    return (t1 <= now && now < t2);
};

/**
 * Determine if the given time was in the past
 * If no day/date is given, assumes the current 24 hour period
 * @return true if the current time is after the given time
 * @param {Date} t1 time, also accepts a string or a number (ms)
 * @return boolean
 */
Time.after = function(t1) {
    "use strict";
    t1 = Time.toDate(t1);
    return (t1 < Time.now());
};

/**
 * Determine if the given time is in the future
 * If no day/date is given, assumes the current 24 hour period
 * @return true if the current time is before the given time
 * @param {Date} t1 time, also accepts a string or a number (ms)
 * @return boolean
 */
Time.before = function(t1) {
    "use strict";
    t1 = Time.toDate(t1);
    return (Time.now() < t1);
};
