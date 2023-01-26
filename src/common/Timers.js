/*@preserve Copyright (C) 2016-2023 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser,node */

import debug from "debug";

const TIMERS = {};
let TIMER_ID = 1;

const trace = debug("Timers");

/**
 * Like setTimeout, but run at a given date rather than after
 * a delta. date can be a Date object or an epoch time in ms
 * @param {function} func the function to run (no arguments)
 * @param {Date|number} date may be a Date object or a time as epoch ms
 */
function runAt(func, date) {
  const now = (new Date()).getTime();
  const then = (date instanceof Date) ? date.getTime() : date;
  const diff = Math.max((then - now), 0);
  if (diff > 0x7FFFFFFF) // setTimeout limit is MAX_INT32=(2^31-1)
    startTimer("runAt", () => runAt(func, date), 0x7FFFFFFF);
  else
    startTimer("runAt", func, diff);
};

/**
 * Start a tracked timer. Tracked timers are used to associate
 * `setTimeout` calls with the time they will fire. Tracked
 * timers recorded as a map from the timer id (returned by
 * this function) to a structure:
 * ```
 * {
 *  timer: (system id of timer),
 *  when: (epoch ms when the timer runs down)
 * }
 * ```
 * @param {String} descr description of the timer
 * @param {function} fn function to run (no parameters)
 * @param {number} timeout delta time to run the function
 * @return {string} a unique id that can be used to refer to the timer
 */
function startTimer(descr, fn, timeout) {
  const id = `${descr}:${TIMER_ID++}`;
  trace("%s started", id);
  TIMERS[id] = {
    timer: setTimeout(() => {
      trace("%s fired", id);
      delete TIMERS[id];
      fn();
    }, timeout),
    when: Date.now() + timeout
  };
  return id;
}

/**
 * Cancel a tracked timer.
 * See {@link startTimer} for more about tracked timers.
 * @param {string} id as returned by startTimer
 */
function cancelTimer(id) {
  if (TIMERS[id]) {
		trace("%s cancelled", id);
		clearTimeout(TIMERS[id].timer);
		delete TIMERS[id];
	} else
		trace("%s ALREADY CANCELLED", id);
}

export { runAt, startTimer, cancelTimer }
