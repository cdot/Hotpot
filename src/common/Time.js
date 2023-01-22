/*@preserve Copyright (C) 2016-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser,node */

import { Utils } from "./Utils.js";

const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms

/**
 * Functions for handling times relative to a 24h period
 * @namespace
 */
class Time {

  /**
   * Get midnight, today, as a number of ms since the epoch
   * @return {number} midnight as number of ms since epoch
   */
  static midnight() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /**
   * Parse a server local time HH[:MM[:SS]] string to a number
   * of ms offset from midnight.
   * Times must be in the range 00:00:00..23:59:59
   * @param {string} s time string
   * @return {number} number of ms since midnight
   */
  static parse(str) {
    const hms = str.split(":");
    const h = Number.parseInt(hms.shift());
    const m = Number.parseInt(hms.shift() || "0");
    const s = Number.parseFloat(hms.shift() || "0");
    // Set according to local time
    if (h > 23 || m > 59 || s >= 60 || h < 0 || m < 0 || s < 0)
      throw Utils.exception("Time", "out of range 00:00:00..23:59:59");
    return (((h * 60) + m) * 60 + s) * 1000;
  }

  /**
   * Parse a duration expressed as "1 year 4 months 2 weeks 1 day"
   * @param {string} str time string
   * @return {number} duration in ms
   */
  static parseDuration(str) {
    let ms = 0;
    str = str.replace(/[;,]+/g, " ");
    str = str.replace(/(\d+)\s*y(ears?)?/, (m, n) => {
      ms += (n * 365) * 24 * 60 * 60 * 1000;
      return "";
    });
    str = str.replace(/(\d+)\s*mo(nths?)?/, (m, n) => {
      ms += (n * 31) * 24 * 60 * 60 * 1000;
      return "";
    });
    str = str.replace(/(\d+)\s*w(eeks?)?/, (m, n) => {
      ms += (n * 7) * 24 * 60 * 60 * 1000;
      return "";
    });
    str = str.replace(/(\d+)\s*d(ays?)?/, (m, n) => {
      ms += n * 24 * 60 * 60 * 1000;
      return "";
    });
    str = str.replace(/(\d+)\s*h(ours?)?/, (m, n) => {
      ms += n * 60 * 60 * 1000;
      return "";
    });
    str = str.replace(/(\d+)\s*m(inutes?)?/, (m, n) => {
      ms += n * 60 * 1000;
      return "";
    });
    str = str.replace(/(\d+)\s*s(econds?)?/, (m, n) => {
      ms += n * 1000;
      return "";
    });
    str = str.replace(/(\d+)(?::(\d+)(?::(\d+))?)?/, (ma, h, m, s) => {
      h = parseInt(h || 0);
      m = parseInt(m || 0);
      s = parseInt(s || 0);
      ms += (((h * 60) + m) * 60 + s) * 1000;
      return "";
    });
    if (/\S/.test(str))
      throw Error(`Malformed duration ${str}`);
    return ms;
  }

  /**
   * Generate a string that gives the given number of ms since midnight as
   * a time string suitable for use with Time.parse
   * @param {number} number of ms since midnight
   * @result {string} string representation
   */
  static formatHMS(t) {
    function pad(n, w) {
      const k = Math.trunc(n);
      let pad = "";
      for (let pl = w - ("" + k).length; pl > 0; pl--)
        pad += "0";
      return pad + n;
    }
    if (t < 0 || t > ONE_DAY)
      throw Utils.exception("Time", "unparse time out of range");
    const ms = t % 1000;
    t = Math.trunc(t / 1000); // to seconds
    const s = t % 60; // seconds
    t = Math.trunc(t / 60); // to minutes
    const m = Math.trunc(t % 60); // minutes
    const h = Math.trunc(t / 60); // hours
    let ts = pad(h, 2) + ":" + pad(m, 2);
    if (s + ms > 0) {
      ts += ":" + pad(s, 2);
      if (ms > 0)
        ts += "." + pad(ms, 3);
    }
    return ts;
  }

  /**
   * Generate a time difference as an HMS string
   * @param {number} ms delta time in ms
   */
  static formatDelta(ms) {
    const h = Math.floor(ms / (60 * 60 * 1000));
    ms %= 60 * 60 * 1000;
    const m = Math.floor(ms / (60 * 1000));
    ms %= 60 * 1000;
    const s = Math.floor(ms / 1000);
    const d = ((h > 0) ? `${h}h` : "") +
          ((m > 0) ? `${m}m` : "") +
          ((s > 0) ? `${s}s` : "");
    return (d === "") ? "0s" : d;
  }

  static formatDuration(ms) {
    ms = Math.floor(ms / 1000);

    const str = [];
    const y = Math.floor(ms / (365 * 24 * 60 * 60));
    if (y > 0) {
      ms -= y * (365 * 24 * 60 * 60);
      str.push(`${y} year${y === 1 ? "" : "s"}`);
    }
    
    const mo = Math.floor(ms / (31 * 24 * 60 * 60));
    if (mo > 0) {
      ms -= mo * (31 * 24 * 60 * 60);
      str.push(`${mo} month${mo === 1 ? "" : "s"}`);
    }

    const w = Math.floor(ms / (7 * 24 * 60 * 60));
    if (w > 0) {
      ms -= w * (7 * 24 * 60 * 60);
      str.push(`${w} week${w === 1 ? "" : "s"}`);
    }

    const d = Math.floor(ms / (24 * 60 * 60));
    if (d > 0) {
      ms -= d * (24 * 60 * 60);
      str.push(`${d} day${d === 1 ? "" : "s"}`);
    }

    const h = Math.floor(ms / (60 * 60));
    if (h > 0) {
      ms -= h * (60 * 60);
      str.push(`${h} hour${h === 1 ? "" : "s"}`);
    }

    const m = Math.floor(ms / 60);
    if (m > 0) {
      ms -= m * 60;
      str.push(`${m} minute${m === 1 ? "" : "s"}`);
    }

    if (ms > 0) {
      str.push(`${ms} second${ms === 1 ? "" : "s"}`);
    }

    return str.length > 0 ? str.join(" ") : 0;
  }
}

export { Time }
