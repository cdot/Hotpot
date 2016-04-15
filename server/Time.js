/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Functions for comparing times around the current time.
 */
const ONE_DAY = 86400000; // one day in ms

Time = {};
module.exports = Time;

// Private - get midnight, today
Time.midnight = function() {
    "use strict";
    var d = new Date();
    // Get midnight, in ms
    return new Date(
        d.getFullYear(), d.getMonth(), d.getDate());
};

// Private - convert a HH[:MM] string to a Date
Time.parse = function(s) {
    "use strict";
    var d = Time.midnight();
    var hms = s.split(/:/);
    d.setHours(hms[0], hms[1]);
    return d;
};

/**
 * Determine if current time is between two times, specified as strings
 */
Time.between = function(st1, st2) {
    "use strict";
    var t1 = Time.parse(st1);
    var t2 = Time.parse(st2);

    if (t1.getTime() > t2.getTime())
        t1 = new Date(t1.getTime() - ONE_DAY);

    var now = new Date().getTime();
    return (t1.getTime() <= now && now < t2.getTime());
};
