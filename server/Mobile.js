/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

const https = require("https");

const Time = require("../common/Time.js");
const Utils = require("../common/Utils.js");

const Server = require("./Server.js");

const DEFAULT_INTERVAL = 5 * 60; // 5 minutes in seconds
const LONG_INTERVAL = 30 * 60; // half an hour in seconds

const MPH = 0.44704; // metres per second -> mph
const FAST_WALK = 4 * MPH; // in m/s
const FAST_CYCLE = 20 * MPH; // in m/s

const A_LONG_TIME = 10 * 24 * 60 * 60; // 10 days in s

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
    this.location = Server.getConfig().get("location");

    /**
     * Time of last location update, epoch secs 
     * @type {number}
     */
    this.time = null;

    /**
     * Last place this device was seen
     * @type {Location}
     * @public
     */
    this.last_location = null;

    /**
     * Time at last_location, epoch secs 
     * @type {number}
     * @public
     */
    this.last_time = null;

    /**
     * When we are expected home, epoch secs 
     * @type {number}
     * @public
     */
    this.time_of_arrival = Time.nowSeconds() + A_LONG_TIME;

    console.TRACE(TAG, "'" + name + "' constructed");
}
module.exports = Mobile;

/**
 * Get a serialisable version of the object
 * @return {object} a serialisable structure
 * @protected
 */
Mobile.prototype.getSerialisableConfig = function() {
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
    return {
        location: this.location,
        time_of_arrival: new Date(Math.round(this.time_of_arrival * 1000)).toISOString()
    };
};

/**
 * Set the current location of the mobile device
 * @param {Location} loc the location; a structure with fields "latitude" and "longitude"
 * @protected
 */
Mobile.prototype.setLocation = function(loc) {
    "use strict";
    this.last_location = this.location;
    this.location = {
        latitude: loc.latitude,
        longitude: loc.longitude
    };
    this.last_time = this.time;
    this.time = Time.nowSeconds();
    console.TRACE(TAG, "setLocation @" + this.time
                  + ": " + loc.latitude
                  + "," + loc.longitude);
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
 * @return {float} interval before we want another update, in seconds. If the
 * mobile is a long way from home, or moving slowly, we may want to
 * wait quite a while before asking for an update. This gives the mobile
 * device a chance to save power by not consuming a lot of battery.
 * @public
 */
Mobile.prototype.estimateTOA = function() {
    "use strict";

    var crow_flies = Utils.haversine(Server.getConfig().get("location"), this.location); // metres
    console.TRACE(TAG, "Crow flies " + crow_flies + " m");

    // Are they very close to home?
    if (crow_flies < 1000) {
        this.time_of_arrival = Time.nowSeconds();
        console.TRACE(TAG, "Too close");
        this.expect_update = Time.nowSeconds() + DEFAULT_INTERVAL;
        return DEFAULT_INTERVAL; // less than 1km; as good as there
    }

    // Are they a long way away, >1000km
    if (crow_flies > 1000000) {
        this.time_of_arrival = Time.nowSeconds() + A_LONG_TIME;
        console.TRACE(TAG, "Too far away; TOA " + this.time_of_arrival);
        this.expect_update = Time.nowSeconds() + DEFAULT_INTERVAL;
        return LONG_INTERVAL;
    }

    // What's their speed over the ground?
    var distance = Utils.haversine(this.last_location, this.location);
    var time = this.time - this.last_time; // seconds

    if (time === 0) {
        // Shouldn't happen
        console.TRACE(TAG, "Zero time");
        this.expect_update = Time.nowSeconds() + DEFAULT_INTERVAL;
        return DEFAULT_INTERVAL;
    }

    var speed = distance / time; // metres per second
    console.TRACE(TAG, "Distance " + distance + "m, time " + time
                 + "s, speed " + speed + "m/s ("
                 + (speed / MPH) + "mph)");

    // When far away, we want a wider interval. When closer, we want a
    // smaller interval.
    // time to arrival =~ crow_flies / speed
    // divide that by 10 (finger in the air)
    var interval = (crow_flies / speed) / 10;
    console.TRACE(TAG, "Next interval " + crow_flies
                  + " / " + speed + " gives " + interval);

    // Are they getting any closer?
    var last_crow = Utils.haversine(Server.getConfig().get("location"), this.last_location);
    if (crow_flies > last_crow) {
        // no; skip re-routing until we know they are heading home
        console.TRACE(TAG, "Getting further away");
        this.expect_update = Time.nowSeconds() + interval;
        return interval;
    }

    // So they are getting closer. What's their mode of transport?

    // This is too crude, should take account of transitions from one
    // mode to another
    var mode = "driving";
    if (speed < FAST_WALK)
        mode = "walking";
    else if (speed < FAST_CYCLE)
        mode = "bicycling";

    // We don't really want to re-route everytime, but how do we know we
    // are on the planned route or not?

    console.TRACE(TAG, "Routing by " + mode);
    var gmaps = Server.getConfig().get("google_maps");
    var home = Server.getConfig().get("location");
    var url = "https://maps.googleapis.com/maps/api/directions/json"
        + "?units=metric"
        + "&key=" + gmaps.api_key;
    if (typeof gmaps.ip !== "undefined")
        url += "&userIp=" + gmaps.ip;
    url += "&origin=" + this.location.latitude + "," + this.location.longitude
        + "&destination=" + home.latitude + "," + home.longitude
        + "&departure_time=" + Math.round(Time.nowSeconds())
        + "&mode=" + mode;
    //console.TRACE(TAG, url);

    var analyseRoutes = function(route) {
        console.TRACE(TAG, "Got a route");
        // Get the time of the best route
        var best_route = A_LONG_TIME;
        for (var r in route.routes) {
            var route_length = 0;
            var legs = route.routes[r].legs;
            for (var l in legs) {
                var leg_length = legs[l].duration.value; // seconds
                route_length += leg_length;
            }
            if (route_length < best_route)
                best_route = route_length;
        }
        console.TRACE(TAG, "Best route is " + best_route);
        self.time_of_arrival = Time.nowSeconds() + best_route;
    };

    var result = "";
    var self = this;
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

    return interval;
};

Mobile.prototype.isReporting = function() {
    "use strict";
    if (this.time_of_arrival < Date.now() / 1000)
        return false;
    
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
