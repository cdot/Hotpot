/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * @module Utils
 */

const EARTH_RADIUS = 6371000; // metres

/**
 * Useful utilities
 * @ignore
 */
var Utils = module.exports = {

    /**
     * Expand environment variables in the data string
     * @param {String} data string containing env var references
     * @return {String} data string with env vars expanded
     */
    expandEnvVars: function(data) {
        "use strict";
        if (typeof data !== "string")
            throw "Cannot expand " + data;
        return data.replace(
                /(\$[A-Z]+)/g, function(match) {
                    var v = match.substring(1);
                    if (typeof process.env[v] !== "undefined")
                        return process.env[v];
                    return match;
                });
    },

    /**
     * Debugging support for dumping a circular structure
     * @param {object} data thing to dump
     * @return {string} dump of data
     */
    dump: function(data) {
        "use strict";
        var cache = [];
        return JSON.stringify(data, function(key, value) {
            if (typeof value === "object" && value !== null) {
                if (cache.indexOf(value) !== -1) {
                    // Circular reference found, discard key
                    return "circular";
                }
                // Store value in our collection
                cache.push(value);
            }
            return value;
        }, 2);
    },

    /**
     * Convert a number in degrees to radians
     * @param {float} x number of degrees
     * @return {float} x in radians
     */
    toRadians: function(x) {
	"use strict";
	return x * Math.PI / 180;
    },

    /**
     * Return the crow-flies distance between two locations,
     * each specified by lat and long.
     * @param {Location} p1 first point
     * @param {Location} p2 second point
     * @return {float} distance in metres
     */
    haversine: function(p1, p2) {
	"use strict";
	var lat1 = Utils.toRadians(p1.latitude);
	var lat2 = Utils.toRadians(p2.latitude);
	var dLat = Utils.toRadians(p2.latitude - p1.latitude);
	var dLong = Utils.toRadians(p2.longitude - p1.longitude);

	var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLong / 2) * Math.sin(dLong / 2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return EARTH_RADIUS * c;
    }
};

