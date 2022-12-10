/*@preserve Copyright (C) 2017-2022 Crawford Currie http://c-dot.co.uk license MIT*/
/*eslint-env browser,node*/

define([ "js/common/Utils", "js/common/Time" ], (Utils, Time) => {

  /**
   * A sample or value at a point in time.
   */
  class TimeValue {

    /**
     * @param {object|number|string} time either a prototype object
		 * containing time: and value:, or a simple number
		 * giving the time in epoch ms. If `time` is an object, `value` is
		 * ignored. If `time` is a number or string, and `value`
		 * is undefined, it will be taken as 0.
		 * Time strings are parsed using {@link Time}.
     */
    constructor(time, value) {
      /**
       * time (epoch ms relative to start of timeline)
       * @member {number}
       */
      this.time = time;

      /**
       * Value at this time
       * @member {number}
       */
      this.value = value || 0;

      if (typeof time === 'object')
				Utils.extend(this, time);

      if (typeof this.time === 'string') {
        const s = this.time;
        delete this.time;
        this.time = Time.parse(s);
      }

      if (typeof this.value === 'string') {
        const s = this.value;
        delete this.value;
        this.value = Number.parseFloat(s);
      }
    }

    /**
     * Promise to get a serialisable version of the point
     * @return {Promise} Promise resolving to a JSONifiable object
     */
    getSerialisable() {
      return Promise.resolve({
        time: Time.formatHMS(this.time),
        value: this.value
      });
    }

    /**
		 * Get a serialisable 1D array of number for an array
		 * of TimeValue.
		 * @param {TimeValue[]} report sample data
     * @param {number} since earliest datime we are interested
     * in, ignore samples before this.
     * @return {Promise} resolves to an array. First element is
     * the base time in epoch ms, subsequent elements are
     * alternating delta times (relative to basetime, in ms) and
		 * sample values.
		 */
		static encodeTrace(report, since) {
			const basetime = report.length > 0
				    ? (report[0].time || 0)
				    : Date.now();
      const res = [basetime];
      for (let i in report) {
        if (typeof since === "undefined"
					  || report[i].time >= since) {
          res.push(report[i].time - basetime);
          res.push(report[i].value);
        }
      }
      return res;
		}

		/**
		 * Decode a 1D-array as generated by {@link #encodeTrace}
		 * @param {number[]} data serialised trace
		 * @return {Timeline.TimeValue[]} array of samples
		 */
		static decodeTrace(data) {
			const points = [];
			const basetime = data[0] || 0; // might be null?
			for (let i = 1; i < data.length; i += 2) {
				points.push(new TimeValue(
          basetime + (data[i] || 0),
          data[i + 1] || 0));
			}
			return points;
		}
  }

  /**
   * Configuration model of a TimeValue
   */
  TimeValue.Model = {
    $class: TimeValue,
    $doc: "a value at a given time",
    time: {
      $unchecked: true,
      $doc: "time"
    },
    value: {
      $class: Number,
      $doc: "value at this time"
    }
  };

	return TimeValue;
});
