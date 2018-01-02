/*@preserve Copyright (C) 2017 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
/* Must also work in browser */

"use strict";

const Utils = require('./Utils');
const Time = require('./Time');

function Timepoint(proto) {

    Utils.extend(this, proto);

    if (typeof this.time === "undefined") {
        if (typeof this.times === "undefined")
            throw Utils.report("Timepoint must have time or times");
        this.time = Time.parse(this.times);
        delete this.times;
    } else if (typeof this.times !== "undefined")
        throw Utils.report("Timepoint must have time or times, not both");
}

Timepoint.Model = {
    $class: Timepoint,
    $doc: "vertex on a timeline graph",
    time: {
        $class: Number,
        $optional: true, // Must have time or times, constructor enforces
        $doc: "time"
    },
    times: {
        $class: String,
        $optional: true, // Must have time or times, constructor enforces
        $doc: "time string"
    },
    value: {
        $class: Number,
        $doc: "value at this time"
    }
};

Timepoint.prototype.getSerialisable = function () {
    var Q = require("q");
    return Q({
        times: Time.unparse(this.time),
        value: this.value
    });
};

/**
 * A timeline is an object that represents a continuous graph
 * giving a value at each point over a time line. The timeline starts
 * at 0 and runs for a period in milliseconds.
 * Times are milliseconds and values in the range
 * {min}..{max} (out of range values are validated).
 * New Timelines are initialised with a straight line at value
 * (min + max) / 2
 * @param proto see Timeline.Model
 * @class
 */
function Timeline(proto) {

    Utils.extend(this, proto);

    if (this.max <= this.min)
        throw "Value range inside out";
    if (this.period <= 0)
        throw "Bad period";

    if (typeof this.points === "undefined")
        this.points = [];

    // Use setPoint to validate points passed
    for (var i = 1; i < this.points.length; i++)
        this.setPoint(i);

    this.fixExtremes();
}

module.exports = Timeline;

Timeline.Model = {
    $class: Timeline,
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
        $array_of: Timepoint.Model
    }
};

// Private function to add extreme points if needed
Timeline.prototype.fixExtremes = function () {
    // Add missing points to extremes
    if (this.points.length == 0) {
        this.points.push(new Timepoint({
            time: 0,
            value: (this.min + this.max) / 2
        }));
        this.points.push(new Timepoint({
            time: this.period - 1,
            value: (this.min + this.max) / 2
        }));
    }
    if (this.points[0].time != 0)
        this.points.unshift(new Timepoint({
            time: 0,
            value: this.points[0].value
        }));

    if (this.points[this.points.length - 1].time < this.period - 1) {
        this.points.push(new Timepoint({
            time: this.period - 1,
            value: this.points[this.points.length - 1].value
        }));
    }
};

/**
 * Get the index of the point that follows the given time.
 * @param t the time to test
 * @return the index of the point
 */
Timeline.prototype.getPointAfter = function (t) {
    if (t < 0 || t >= this.period)
        throw "Time is outside timeline";
    for (var i = 1; i < this.points.length - 1; i++) {
        if (this.points[i].time > t)
            return i;
    }
    return this.points.length - 1;
};

/**
 * Get the maximum value at any time
 * @return {float} the maximum value
 */
Timeline.prototype.getMaxValue = function () {
    var max = this.points[0].value;
    for (var i = 1; i < this.points.length; i++) {
        if (this.points[i].value > max)
            max = this.points[i].value;
    }
    return max;
};

/**
 * Get the value at the given time
 * @param t the time, must be in range of the timeline
 * @return{float}the value at time t
 */
Timeline.prototype.valueAtTime = function (t) {
    var i = this.getPointAfter(t);
    var lp = this.points[i - 1];
    var p = this.points[i];
    // Interpolate between last point and this point
    return lp.value + (t - lp.time) *
        (p.value - lp.value) / (p.time - lp.time);
}

/**
 * Insert a point before the point at the given index
 * @param index index of the point to add before (must be > 0)
 * @param point the (time: value:) point to add
 * @return index of the point added
 */
Timeline.prototype.insertBefore = function (index, point) {
    if (index <= 0)
        throw "Can't insert before 0 point";
    if (index >= this.points.length)
        throw "index beyond end";
    this.points.splice(index, 0, new Timepoint(point));
    // Use setPoint to validate it
    try {
        this.setPoint(index);
        return index;
    } catch (e) {
        this.points.splice(index, 1);
        throw e;
    }
};

/**
 * Remove the point at the given index
 * @param idx index of point to remove
 * @return this
 */
Timeline.prototype.remove = function (idx) {
    if (idx <= 0 || idx >= this.points.length - 1)
        throw "Not a removable point";
    this.points.splice(idx, 1);
    return this;
};

/**
 * Get total number of points
 * @return number of points
 */
Timeline.prototype.nPoints = function () {
    return this.points.length;
};

/**
 * Get the point at the given index
 * @return the point object
 */
Timeline.prototype.getPoint = function (i) {
    if (i < 0 || i >= this.points.length)
        throw Utils.report("Timeline.getPoint(", i, ") not in 0..",
            this.points.length);
    return this.points[i];

};

/**
 * Set a point, validating the new settings are in range
 * relative to the points neighbouring it.
 * @param i the index of the point to set
 * @param p a point object giving the (time,value) to set. If this is
 * undefined, it will validate the point already at i
 */
Timeline.prototype.setPoint = function (i, p) {
    if (i < 0 || i >= this.points.length)
        throw "Not a point";
    if (typeof p === "undefined")
        p = this.points[i];
    if (p.time < 0 || p.time >= this.period)
        throw "Time " + p.time + " outside period 0.." + this.period;
    if (i < this.points.length - 1 && p.time >= this.points[i + 1].time)
        throw Utils.report("Timeline.setPoint(", i, ",",
            p.time, "=", Time.unparse(p.time),
            ") bad time order ", this.points[i + 1].time,
            "=", Time.unparse(this.points[i + 1].time));
    if (i > 0 && p.time <= this.points[i - 1].time)
        throw "Bad time order";
    if (p.value < this.min || p.value > this.max)
        throw Utils.report("Timeline.setPoint ", i, ",", p,
            " out of range ", this);
    this.points[i].time = p.time;
    this.points[i].value = p.value;
};

/**
 * Set a point, constraining the new location to be in range both in
 * value and between the points either side of it.
 * @param idx the index of the point to set
 * @param tp a point object giving the (time,value) to set. Will be
 * rewritten to the constrained point.
 * @return true if the point was changed
 */
Timeline.prototype.setPointConstrained = function (idx, tp) {
    // Clip
    if (tp.value < this.min) tp.value = this.min;
    if (tp.value > this.max) tp.value = this.max;
    if (tp.time < 0) tp.time = 0;
    if (tp.time >= this.period) tp.time = this.period - 1;

    // Constrain first and last points
    if (idx === 0)
        tp.time = 0;
    else {
        var prevtime = this.points[idx - 1].time;
        if (tp.time <= prevtime) tp.time = prevtime + 1;
    }

    if (idx === this.points.length - 1)
        tp.time = this.period - 1;
    else {
        var nexttime = this.points[idx + 1].time;
        if (tp.time >= nexttime) tp.time = nexttime - 1;
    }

    var cp = this.points[idx];
    if (tp.time == cp.time && tp.value == cp.value)
        return false;

    cp.time = tp.time;
    cp.value = tp.value;
    return true;
};