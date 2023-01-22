/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Common code for running tests. In a test, set an expectation that N
 * asynchronous events will be seen, and promise to wait for them all.
 * All events must still complete within the mocha test timeout.
 */
class Expectation {
	/**
	 * Construct an expectation that nEvents will be seen
	 * @param {number} nEvents number of events to watch for
	 */
	constructor(nEvents) {
		this.state = [];
		this.promises = [];
		for (let i = 0; i < nEvents; i++) {
			this.state.push(false);
			this.promises.push(new Promise(async (resolve, reject) => {
        const n = i;
				while (!this.state[i]) {
          //console.debug("Awaiting", n);
					await new Promise(resolve => setTimeout(resolve, 100));
				}
				resolve(i);
			}));
		}
	}

	/**
	 * Report that one of the expected events was seen
	 * @param {number} event the event that was seen
	 */
	saw(event) {
		if (event < 0 || event >= this.state.length)
			throw `Bad saw(${event})`;
		this.state[event] = true;
	}

	/**
	 * Wait for all expected events to be seen
	 * @return {Promise} a promise to wait
	 */
	expect() {
		return Promise.all(this.promises);
	}
}

export { Expectation }

