/*@preserve Copyright (C) 2017 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser,node */

define("common/js/Timeline", ['common/js/Utils', 'common/js/Time'], function(Utils, Time) {

	const TAG = "Timeline";

	class Timepoint {
		constructor(proto) {

			Utils.extend(this, proto);

			if (typeof this.time === "undefined") {
				if (typeof this.times === "undefined")
					throw Utils.exception(
						"Timepoint", "must have time or times");
				this.time = Time.parse(this.times);
				delete this.times;
			} else if (typeof this.times !== "undefined")
				throw Utils.exception(
					"Timepoint", "must have time or times, not both");
		}

		getSerialisable() {
			return Promise.resolve({
				times: Time.formatHMS(this.time),
				value: this.value
			});
		};
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

	/**
	 * A timeline is an object that represents a continuous graph
	 * giving a value at each point over a time line. The timeline starts
	 * at 0 and runs for a period in milliseconds i.e. to (period - 1)
	 * Times are milliseconds and values in the range
	 * {min}..{max} (out of range values are validated).
	 * New Timelines are initialised with a straight line at value
	 * (min + max) / 2
	 * @param proto see Timeline.Model
	 * @class
	 */
	class Timeline {
		constructor(proto) {

			Utils.extend(this, proto);

			if (typeof this.max !== "number"
				|| typeof this.min !== "number"
				|| this.max < this.min
				|| typeof this.period !== "number"
				|| this.period <= 0)
				throw Utils.exception(TAG, "Bad configuration");

			if (typeof this.points === "undefined")
				this.points = [];

			// Use setPoint to validate points passed
			for (let i = 1; i < this.points.length; i++)
				this.setPoint(i);

			this._fixExtremes();
		}

		// Private function to add extreme points if needed
		_fixExtremes() {
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
		 * @throws {Hotpot
		 */
		getPointAfter(t) {
			if (t < 0 || t >= this.period)
				throw Utils.exception(
					TAG, `${t} is outside timeline 0..${this.period - 1}`);
			for (let i = 1; i < this.points.length - 1; i++) {
				if (this.points[i].time > t)
					return i;
			}
			return this.points.length - 1;
		};

		/**
		 * Get the maximum value at any time
		 * @return {float} the maximum value
		 */
		getMaxValue() {
			let max = this.points[0].value;
			for (let i = 1; i < this.points.length; i++) {
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
		valueAtTime(t) {
			let i = this.getPointAfter(t);
			let lp = this.points[i - 1];
			let p = this.points[i];
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
		insertBefore(index, point) {
			if (index <= 0 || index >= this.points.length)
				throw Utils.exception(
					TAG, `Index ${index} is outside timeline 0..${this.points.length - 1}`);
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
		remove(idx) {
			if (idx <= 0 || idx >= this.points.length - 1)
				throw Utils.exception(
					TAG, `${idx} cannot be removed from 0..${this.points.length - 1}`);
			this.points.splice(idx, 1);
			return this;
		};

		/**
		 * Get total number of points
		 * @return number of points
		 */
		get nPoints() {
			return this.points.length;
		};

		/**
		 * Get the point at the given index
		 * @return the point object
		 */
		getPoint(i) {
			if (i < 0 || i >= this.points.length)
				throw Utils.exception(
					TAG, `getPoint ${i} not in 0..${this.points.length - 1}`);
			return this.points[i];

		};

		/**
		 * Set a point, validating the new settings are in range
		 * relative to the points neighbouring it.
		 * @param i the index of the point to set
		 * @param p a point object giving the (time,value) to set. If this is
		 * undefined, it will validate the point already at i
		 */
		setPoint(i, p) {
			if (i < 0 || i >= this.points.length)
				throw Utils.exception(
					TAG, `Point ${i} not in timeline`);
			if (typeof p === "undefined")
				p = this.points[i];
			if (p.time < 0 || p.time >= this.period) {
				throw Utils.exception(
					TAG,
					`Time ${p.time} outside period 0..${this.period - 1}`);
			}
			if (i < this.points.length - 1 && p.time >= this.points[i + 1].time)
				throw Utils.exception(
					TAG, `setPoint ${p.time} is later than following point @${this.points[i + 1].time}`);
			if (i > 0 && p.time <= this.points[i - 1].time)
				throw Utils.exception(
					TAG, `setPoint ${p.time} is earlier than preceding point @${this.points[i - 1].time}`);
			if (p.value < this.min || p.value > this.max)
				throw Utils.exception(
					TAG,
					`setPoint value ${p.value} is out of range ${this.min}..${this.max}`);
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
		setPointConstrained(idx, tp) {
			if (idx < 0 || idx >= this.points.length)
				throw Utils.exception(
					TAG, `Point ${idx} not in timeline`);

			// Clip
			if (tp.value < this.min) tp.value = this.min;
			if (tp.value > this.max) tp.value = this.max;
			if (tp.time < 0) tp.time = 0;
			if (tp.time >= this.period) tp.time = this.period - 1;

			// Constrain first and last points
			if (idx === 0)
				tp.time = 0;
			else {
				let prevtime = this.points[idx - 1].time;
				if (tp.time <= prevtime) tp.time = prevtime + 1;
			}

			if (idx === this.points.length - 1)
				tp.time = this.period - 1;
			else {
				let nexttime = this.points[idx + 1].time;
				if (tp.time >= nexttime) tp.time = nexttime - 1;
			}

			let cp = this.points[idx];
			if (tp.time == cp.time && tp.value == cp.value)
				return false;

			cp.time = tp.time;
			cp.value = tp.value;
			return true;
		};

	}

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

	return Timeline;
});
