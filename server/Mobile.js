/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const https = require("https");
const Q = require("q");
const Time = require("../common/Time.js");
const Location = require("../common/Location.js");

const Apis = require("./Apis.js");

const MPH = 0.44704; // metres per second -> mph
const WALKING_SPEED = 4 * MPH; // in m/s
const CYCLING_SPEED = 20 * MPH; // in m/s
const DRIVING_SPEED = 60 * MPH; // in m/s

const A_LONG_TIME = 24 * 60 * 60; // 24h

const TAG = "Mobile";

/**
 * Record keeper for a mobile device that is reporting its position
 * @class
 * @param {String} id unique identifier for the mobile device, as sent by it
 * @param {Config} config configuration (which includes the name)
 * @protected
 */
function Mobile(name, config) {
    "use strict";
    /**
     * Name of this device 
     * @public
     */
    this.name = name;

    /**
     * Unique ID for this device 
     * @type {string}
     */
    this.id = config.get("id");

    /**
     * The fences this device will report crossing
     */
    this.fences = config.get("fences");

    /**
     * Last place this device was seen 
     * @type {Location}
     * @public
     */
    this.location = new Location();

    /**
     * Which way we are facing (degrees relative to North)
     * @type {Location}
     * @public
     */
    this.bearing = 0;

    /**
     * Last recorded speed over the ground (m/s)
     * @public
     */
    this.speed = 0;

    /**
     * Last fence crossed
     * @public
     */
    this.last_fence = undefined;

    /**
     * Last fence transition (ENTER or EXIT)
     * @public
     */
    this.transition = undefined;

    /**
     * Home location (location of the server, cache)
     * @type {Location}
     * @public
     */
    this.home_location = new Location();

    /**
     * Time of last location update, epoch secs 
     * @type {number}
     */
    this.time = Time.nowSeconds();

    /**
     * When we are expected home, epoch secs 
     * @type {number}
     * @public
     */
    this.time_of_arrival = this.last_time - 1;

    console.TRACE(TAG, name, " constructed");
}
module.exports = Mobile;

/**
 * Get a serialisable version of the object
 * @param {boolean} ajax set true if this config is for AJAX
 * @return {object} a serialisable structure
 * @protected
 */
Mobile.prototype.getSerialisableConfig = function(ajax) {
    "use strict";
    return {
        id: this.id,
        fences: this.fences
    };
};

/**
 * Get a promise for a serialisable version of the object
 * @return {Promise} a promise
 * @protected
 */
Mobile.prototype.getSerialisableState = function() {
    "use strict";

    var state = {
        location: this.location
    };

    if (this.time_of_arrival > Time.nowSeconds()) {
        state.time_of_arrival =
            new Date(Math.round(this.time_of_arrival * 1000)).toISOString();
    } else
        state.time_of_arrival = "Unknown";

    return Q.fcall(function() {
        return state;
    });
};

/**
 * Set the home location of the mobile device
 * @param {Location} location where the mobile is based
 * @protected
 */
Mobile.prototype.setHomeLocation = function(location) {
    "use strict";
    this.home_location = location;
    if (this.location.equals(new Location()))
        this.location = this.home_location;
};

/**
 * Set the current location of the mobile device in response to a message from
 * the device.
 * @param {object} info info about the device, including "lat",
 * "lng".
 * @protected
 */
Mobile.prototype.setLocation = function(info) {
    "use strict";
    this.location = new Location(info);
    this.time = Time.nowSeconds();
};

/**
 * Estimate the time at which the mobile will arrive home,
 * based on average velocity and distance. The mode of transport is
 * guessed based on distance from home and velocity. The time of arrival
 * is stored in the time_of_arrival property.
 * @param {function} callback callback(dist, toa) optional function, passed
 * the distance to travel before we want another update, in metres, and the
 * estimated time of arrival.
 *
 * If the mobile is a long way from home, or moving slowly,
 * we may want to wait quite a while before an update. This gives
 * the mobile device a chance to save power. -1 will be passed for both
 * params if no estimate can be made. If the device is already home,
 * then a distance of 0 and a time of arrival of 0 will be passed.
 * @private
 */
Mobile.prototype.estimateTOA = function(speed) {
    "use strict";
    var self = this;

    var mode = "driving";
    if (speed < WALKING_SPEED) {
        mode = "walking";
        speed = WALKING_SPEED;
    } else if (speed < CYCLING_SPEED) {
        mode = "bicycling";
        speed = CYCLING_SPEED;
    } else
        speed = DRIVING_SPEED;

    // Use gmaps routing to estimate when we'll be home
    var gmaps = Apis.get("google_maps");
    var url = "https://maps.googleapis.com/maps/api/directions/json"
        + "?units=metric"
        + "&key=" + gmaps.server_key;
    if (typeof gmaps.ip !== "undefined")
        url += "&userIp=" + gmaps.ip;
    url += "&origin=" + this.location
        + "&destination=" + this.home_location
        + "&departure_time=" + Math.round(Time.nowSeconds())
        + "&mode=" + mode;

    console.TRACE(TAG, this.name, " routing by ", mode);
    function analyseRoutes(route) {
        if (typeof result.error_message !== "undefined") {
            console.error("Error getting route: " + result.error_message);
            return;
        }
            
        console.TRACE(TAG, self.name, " got a route");
        // Get the time of the best route
        var best_time = A_LONG_TIME;
        for (var r in route.routes) {
            var route_length = 0;
            var legs = route.routes[r].legs;
            for (var l in legs) {
                var leg_length = legs[l].duration.value; // seconds
                route_length += leg_length;
            }
            console.TRACE(TAG, self.name, " route of ",
                          route_length, "s found");
            if (route_length < best_time)
                best_time = route_length;
        }
        self.time_of_arrival = self.time + best_time;
    }

    var result = "";
    https.get(url,
        function(res) {
            res.on("data", function(chunk) {
                result += chunk;
            });
            res.on("end", function() {
                //console.TRACE(TAG, result);
                analyseRoutes(JSON.parse(result));
            });
        })
        .on("error", function(err) {
            console.error("Failed to GET from " + url.host + ": " + err);
        });
};

/**
 * Get the currently estimated arrival time from now
 * @return {float} estimated arrival time in seconds from now
 * @public
 */
Mobile.prototype.arrivesIn = function() {
    "use strict";
    return this.time_of_arrival - Time.nowSeconds();
};

Mobile.prototype.recordCrossing = function(info) {
    this.bearing = parseInt(info.bearing);
    this.speed = parseInt(info.speed);
    this.last_fence = info.fence;
    this.last_transition = info.transition;

    if (info.transition === "ENTER") {
        // Getting closer
        this.estimateTOA(parseInt(info.speed));
    } else
        this.time_of_arrival = Time.nowSeconds() + A_LONG_TIME;
};
