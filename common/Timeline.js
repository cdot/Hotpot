/**
 * A timeline is an array of points representing the total span of
 * the timeline. Each point has fields { time, value } where time is
 * a time in milliseconds and value is in the range
 * min_value..max_value (out of range values are NOT clipped).
 * Points are ordered in increasing time. The total period
 * is defined by the time distance between first and last points.
 * Timelines are initialised with start and end points both at value
 * (min + max) / 2
 * @param length the length of the timeline
 * @param min the minimum value a time point can take
 * @param max the maximum value a time point can take
*/
function Timeline(length, min, max) {
    if (length <= 0)
        throw "Bad length";
    if (min >= max)
        throw "Reverse or zero value range";

    this.min = min;
    this.max = max;
    this.points = [
        { time: 0, value: (min + max) / 2 },
        { time: length, value: (min + max) / 2 }
    ];
};

Timeline.prototype.getMin = function() {
    return this.min;
};

Timeline.prototype.getMax = function() {
    return this.max;
};

/**
 * Get the value at the given time
 */
Timeline.prototype.valueAtTime = function(t) {
    var lp = this.points[0];
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
