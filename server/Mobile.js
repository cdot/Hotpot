/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const https = require("https");

const Time = require("../common/Time.js");
const Location = require("../common/Location.js");

const Apis = require("./Apis.js");

const MPH = 0.44704; // metres per second -> mph
const WALKING_SPEED = 4 * MPH; // in m/s
const CYCLING_SPEED = 20 * MPH; // in m/s
const DRIVING_SPEED = 60 * MPH; // in m/s

const A_LONG_WAY = 1000 * 1000; // 1000km in m

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
     * Last place this device was seen 
     * @type {Location}
     * @public
     */
    this.location = new Location();

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
     * Last place this device was seen
     * @type {Location}
     * @public
     */
    this.last_location = new Location();

    /**
     * Time at last_location, epoch secs 
     * @type {number}
     * @public
     */
    this.last_time = Time.nowSeconds();

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
        id: this.id
    };
};

/**
 * Get a serialisable version of the object
 * @return {object} a serialisable structure
 * @protected
 */
Mobile.prototype.getSerialisableState = function() {
    "use strict";

    var state = {
        location: this.location
    };

    if (this.time_of_arrival > Time.nowSeconds())
        state.time_of_arrival =
            new Date(Math.round(this.time_of_arrival * 1000)).toISOString();

    return state;
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
    this.last_location = this.location;
    this.location = new Location(info);
    this.last_time = this.time;
    this.time = Time.nowSeconds();
    if (this.last_location === null) {
        this.last_location = this.location;
        this.last_time = this.time;
    }
};

/**
 * Estimate the time at which the mobile will arrive home,
 * based on average velocity and distance. The mode of transport is
 * guessed based on distance from home and velocity. The time of arrival
 * is stored in the time_of_arrival property.
 * @param {function} callback callback(dist, toa) function, passed the distance
 * to travel before we want another update, in metres, and the estimated
 * time of arrival. If the mobile is a long way from home, or moving slowly,
 * we may want to wait quite a while before an update. This gives
 * the mobile device a chance to save power. -1 will be passed for both
 * params if no estimate can be made. If the device is already home,
 * then a distance of 0 and a time of arrival of 0 will be passed.
 * @public
 */
Mobile.prototype.estimateTOA = function(callback) {
    "use strict";
    var self = this;

    var crow_flies = this.home_location.haversine(this.location); // metres
    console.TRACE(TAG, this.name, " crow flies ", crow_flies, "m");

    // What's their speed over the ground?
    var distance = this.last_location.haversine(this.location);
    var time = this.time - this.last_time; // seconds

    if (time === 0) {
        // Shouldn't happen
        console.TRACE(TAG, this.name, " zero time");
        callback(crow_flies, self.time_of_arrival);
        return;
    }

    if (distance < 20) {
        // Already at home
        callback(0, 0);
        return;
    }

    var speed = distance / time; // metres per second
    console.TRACE(TAG, this.name, " distance ", distance, "m, time ", time,
                  "s, speed ", speed, "m/s (",
                  speed / MPH, "mph)");

    // Are they getting any closer?
    var last_crow = this.home_location.haversine(this.last_location);
    if (crow_flies > last_crow) {
        // no; skip re-routing until we know they are heading home
        console.TRACE(TAG, this.name, " is getting further away");
        self.time_of_arrival
        callback(last_crow, self.time_of_arrival);
        return;
    }

    // So they are getting closer.

    // This is too crude, should take account of transitions from one
    // mode to another
    var mode = "driving";
    if (speed < WALKING_SPEED) {
        mode = "walking";
        speed = WALKING_SPEED;
    } else if (speed < CYCLING_SPEED) {
        mode = "bicycling";
        speed = CYCLING_SPEED;
    } else
        speed = DRIVING_SPEED;

    // We don't really want to re-route everytime, but how do we know we
    // are on the planned route or not?

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
            callback(-1, -1);
            return;
        }
            
        console.TRACE(TAG, self.name, " got a route");
        // Get the time of the best route
        var best_route = A_LONG_WAY;
        for (var r in route.routes) {
            var route_length = 0;
            var legs = route.routes[r].legs;
            for (var l in legs) {
                var leg_length = legs[l].distance.value; // metres
                route_length += leg_length;
            }
            console.TRACE(TAG, self.name, " route of ",
                          route_length / 1000, "km found");
            if (route_length < best_route)
                best_route = route_length;
        }
        if (best_route < A_LONG_WAY)
            console.TRACE(TAG, self.name, " best route is ", best_route);
        else {
            console.TRACE(TAG, self.name, " no good route found, guessing");
            best_route = crow_flies;
        }
        self.time_of_arrival = Time.nowSeconds() + best_route / speed;
        callback(best_route, self.time_of_arrival);
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
            callback(-1, -1);
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
