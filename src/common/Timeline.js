/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser,node */

import { Time } from "./Time.js";
import { TimeValue } from "./TimeValue.js";

/**
 * A timeline is an object that represents a continuous graph
 * giving a value at each point over a time line. The timeline starts
 * at 0 and runs for a period in milliseconds i.e. to (period - 1)
 * Times are milliseconds and values in the range
 * {min}..{max} (out of range values are validated).
 * New Timelines are initialised with a straight line at value
 * (min + max) / 2
 */
class Timeline {
  /**
   * Construct from a configuration data block built using
   * {@link DataModel} and Model
	 * @param {object} proto see Timeline.Model
   */
  constructor(proto) {

    /**
     * minimum possible value
     * @member {number}
     */
    this.min = parseFloat(proto.min);

    /**
     * maximum possible value
     * @member {number}
     */
    this.max = parseFloat(proto.max);

    /**
     * period of timeline in ms
     * @member {number}
     */
    this.period = parseFloat(proto.period);

    /**
     * Array of {@link TimeValue}
     * @member {TimeValue[]}
     */
    this.points = proto.points;

    if (this.max < this.min || this.period <= 0) {
      throw Error("Bad configuration");
    }

    if (typeof this.points === "undefined")
      this.points = [];

    // Check 0 point
    if (this.points.length === 0
				|| this.points[0].time != 0) {
			// There is always a point at 00:00
      this.points.unshift(new TimeValue(0, this.min));
    }
  }

	get maxValue() {
		return this.max;
	}

	set maxValue(val) {
		this.max = val;
	}

	get minValue() {
		return this.min;
	}

	set minValue(val) {
		this.min = val;
	}

	/**
	 * Get the index of a timepoint in the timeline
	 * @param {TimeValue} tp timepoint to find
	 * @return {number} index of point, or -1 if not found
	 */
	getIndexOf(tp) {
		return this.points.indexOf(tp);
	}

  /**
   * Get the maximum value at any time
   * @return {float} the maximum value
   */
  get highestValue() {
    let max = Number.MIN_VALUE;
    for (let pt of this.points) {
      if (pt.value > max)
        max = pt.value;
    }
    return max;
  }

  /**
   * Get the minimum value at any time
   * @return {float} the maximum value
   */
  get lowestValue() {
    let min = Number.MAX_VALUE;
    for (let pt of this.points) {
      if (pt.value < min)
        min = pt.value;
    }
    return min;
  }

  /**
   * Get the point that precedes the given time.
   * @param {number} t the time to test
   * @return {TimeValue} the point
   */
  getPointBefore(t) {
    if (t < 0 || t >= this.period)
      throw Error(`${Time.formatHMS(t)} is outside timeline ${Time.formatHMS(0)}..${Time.formatHMS(this.period - 1)}`);
		let prev;
    for (let pt of this.points) {
      if (pt.time > t)
        return prev;
			prev = pt;
    }
    return prev;
  }

  /**
   * Get the point that follows the given time. If the time is exactly
	 * the time of an existing timepoint, return that timepoint.
   * @param {number} t the time to test
   * @return {TimeValue} the point, or null if the time is between
	 * the last point and the end of the timeline
	 * @throws {Error} if t is outside the timeline
   */
  getPointAfter(t) {
    if (t < 0 || t >= this.period)
      throw Error(`${Time.formatHMS(t)} is outside timeline ${Time.formatHMS(0)}..${Time.formatHMS(this.period - 1)}`);
    for (let pt of this.points) {
      if (pt.time >= t)
        return pt;
    }
    return null;
  }

  /**
   * Get the value at the given time
   * @param {number} t the time, must be in range of the timeline
   * @return{float} the value at time t
   */
  valueAtTime(t) {
		const p0 = this.getPointBefore(t);
		let p1 = this.getPointAfter(t);
		if (p1 === null)
			p1 = new TimeValue(this.period, this.points[0].value);
		if (p1 === p0)
			return p0.value;
		// Interpolate between prev point and next point
		return p0.value + (t - p0.time) *
		(p1.value - p0.value) / (p1.time - p0.time);
  }

	setTime(tp, t) {
		this.remove(tp);
		tp.time = Math.min(Math.max(0, t), this.period);
		this.insert(tp);
	}

	setValue(tp, v) {
		tp.value = Math.min(Math.max(this.min, v), this.max);
    return tp.value;
	}

  /**
   * Remove the point from the timeline
   * @param {TimeValue} pt point to remove
   * @return {Timeline} this
   */
  remove(tp) {
		const idx = this.points.indexOf(tp);
    if (idx <= 0)
      throw Error(`Point at ${Time.formatHMS(tp.time)} cannot be removed`);
    this.points.splice(idx, 1);
    return this;
  }

  /**
   * Get total number of points
   * @return {number} number of points
   */
  get nPoints() {
    return this.points.length;
  }

  /**
   * Get the point at the given index
   * @param {number} i index
   * @return {TimeValue} the point object
   */
  getPoint(i) {
    if (i < 0 || i >= this.points.length)
      throw Error(`Point ${i} not in 0..${this.points.length - 1}`);
    return this.points[i];

  }

	/**
	 * Insert a new point
	 * @param {TimeValue} tp the point to add
	 * @return {boolean} true if the point was inserted
	 */
	insert(tp) {
		for (let i = 0; i < this.points.length; i++) {
			if (this.points[i].time === tp.time) {
				this.points[i] = tp;
				return;
			}
			if (this.points[i].time > tp.time) {
				this.points.splice(i, 0, tp);
				return;
			}
		}
		throw Error("Nowhere to insert point");
	}
}

/**
 * Configuration model, for use with {@link DataModel}
 * @typedef Timeline.Model
 * @property {number} min minimum possible value
 * @property {number} max maximum possible value
 * @property {number} period period of timeline in ms
 * @property {TimeValue[]} points Array of time points
 */
Timeline.Model = {
  $class: Timeline,
  $fileable: true,
  min: {
    $doc: "minimum possible value",
    $class: Number,
    $default: 0
  },
  max: {
    $doc: "maximum possible value",
    $class: Number,
    $default: 30
  },
  period: {
    $doc: "period of timeline in ms",
    $class: Number,
    $default: 24 * 60 * 60 * 1000 // one day in ms
  },
  points: {
    $doc: "Array of time points",
    $array_of: TimeValue.Model
  }
};

export { Timeline }
