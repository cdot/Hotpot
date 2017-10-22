/*@preserve Copyright (C) 2017 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Vec = require("../common/Vec.js");

/**
 * A timeline is a config object that represents a continuos graph giving a value
 * at each point over a time line.
 * Times are milliseconds and values in the range
 * min_value..max_value (out of range values are NOT clipped).
 * New Timelines are initialised with a straight line at value
 * (min + max) / 2
 * @param {Config} config  see Timeline.prototype.Config
 */
function Timeline(config) {
    this.config = Config.check("Timeline ", config, "timeline", Timeline.prototype.Config);

    if (config.length <= 0)
        throw "Bad length";
    if (config.length < 2) {
        config.push({ time: 0, value: (min + max) / 2 });
        config.push({ time: config.length, value: (min + max) / 2 });
    }
    for (var i = 0; i < config.length; i++) {
        this.push({ time: config[i].time, value: config[i].value });
    }
};
module.exports = Timeline;

Timeline.prototype.Config = {
    $doc: "Array of time points",
    $array_of: {
        $doc: "vertex on a timeline graph",
        time: {
            $type: "number",
            $doc: "time"
        },
        value: {
            $type: "number",
            $doc: "value at this time"
        }
    }
};

/**
 * Get the value at the given time
 */
Timeline.prototype.valueAtTime = function(t) {
    var lp = this.points[0];
    if (p.time < lp.time)
        throw "Time is outside timeline";
    for (var i = 0; i < this.points.length; i++) {
        var p = this.points[i];
        if (p.time > t) {
            // Interpolate between last point and this point
            return lp.value + (t - lp.time) *
                (p.value - lp.value) / (p.time - lp.time);
        }
        lp = p;
    }
    throw "Time is outside timeline";
}

Timeline.prototype.insertBefore = function(next, point) {
    if (next === 0)
        throw "Can't insert before 0 point";
    this.points.splice(next, 0, point);
};

Timeline.prototype.remove = function(idx) {
    if (idx === 0 || idx === this.points.length - 1)
        throw "Can't remove extreme points";
    this.points.splice(idx, 1);
};

Timeline.prototype.nPoints = function() {
    return this.points.length;
};

Timeline.prototype.getFirstPoint = function() {
    return this.points[0];
};

Timeline.prototype.getLastPoint = function() {
    return this.points[this.points.length - 1];
};

Timeline.prototype.getPoint = function(i) {
    if (i < 0 || i >= this.points.length)
        throw "Not a point";
    return this.points[i];
    
};

Timeline.prototype.setPoint = function(i, p) {
    if (i < 0 || i >= this.points.length)
        throw "Not a point";
    this.points[i].time = p.time;
    this.points[i].value = p.value;
};
