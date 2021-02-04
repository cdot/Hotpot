/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("common/js/Vec", ["common/js/Utils"], function(Utils) {

    /**
     * Simple vector package
     * Objects passed are maps of coordinate names to numbers. Coordinates
     * can be named whatever you like e,g. {x:, y:, z:} or
     * {r:, g:, b:, a:} or can be simple 1-dimensional arrays.
     * @namespace
     */
    class Vec {
        static _check() {
            let v = arguments[0], i, j;
            if (v instanceof Array) {
                for (i = 1; i < arguments.length; i++)
                    if (!(arguments[i] instanceof Array)
                        || (arguments[i].length != v.length))
                        throw Utils.exception("Vec", "Length mismatch");
                return [];
            } else {
                for (i in v) {
                    for (j = 1; j < arguments.length; j++)
                        if (typeof arguments[j][i] !== typeof v[i])
                            throw Utils.exception("Vec", "Type mismatch",
                                                      typeof arguments[j][i],
                                                      typeof v[i]);
                }
                return {};
            }
        }

        /**
         * Subtract vector p2 from p1
         * @param p1 vector to subtract from
         * @param p2 vector to take away
         * @return a new vector p1-p2
         */
        static sub(p1, p2) {
            let res = Vec._check(p1, p2);
            for (let ord in p1) {
                res[ord] = p1[ord] - p2[ord];
            }
            return res;
        }

        /**
         * Add two vectors
         * @param p1 first vector
         * @param p2 second vector
         * @return a new vector
         */
        static add(p1, p2) {
            let res = Vec._check(p1, p2);
            for (let ord in p1)
                res[ord] = p1[ord] + p2[ord];
            return res;
        }

        /**
         * Multiply a vector by a scalar
         * @param v vector to scale
         * @param d factor to scale by
         * @return a new vector scaled by d
         */
        static mul(v, d) {
            let res = Vec._check(v);
            for (let ord in v)
                res[ord] = v[ord] * d;
            return res;
        }

        /**
         * Divide a vector by a scalar
         * @param v vector to scale
         * @param d factor to scale by
         * @return a new vector scaled by d
         */
        static div(v, d) {
            let res = Vec._check(v);
            for (let ord in v)
                res[ord] = v[ord] / d;
            return res;
        }

        /**
         * Get the dot product of two vectors a.b
         * @param a first vector
         * @param a second vector
         * @return scalar dot product
         */
        static dot(a, b) {
            Vec._check(a, b);
            let res = 0;
            for (let ord in a)
                res += a[ord] * b[ord];
            return res;
        }

        /**
         * Get the square of the magnitude of the vector
         * @param v the vector
         * @return sum of the squares of the coordinates
         */
        static mag2(v) {
            let res = 0;
            for (let ord in v)
                res += v[ord] * v[ord];
            return res;
        }

        /**
         * Get the magnitude of the vector
         * @param v the vector
         * @return scalar magnitude of the vector
         */
        static mag(v) {
			return Math.sqrt(Vec.mag2(v));
		}

        /**
         * Normalise a vector. Optionally pass in the magnitude
         * of the vector, if pre-computed
         * @param v the vector to normalise
         * @param d (optional) pre-computed magnitude of the vector
         * @return the normalised vector
         */
        static normalise(v, d) {
			return Vec.div(v, typeof d !== "undefined" ? d : Vec.mag(v));
		}
    }

    return Vec;
});
