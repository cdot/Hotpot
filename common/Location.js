/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const EARTH_RADIUS = 6371000; // metres

// Somewhere in the Gulf of Guinea
const DEFAULT_LATITUDE = 0;
const DEFAULT_LONGITUDE = 0;

const MIN_DEG = 0.00005; // 5 metres in degrees at 55N

const Utils = require('./Utils');

/**
 * Location object, compatible with google.maps.LatLng. This function has
 * three possible constructor signatures:
 * 1. Location(lat, lng) where both lat and lng are numbers
 * 2. Location(object) where object has latitude and longitude fields
 * 3. Location() for a default Location 55N 0W
 * @param p1 (1.) {number} latitude number, (2.) {object} to get
 * lat(itude) and long(itude) fields from (3.) undefined.
 * @param p2 (1.) {number} longitude, (2.) undefined, (3.) undefined
 * @class
 */
function Location(lat, lng) {
    "use strict";
    if (typeof lat === "undefined") {
        // Constructor (3.)
        lat = DEFAULT_LATITUDE;
        lng = DEFAULT_LONGITUDE;
    } else if (typeof lat === "object") {
        // Constructor (2.)
        if (typeof lat.lng !== "undefined") {
            lng = lat.lng;
            lat = lat.lat;
        } else if (typeof lat.longitude !== "undefined") {
            lng = lat.longitude;
            lat = lat.latitude;
        } else {
            throw "Cannot initialise a Location from " + Utils.dump(lat);
        }
    } // else Constructor (1.)
    this.latitude = lat;
    this.longitude = lng;
}

Location.Model = {
    $class: Location,
    latitude: {
        $doc: "Decimal latitude",
        $class: Number
    },
    longitude: {
        $doc: "Decimal longitude",
        $class: Number
    }
};

module.exports = Location;

/**
 * Return the crow-flies distance between two locations,
 * each specified by lat and long.
 * @param {Location} p2 second point
 * @return {float} distance in metres
 */
Location.prototype.haversine = function(p2) {
    "use strict";
    /**
     * Convert a number in degrees to radians
     * @param {float} x number of degrees
     * @return {float} x in radians
     */
    function toRadians(x) {
        return x * Math.PI / 180;
    }
    var lat1 = toRadians(this.latitude);
    var lat2 = toRadians(p2.latitude);
    var dLat = toRadians(p2.latitude - this.latitude);
    var dLong = toRadians(p2.longitude - this.longitude);

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
    return Utils.report('(', this.latitude, ",", this.longitude, ')');
};

/**
 * Is this other point the same point to within 5m accuracy?
 * @param {Location} p2 other point
 * @return {boolean}
 */
Location.prototype.equals = function(p2) {
    "use strict";
    return Math.abs((this.latitude - p2.latitude)) < MIN_DEG
        && Math.abs((this.longitude - p2.longitude)) < MIN_DEG;
};
