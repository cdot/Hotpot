/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const EARTH_RADIUS = 6371000; // metres

// Somewhere in the Gulf of Guinea
const DEFAULT_LATITUDE = 0;
const DEFAULT_LONGITUDE = 0;

const MIN_DEG = 0.00005; // 5 metres in degrees at 55N

/**
 * Location object, compatible with google.maps.LatLng
 * @param lat latitude, or another Location object to copy, or undefined
 * for default location (55N0W)
 * @param lng longitude, or undefined if lat is an object
 */
function Location(lat, lng) {
    "use strict";
    if (typeof lat === "undefined") {
        lat = DEFAULT_LATITUDE;
        lng = DEFAULT_LONGITUDE;
    } else if (typeof lng === "undefined") {
        if (typeof lat.lng !== "undefined") {
            lng = lat.lng;
            lat = lat.lat;
        } else if (typeof lat.longitude !== "undefined") {
            lng = lat.longitude;
            lat = lat.latitude;
        } else {
            throw "Cannot initialise a Location from this object";
        }
    }
    this.lat = lat;
    this.lng = lng;
}
if (typeof module !== "undefined")
    module.exports = Location;

/**
 * Convert a number in degrees to radians
 * @param {float} x number of degrees
 * @return {float} x in radians
 */
function toRadians(x) {
    "use strict";
    return x * Math.PI / 180;
}

/**
 * Return the crow-flies distance between two locations,
 * each specified by lat and long.
 * @param {Location} p2 second point
 * @return {float} distance in metres
 */
Location.prototype.haversine = function(p2) {
    "use strict";
    var lat1 = toRadians(this.lat);
    var lat2 = toRadians(p2.lat);
    var dLat = toRadians(p2.lat - this.lat);
    var dLong = toRadians(p2.lng - this.lng);
    
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLong / 2) * Math.sin(dLong / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return EARTH_RADIUS * c;
};

/**
 * @return {string} containing geo coordinates
 */
Location.prototype.toString = function() {
    "use strict";
    return this.lat + "," + this.lng;
};

/**
 * Is this other point the same point to within 5m accuracy?
 * @param {Location} p2 other point
 * @return {boolean}
 */
Location.prototype.equals = function(p2) {
    "use strict";
    return Math.abs((this.lat - p2.lat)) < MIN_DEG
        && Math.abs((this.lng - p2.lng)) < MIN_DEG;
};
