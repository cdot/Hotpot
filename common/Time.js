/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms

/**
 * Functions for comparing times around the current time.
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
 * Convert a variety f types to a number of ms
 * @private
 */
Time.toMs = function(d) {
    switch (typeof d) {
    case "string":
        return Time.parse(d).getTime();
    case "number":
        return d;
    case "object":
        return d.getTime();
    }
    throw "Unconvertible date type " + (typeof d);
};

/**
 * Unit test support. Force now to a specific time for the duration
 * of a function call.
 */
Time.for_now = function(now, scope) {
    if (typeof now === "object")
        now = now.getTime();
    Time.now = function() {
        return now;
    };
    scope();
    Time.now = Date.now;
};

/**
 * Debug support. Force now to a specific time until unset.
*/
Time.force = function(now) {
    now = Date.parse(now);
    Time.now = function() {
        return now;
    };
};

/**
 * Debug support. Revert to system time
*/
Time.unforce = function() {
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
 * Parse a server local time HH[:MM[:SS]] string to a Date offset from midnight.
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
    var now = Time.now();
    t1 = Time.toMs(t1);
    t2 = Time.toMs(t2);

    if (t1 > t2) {
        // e.g. 22:00..02:00, check 12:00..02:00 tomorrow
        if (now < t2)
            return true;
        // Now check t1..midnight tonight
        t2 = Time.midnight().getTime() + ONE_DAY;
    }
    // Now all within current 24 hour period, t1 < t2
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
    return (Time.toMs(t1) < Time.now());
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
    return (Time.now() < Time.toMs(t1));
};
