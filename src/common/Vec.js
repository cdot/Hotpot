/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import { Utils } from "./Utils.js";

/**
 * Simple vector package.
 * Objects passed are maps of coordinate names to numbers. Coordinates
 * can be named whatever you like e,g. {x:, y:, z:} or
 * {r:, g:, b:, a:} or objects can be simple 1-dimensional arrays.
 * Whatever vector representation is employed must be used
 * consistently; you can't mix [] arrays with {X:, Y:} objects,
 * for example.
 */
class Vec {
  /**
   * @private
   */
  static _check() {
    const v = arguments[0];
    if (v instanceof Array) {
      for (let i = 1; i < arguments.length; i++)
        if (!(arguments[i] instanceof Array) ||
            (arguments[i].length != v.length))
          throw Utils.exception("Vec", "Length mismatch");
      return [];
    } else {
      for (let i in v) {
        for (let j = 1; j < arguments.length; j++)
          if (typeof arguments[j][i] !== typeof v[i])
            throw Utils.exception("Vec", "Type mismatch",
                                  typeof arguments[j][i],
                                  typeof v[i]);
      }
      return {};
    }
  }

  /**
   * Subtract p2 from p1
   * @param p1 {object} vector to subtract from
   * @param p2 {object} vector to take away
   * @return {object} a new vector p1-p2
   */
  static sub(p1, p2) {
    const res = Vec._check(p1, p2);
    for (let ord in p1) {
      res[ord] = p1[ord] - p2[ord];
    }
    return res;
  }

  /**
   * Add two vectors
   * @param {object} p1 first vector
   * @param {object} p2 second vector
   * @return {object} a new vector
   */
  static add(p1, p2) {
    const res = Vec._check(p1, p2);
    for (let ord in p1)
      res[ord] = p1[ord] + p2[ord];
    return res;
  }

  /**
   * Multiply a vector by a scalar
   * @param {object} v vector to scale
   * @param {object} d factor to scale by
   * @return {object} a new vector scaled by d
   */
  static mul(v, d) {
    const res = Vec._check(v);
    for (let ord in v)
      res[ord] = v[ord] * d;
    return res;
  }

  /**
   * Divide a vector by a scalar
   * @param {object} v vector to scale
   * @param {number} d factor to scale by
   * @return {object} a new vector scaled by d
   */
  static div(v, d) {
    const res = Vec._check(v);
    for (let ord in v)
      res[ord] = v[ord] / d;
    return res;
  }

  /**
   * Get the dot product of two vectors a.b
   * @param {object} a first vector
   * @param {object} a second vector
   * @return {number} scalar dot product
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
   * @param {object} v the vector
   * @return {number} sum of the squares of the coordinates
   */
  static mag2(v) {
    let res = 0;
    for (let ord in v)
      res += v[ord] * v[ord];
    return res;
  }

  /**
   * Get the magnitude of the vector
   * @param {object} v the vector
   * @return {number} scalar magnitude of the vector
   */
  static mag(v) {
    return Math.sqrt(Vec.mag2(v));
  }

  /**
   * Normalise a vector. Optionally pass in the magnitude
   * of the vector, if pre-computed
   * @param {object} v the vector to normalise
   * @param {number} d (optional) pre-computed magnitude of the vector
   * @return {object} the normalised vector
   */
  static normalise(v, d) {
    return Vec.div(v, typeof d !== "undefined" ? d : Vec.mag(v));
  }
}

export { Vec }
