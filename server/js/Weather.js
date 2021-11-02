/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("server/js/Weather", [
	"common/js/Utils", "common/js/DataModel", "server/js/Historian"
], (
	Utils, DataModel, Historian
) => {

	const TAG = "Weather";

	/**
	 * Abstract base class of weather agents. Specific agent implementations
     * should subclass, e.g. MetOffice, this class should not be
     * instanted directly (or used in a .Model)
	 * The base class functionality is limited to managing an update
	 * timer.  Note that nothing will happen until you call
	 * setLocation to set the location for which the weather is being
	 * received (which must not be done before you have called
	 * initialise())
	 */
	class Weather {

        /**
         * Get weather reports from a service
         * @param {object} proto see Weather.Model
         * @param {string} name name of the service
         */
		constructor(proto, name) {
            Utils.extend(this, proto);
			/**
			 * Name of this service
			 * @member {string}
			 */
            this.name = name;
			/**
			 * Time of last update (epoch ms)
			 * @member {number}
			 */
            this.last_update = 0;
		}

        /**
         * Return a promise to initialise the agent
         */
        initialise() {
            return Promise.resolve();
        };

        /**
         * Return a promise to set the lat/long of the place we are getting
         * weather data for. This will start the automatic updater that will
         * refresh the weather cache with new data as and when it comes
		 * available.
         * @param {Location} loc where we are
		 * @return {Promise} to set the location and start retrieving updates
         */
        setLocation(loc) {
			this.stop();
            this.location = loc;
			return this.update(true);
        };

        /**
         * Get a promise for the current state of the weather forecast.
         * @return {Promise} a promise resolving to a structure containing
		 * the weather information
         */
        getSerialisableState() {
            return Promise.resolve({temperature: 0});
        };

        /**
         * Promise to get serialisable configuration. See common/DataModel
         */
        getSerialisable(context) {
            return DataModel.getSerialisable(
                    this.history, Historian.Model, context.concat('history'))

                .then(h => {
                    return {
                        api_key: this.api_key,
                        history: h
                    };
                });
        };

        /**
         * Get a promise for the current log of the weather forecast. This
         * simply records the estimated outside temperature.
         * @param {number} since optional param giving start of logs as a ms datime
         */
        getSerialisableLog(since) {
            if (!this.history)
                return Promise.resolve();
            return this.history.getSerialisableHistory(since)
                .then(h => {
                    // Clip to the current time
                    let before = -1,
                        after = -1;
                    let now = Date.now();
                    for (let i = 1; i < h.length; i += 2) {
                        if (h[0] + h[i] <= now)
                            before = i;
                        else {
                            after = i;
                            break;
                        }
                    }
                    let est;
                    if (before >= 0 && after > before) {
                        est = h[before + 1];
                        if (h[after + 1] !== est) {
                            let frac = ((now - h[0]) - h[before]) / (h[after] - h[before]);
                            est += (h[after + 1] - est) * frac;
                        }
                    }
                    h.splice(after);
                    if (typeof est !== "undefined") {
                        h.push(now - h[0]);
                        h.push(est);
                    }
                    return h;
                });
        };

		/**
		 * Implement in subclasses
		 * @return {Promise} resolving to time of next update (or 0 to
		 * stop updates)
		 */
		getWeather() {
			return Promise.resolve(0);
		}

		/**
         * Update the current forecast, and schedule the
         * next update.
         * @private
         */
        update() {
			if (this.updateTimer) {
				Utils.cancelTimer(this.updateTimer);
				delete this.updateTimer;
			}
            return this.getWeather()
            .then(wait => {
                this.last_update = Date.now();
                if (wait > 0) {
					this.updateTimer = Utils.startTimer(
						"weather", () => {
							this.update();
						}, wait);
				}
            });
        }

        /**
         * Clear the update timer
         */
        stop() {
            if (this.updateTimer) {
                Utils.cancelTimer(this.updateTimer);
                delete this.updateTimer;
				Utils.TRACE(TAG, `'${this.name}' stopped`);
            }
        }
	}

    /**
     * Configuration model, for use with {@link DataModel}
     * @typedef Weather.Model
     * @property {Historian} history Logger
     */
    Weather.Model = {
        $class: Weather,
        history: Utils.extend({
            $optional: true
        }, Historian.Model)
    };

	return Weather;
});
