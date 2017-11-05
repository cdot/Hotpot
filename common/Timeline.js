/*@preserve Copyright (C) 2017 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
/* Must also work in browser */

/**
 * A timeline is an object that represents a continuous graph
 * giving a value at each point over a time line. The timeline starts
 * at 0 and runs for a period in milliseconds.
 * Times are milliseconds and values in the range
 * {min}..{max} (out of range values are validated).
 * New Timelines are initialised with a straight line at value
 * (min + max) / 2
 * @param proto see Timeline.Model
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
    for (var i = 1; i < this.points.length; i++) {
        this.setPoint(i);
    }

    // Add missing points to extremes
    if (this.points.length === 0) {
        this.points.push({time: 0, value: (this.min + this.max) / 2});
        this.points.push({time: this.period,
                          value: (this.min + this.max) / 2});
    }
    if (this.points[0].time !== 0)
        this.points.unshift({time: 0, value: this.points[0].value});
    
    if (this.points[this.points.length - 1].time < this.period)
        this.points.push(
            {time: this.period,
             value: this.points[this.points.length - 1].value});
};

module.exports = Timeline;

Timeline.Model = {
    $type: Timeline,
    min: {
        $doc: "minimum value",
        $type: "number",
        $default: 0
    },
    max: {
        $doc: "maximum value",
        $type: "number",
        $default: 30
    },
    period: {
        $doc: "period of timeline in ms",
        $type: "number",
        $default: 24 * 60 * 60 * 1000 // one day in ms
    },
    points: {
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
    }
};

/**
 * Get the index of the point that follows the given time.
 * @param t the time to test
 */
Timeline.prototype.getNextPoint = function(t) {
    if (t < 0 || t > this.period)
        throw "Time is outside timeline";
    for (var i = 1; i < this.points.length - 1; i++) {
        if (this.points[i].time > t)
            return i;
    }
    return this.points.length - 1;
};

/**
 * Get the value at the given time
 * @param t the time, must be in range of the timeline
 */
Timeline.prototype.valueAtTime = function(t) {
    var i = this.getNextPoint(t);
    var lp = this.points[i - 1];
    var p = this.points[i];
    // Interpolate between last point and this point
    return lp.value + (t - lp.time) *
        (p.value - lp.value) / (p.time - lp.time);
}

/**
 * Insert a point before the point at the given index
 * @param index index of the point to add before (must be > 0)
 * @param point the {time: value:} point to add
 */
Timeline.prototype.insertBefore = function(index, point) {
    if (index <= 0)
        throw "Can't insert before 0 point";
    if (index >= this.points.length)
        throw "index beyond end";
    this.points.splice(index, 0, { time: point.time, value: point.value });
    // Use setPoint to validate it
    try {
        this.setPoint(index);
    } catch (e) {
        this.points.splice(index, 1);
        throw e;
    }
};

/**
 * Remove the point at the given index
 * @param idx index of point to remove
 */
Timeline.prototype.remove = function(idx) {
    if (idx <= 0 || idx >= this.points.length - 1)
        throw "Not a removable point";
    this.points.splice(idx, 1);
};

/**
 * Get total number of points
 * @return number of points
 */
Timeline.prototype.nPoints = function() {
    return this.points.length;
};

/**
 * Get the point at the given index
 * @return the point object
 */
Timeline.prototype.getPoint = function(i) {
    if (i < 0 || i >= this.points.length)
        throw "Out of range";
    return this.points[i];
    
};

/**
 * Set a point, validating the new settings are in range
 * relative to the points neighbouring it.
 * @param i the index of the point to set
 * @param p a point object giving the (time,value) to set. If this is
 * undefined, it will validate the point already at i
 */
Timeline.prototype.setPoint = function(i, p) {
    if (i < 0 || i >= this.points.length)
        throw "Not a point";
    if (typeof p === "undefined")
        p = this.points[i];
    if (p.time < 0 || p.time > this.period)
        throw "Time " + p.time + " outside period 0.." + this.period;
    if (i < this.points.length - 1 && p.time >= this.points[i + 1].time)
        throw "Bad time order";
    if (i > 0 && p.time <= this.points[i - 1].time)
        throw "Bad time order";
    if (p.value < this.min || p.value > this.max)
        throw "Out of range";
    this.points[i].time = p.time;
    this.points[i].value = p.value;
};
