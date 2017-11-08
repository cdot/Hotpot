/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Simple vector package
 * Assumes vectors are arbitrary-length arrays of numbers. Ordinals can be named
* whatever you like e,g. {x:, y:, z:} or {r:, g:, b:, a:}
 * @namespace
 */
var Vec = {
    sub: function(p1, p2) {
        var res = {};
        for (var ord in p1)
            res[ord] = p1[ord] - p2[ord];
        return res;
    },

    add: function(p1, p2) {
        var res = {};
        for (var ord in p1)
            res[ord] = p1[ord] + p2[ord];
        return res;
    },

    mul: function(v, d) {
        var res = {};
        for (var ord in v)
            res[ord] = v[ord] * d;
        return res;
    },

    dot: function(a, b) {
        var res = 0;
        for (var ord in a)
            res += a[ord] * b[ord];
        return res;
    },

    mag2: function(v) {
        var res = 0;
        for (var ord in v)
            res += v[ord] * v[ord];
        return res;
    },

    mag: function(v) {
        return Math.sqrt(Vec.mag2(v));
    },

    normalise: function(v, d) {
        var d = typeof d !== "undefined" ? d : Vec.mag(v);
        var res = {};
        for (var ord in v)
            res[ord] = v[ord] / d;
        return res;
    }
};

if (typeof module !== "undefined")
    module.exports = Vec;
