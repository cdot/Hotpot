/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
/**
 * Record keeper for a mobile device that is reporting its position
 */
const Time = require("./Time.js");

const EARTH_RADIUS = 6371000; // metres
const A_LONG_TIME = 10 * 24 * 60 * 60; // 10 days in s
const MAPS_API_KEY = "AIzaSyDXPRbq4Q2GRxX9rDp-VsIsUSNcfil0PyI";
const MAPS_SERVER_IP = "46.208.108.90";
const MPS_TO_MPH = 0.44704; // metres per second -> mph
const https = require("https");

/**
 * Construct a new mobile.
 * @param id unique identifier for the mobile device, as sent by it
 * @param config configuration (which in clude the name)
 * @param home {lat,long} of the server home
 */
function Mobile(id, config, home) {
    "use strict";
    console.TRACE("mobile", "Creating Mobile " + id);
    this.id = id;
    this.name = config.name;
    this.mode = "driving";
    this.lastReport = null;
    this.location = null;
    this.time = null;
    this.home = home;
    this.last_location = null;
    this.last_time = null;
    this.time_of_arrival = Time.nowSeconds() + A_LONG_TIME;
}
module.exports = Mobile;

Mobile.prototype.DESTROY = function() {
    "use strict";
};

Mobile.prototype.serialisable = function() {
    "use strict";
    return {
        name: this.name,
        time_of_arrival: this.time_of_arrival
    };
};

/**
 * Set the current location of the mobile device
 * @param loc the location; a structure with fields "latitude" and "longitude"
 */
Mobile.prototype.setLocation = function(loc) {
    "use strict";
    this.last_location = this.location;
    this.location = {
        latitude: loc.latitude,
        longitude: loc.longitude
    };
    this.time = Time.nowSeconds();
    if (this.last_location === null) {
        this.last_location = this.location;
        this.last_time = this.time;
    }
};

// Convert a number in degress to radians
function toRadians(x) {
    "use strict";
   return x * Math.PI / 180;
}

/**
 * Return the crow-flies distance between two locations,
 * each specified by lat and long.
 * @return distance in metres
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

    var d = EARTH_RADIUS * c;

    return d;
}

/**
 * Estimate and return the time at which the mobile will arrive home,
 * based on average velocity and distance. The mode of transport is
 * guessed based on distance from home and velocity.
 * @param loc the location being navigated to
 * @param callback function called with estimated time of arrival in
 * epoch seconds
 */
Mobile.prototype.estimateTOA = function() {
    "use strict";
    var crow_flies = haversine(this.home, this.location); // metres
    console.TRACE("mobile", "Crow flies " + crow_flies + " m");

    // Are they very close to home?
    if (crow_flies < 1000) {
        this.time_of_arrival = Time.nowSeconds();
        return; // less than 1km; as good as there
    }

    // Are they a long way away, >1000km
    if (crow_flies > 1000000) {
        this.time_of_arrival = Time.nowSeconds() + A_LONG_TIME;
        return;
    }

    // Are they getting any closer?
    var last_crow = haversine(this.home, this.last_location);
    if (crow_flies > last_crow)
        // no; skip re-routing until we know they are heading home
        return;

    // What's their speed over the ground?
    var distance = haversine(this.last_location, this.location);
    var time = (this.time - this.last_time) / 1000; // seconds

    if (time === 0)
        // Shouldn't happen
        return;

    var speed = distance / time; // metres per second
    speed = speed / MPS_TO_MPH; // miles per hour

    // So they are getting closer. What's their mode of transport?

    // This is too crude, should take account of transitions from one
    // mode to another
    var mode = "driving";
    if (speed < 4)
        mode = "walking";
    else if (speed < 20)
        mode = "bicycling";

    // We don't really want to re-route everytime, but how do we know we
    // are on the planned route or not?

    // https://maps.googleapis.com/maps/api/directions/json?units=metric&key=AIzaSyDXPRbq4Q2GRxX9rDp-VsIsUSNcfil0PyI&userIp=46.208.108.90&origin=53,4&destination=54,3&mode=walking

    var url = "https://maps.googleapis.com/maps/api/directions/json"
        + "?units=metric"
        + "&key=" + MAPS_API_KEY
        + "&userIp=" + MAPS_SERVER_IP
        + "&origin=" + this.location.latitude + "," + this.location.longitude
        + "&destination=" + this.home.latitude + "," + this.home.longitude
        + "&departure_time=" + Time.nowSeconds()
        + "&mode=" + mode;

    var analyseRoutes = function(route) {
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
        self.time_of_arrival = Time.nowSeconds() + best_route;
    };

    var result = "";
    https.get(url,
        function(res) {
            res.on("data", function(chunk) {
                result += chunk;
            });
            res.on("end", function() {
                analyseRoutes(JSON.parse(result));
            });
        })
        .on("error", function(err) {
            console.error("Failed to GET from " + url.host + ": " + err);
        });
};
