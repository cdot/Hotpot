/*@preserve Copyright (C) 2023 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Object representing a request made to a thermostat. Requests are time
 * limited, and provide an instructor to the thermostat as to how it is
 * to behave during that time.
 */
class Request {

  /**
   * Special `until` value that tells the thermostat to keep raising
   * the temperature until a target temperature is met, then revert to
   * the rules.
   * @property {number}
   */
  static BOOST = -274;

  /**
   * Special `until` value that tells the thermostat to clear all
   * requests from the source.
   * @member {number}
   */
  static CLEAR = -275;

  /**
   * Special `temperature` value that tells the thermostat not to
   * turn on until the time has passed.
   * @member {number}
   */
  static OFF   = -276;

  /**
   * Source of the request. This is a string uniquely identifying
   * the source, such as the browser or a calendar, that submitted
   * the request.
   */
  source = undefined;

  /**
   * Expiry time for the request, epoch ms,
   * or special target Request.BOOST or Request.CLEAR.
   * @member {number}
   */
  until = 0;

  /**
   * Target temperature for the duration of the request,
   * overriding the temperature from the timeline, or `Request.OFF`.
   * @member {number}
   */
  temperature = 0;

  static parseTime(t) {
    if (typeof t === "number")
      return t;
    if (typeof t === "string") {
      if (/^boost$/i.test(t))
        return Request.BOOST;
      if (/^clear$/i.test(t))
        return Request.CLEAR;
      if (/^-?\d+$/.test(t))
        return parseInt(t);
      return new Date(t).getTime();
    }
    if (typeof t === "object" && t instanceof Date)
      return t.getTime();
    throw Error(`Bad time ${t}`);
  }

  /**
   * @param {object} data request definition
   * @param {string} data.source where the request came from
   * e.g. "Calendar"
   * @param {number|string|Date} data.until an epoch ms as a number, a
   * Date, or a string, or one of the special strings "boost" (-274)
   * or "clear" (-275).
   * @param {number|string} data.temperature celcius, as a number or
   * number string, or the special string "off". Note that -276 also
   * means "off".
   */
  constructor(data) {

    if (/^off$/i.test(data.temperature))
      data.temperature = Request.OFF;
    else if (/^boost$/i.test(data.temperature))
      data.temperature = Request.OFF;

   if (typeof data.temperature === "number")
      this.temperature = data.temperature;
    else if (/^off$/i.test(data.temperature))
      this.temperature = Request.OFF;
    else if (/^-?\d+$/.test(data.temperature))
      this.temperature = parseInt(data.temperature);
    else
      throw Error(`Bad "temperature" ${data.temperature}`);

    if (this.temperature !== Request.BOOST)
      this.until = Request.parseTime(data.until);

    if (typeof data.source !== "string")
      throw Error(`Bad "source" ${data.source}`);

    this.source = data.source;
  }
}

export { Request }
