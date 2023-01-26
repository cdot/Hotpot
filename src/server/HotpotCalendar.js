/*@preserve Copyright (C) 2016-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import { extend } from "../common/extend.js";
import debug from "debug";
import { promises as Fs } from "fs";
import { ScheduledEvent } from "../common/ScheduledEvent.js";
import { Calendar } from "./Calendar.js";

// MS in an hour
const HOURS = 60 * 60 * 1000;

const trace = debug("HotpotCalendar");

/**
 * @typedef Calendar.Event
 * @property {number} temperature, may be Request.OFF
 * @property {Date} start start date/time
 * @property {Date|string} end date/time or "boost"
 */

/**
 * Simple calendar, saved in a file, with a set of Express routes for
 * management thereof.
 */
class HotpotCalendar extends Calendar {

  constructor(proto) {
    super(proto, "Hotpot Calendar");
  }

  load() {
    return Fs.readFile(this.file)
    .then(buf => {
      if (buf.length === 0)
        return [];
      const now = Date.now();
      const events = JSON.parse(buf.toString());
      // Purge history
      const purged = events.filter(e => e.until >= now);
      return purged;
    })
    .catch(e => {
      console.error("Error loading", this.file, e);
      return [];
    });
  }

  save(events) {
    return Fs.writeFile(this.file, JSON.stringify(events));
  }

  fillCache() {
    return this.load()
    .then(events => {
      const now = new Date().getTime();
      const then = new Date(now + this.cache_length * HOURS).getTime();
      const res = [];
      for (const e of events) {
        if (e.start <= then && e.until >= now)
          res.push(new ScheduledEvent(this, e));
      }
      return res;
    });
  }

  /**
   * Convert data received in a request from a front-end calendar editor
   * into one or more ScheduledEvents.
   * @param {object} data request body
   * @param {number|string|Date} data.start event start time
   * @param {number|string|Date} data.end event end time
   * @param {string} data.title event title
   * @param {string} data.description event description
   * @return {ScheduledEvent[]}
   */
  data2events(data) {
    const events = [];
    ScheduledEvent.parse(
      `${data.title} ${data.description}`,
      e => {
        e.start = ScheduledEvent.parseTime(data.start);
        if (typeof e.until === "undefined")
          e.until = ScheduledEvent.parseTime(data.end);
        events.push(new ScheduledEvent(this, e));
      });
    return events;
  }

  handle_change(id, data) {
    trace(`Change ${id} `, data);
    return this.load()
    .then(events => {
      // Expand incoming calendar events into ScheduledEvents
      const nevents = this.data2events(data);
      if (nevents.length === 0)
        throw Error(`Unable to parse "${data.title} ${data.description}"`);

      // Remove existing events with this id
      events = events.filter(e => e.id !== id);

      // Add back in the parsed events with the same id
      nevents.forEach(ne => {
        ne.id = id;
        events.push(ne);
      });

      return this.save(events);
    });
  }

  handle_add(data) {
    trace("Add %o", data);
    return this.load()
    .then(events => {
      // An incoming event from a UI calendar might spawn multiple
      // ScheduledEvents. They all get the same id.
      const nid = events.reduce((a, e) => Math.max(e.id, a), 0) + 1;

      const nevents = this.data2events(data);
      if (nevents.length === 0)
        throw Error(`Unable to parse "${data.title} ${data.description}"`);

      nevents.forEach(ne => {
        ne.id = nid;
        events.push(ne);
      });

      return this.save(events)
      .then(() => nid);
    });
  }

  handle_remove(id) {
    trace(`Remove ${id}`);
    // TODO: Also to cancel any active requests?
    return this.load()
    .then(events => this.save(events.filter(e => e.id !== id)));
  }
  
  addRoutes(router) {
    router.get(
      "/calendar/events",
      (req, res, next) => {
        return this.load()
        .then(events => res.json(events))
        .catch(next);
      });

    router.post(
      "/calendar/change/:id",
      (req, res, next) => {
        return this.handle_change(req.params.id, req.body)
        .then(() => res.end())
        .catch(next);
      });

    router.post(
      "/calendar/add",
      (req, res, next) => {
        return this.handle_add(req.body)
        .then(id => res.json(id))
        .catch(next);
      });

    router.post(
      "/calendar/remove/:id",
      (req, res, next) => {
        return this.handle_remove(req.params.id)
        .then(() => res.end())
        .catch(next);
      });
  }
}

HotpotCalendar.Model = extend(Calendar.Model, {
  $class: HotpotCalendar,
  file: {
    $doc: "Full path to the events file",
    $class: String
  }
});

export { HotpotCalendar }
