/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
/**
 * Record keeper for a mobile device that is reporting its position
 * @class
 */
const https = require("https");
const Time = require("./Time.js");
const Server = require("./Server.js");

const DEFAULT_INTERVAL = 5 * 60; // 5 minutes in seconds
const LONG_INTERVAL = 30 * 60; // half an hour in seconds

const MPH = 0.44704; // metres per second -> mph
const FAST_WALK = 4 * MPH; // in m/s
const FAST_CYCLE = 20 * MPH; // in m/s

const EARTH_RADIUS = 6371000; // metres
const A_LONG_TIME = 10 * 24 * 60 * 60; // 10 days in s

/**
 * Construct a new mobile.
 * @param {String} id unique identifier for the mobile device, as sent by it
 * @param config configuration (which includes the name)
 * @class
 */
function Mobile(name, config) {
    "use strict";
    console.TRACE("mobile", "Creating Mobile " + name);
    /** @property {String} name Name of this device */
    this.name = name;
    /** @property {String} id Unique ID for this device */
    this.id = config.get("id");
    /** @property {Location} location last place this device was seen */
    this.location = null;
    /** @property {number} time time of last location update, epoch secs */
    this.time = null;
    /** @property {Location} last_location last place this device was seen
        before the last place  */
    this.last_location = null;
    /** @property {number} last_time time at last_location, epoch secs */
    this.last_time = null;

    /** @property {number} when we are expected home, epoch secs */
    this.time_of_arrival = Time.nowSeconds() + A_LONG_TIME;
}
module.exports = Mobile;

/**
 * Release all resources used by the object
 */
Mobile.prototype.DESTROY = function() {
    "use strict";
};

/**
 * Get a serialisable version of the object
 * @return {object} a serialisable structure
 */
Mobile.prototype.getConfig = function() {
    "use strict";
    return {
        id: this.id
    };
};

/**
 * Get a serialisable version of the object
 * @return {object} a serialisable structure
 */
Mobile.prototype.getState = function() {
    "use strict";
    return {
        time_of_arrival: this.time_of_arrival
    };
};

/**
 * Set the current location of the mobile device
 * @param {Location} loc the location; a structure with fields "latitude" and "longitude"
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
    console.TRACE("mobile", "setLocation @" + this.time
                  + ": " + loc.latitude
                  + "," + loc.longitude);
    if (this.last_location === null) {
        this.last_location = this.location;
        this.last_time = this.time;
    }
};

/**
 * Convert a number in degress to radians
 * @private
 */
function toRadians(x) {
    "use strict";
   return x * Math.PI / 180;
}

/**
 * Return the crow-flies distance between two locations,
 * each specified by lat and long.
 * @return distance in metres
 * @private
 */
function haversine(p1, p2) {
    "use strict";
    var lat1 = toRadians(p1.latitude);
    var lat2 = toRadians(p2.latitude);
    var dLat = toRadians(p2.latitude - p1.latitude);
    var dLong = toRadians(p2.longitude - p1.longitude);

    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLong / 2) * Math.sin(dLong / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS * c;
}

/**
 * Estimate the time at which the mobile will arrive home,
 * based on average velocity and distance. The mode of transport is
 * guessed based on distance from home and velocity. The time of arrival
 * is stored in the time_of_arrival property.
 * @return {float} interval before we want another update, in seconds. If the
 * mobile is a long way from home, or moving slowly, we may want to
 * wait quite a while before asking for an update. This gives the mobile
 * device a chance to save power by not consuming a lot of battery.
 */
Mobile.prototype.estimateTOA = function() {
    "use strict";
    var crow_flies = haversine(Server.getConfig().get("location"), this.location); // metres
    console.TRACE("mobile", "Crow flies " + crow_flies + " m");

    // Are they very close to home?
    if (crow_flies < 1000) {
        this.time_of_arrival = Time.nowSeconds();
        console.TRACE("mobile", "Too close");
        return DEFAULT_INTERVAL; // less than 1km; as good as there
    }

    // Are they a long way away, >1000km
    if (crow_flies > 1000000) {
        this.time_of_arrival = Time.nowSeconds() + A_LONG_TIME;
        console.TRACE("mobile", "Too far away; TOA " + this.time_of_arrival);
        return LONG_INTERVAL;
    }

    // What's their speed over the ground?
    var distance = haversine(this.last_location, this.location);
    var time = this.time - this.last_time; // seconds

    if (time === 0) {
        // Shouldn't happen
        console.TRACE("mobile", "Zero time");
        return DEFAULT_INTERVAL;
    }

    var speed = distance / time; // metres per second
    console.TRACE("mobile", "Distance " + distance + "m, time " + time
                 + "s, speed " + speed + "m/s ("
                 + (speed / MPH) + "mph)");

    // When far away, we want a wider interval. When closer, we want a
    // smaller interval.
    // time to arrival =~ crow_flies / speed
    // divide that by 10 (finger in the air)
    var interval = (crow_flies / speed) / 10;
    console.TRACE("mobile", "Next interval " + crow_flies
                  + " / " + speed + " gives " + interval);

    // Are they getting any closer?
    var last_crow = haversine(Server.getConfig().get("location"), this.last_location);
    if (crow_flies > last_crow) {
        // no; skip re-routing until we know they are heading home
        console.TRACE("mobile", "Getting further away");
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

    console.TRACE("mobile", "Routing by " + mode);
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
    //console.TRACE("mobile", url);

    var analyseRoutes = function(route) {
        console.TRACE("mobile", "Got a route");
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
        console.TRACE("mobile", "Best route is " + best_route);
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
                //console.TRACE("mobile", result);
                analyseRoutes(JSON.parse(result));
            });
        })
        .on("error", function(err) {
            console.error("Failed to GET from " + url.host + ": " + err);
        });

    return interval;
};
