/*@preserve Copyright (C) 2016-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import { Utils } from "../common/Utils.js";

import { Calendar } from "./Calendar.js";

import googleApis from "googleapis";
import { OAuth2Client } from "google-auth-library";

// MS in an hour
const HOURS = 60 * 60 * 1000;

const TAG = "GoogleCalendar";

function googleCalendarAPI() {
  const apis = new googleApis.GoogleApis();
  return apis.calendar("v3");
}

/**
 * Implementation of Calendar using Google calendar
 * @extends Calendar
 */
class GoogleCalendar extends Calendar {

  /**
   * Construct from a configuration data block built using
   * {@link DataModel} and Model
   */
  constructor(proto, name) {
    super(proto, name);
    // GoogleAuthClient.OAuth2
    delete this.oauth2Client;
  }

  /**
   * Return a promise to start the calendar
   * @private
   */
  authorise() {
    if (typeof this.oauth2Client !== "undefined")
      return Promise.resolve(); // already started

    const clientSecret = this.secrets.client_secret;
    const clientId = this.secrets.client_id;
    const redirectUrl = this.secrets.redirect_uris[0];
    this.oauth2Client = new OAuth2Client(
      clientId, clientSecret, redirectUrl);
    this.oauth2Client.credentials = this.auth_cache;
    return Promise.resolve();
  }

  /**
   * Return a promise that will update the list of the events
   * stored for the next `cache_length` hours.
   * The cache size is limited by the config.
   * Longer means less frequent automatic updates, and larger memory
   * footprint for the server, but less network traffic.
   * @private
   */
  fillCache() {

    return this.authorise()

    .then(() => {
      const calendarAPI = googleCalendarAPI();
      const now = Date.now();

      const params = {
        auth: this.oauth2Client,
        calendarId: this.id,
        // For reasons undocumented by google, if timeMin and
        // timeMax are the same time it returns no events. So
        // we need to offset them.
        timeMin: (new Date()).toISOString(),
        timeMax: (new Date(now + this.cache_length * HOURS))
        .toISOString(),
        // Expand recurring events
        singleEvents: true
      };

      // If a prefix is required, add a query
      if (this.prefix)
        params.q = this.prefix;

      this.pending_update = true;
      return new Promise((resolve, reject) => {
        calendarAPI.events.list(
          params,
          (err, response) => {
            delete this.pending_update;
            if (err) {
              console.error(err);
              reject(`'${this.name}' events list failed: ${err}`);
            } else
              resolve(response);
          });
      });
    })

    .then(response => {
      this.clearSchedule();
      const events = response.data.items;
      Utils.TRACE(TAG, `'${this.name}' has ${events.length} events`);
      this.last_update = new Date();
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const start = Date.parse(event.start.dateTime || event.start.date);
        const end = Date.parse(event.end.dateTime || event.end.date);
        // Can have orders in the event summary or the description
        const fullText = `${event.summary};${event.description}`;
        this.parseEvents(start, end, fullText);
      }
      Utils.TRACE(TAG, `'${this.name}' ready`);
    });
  }

  listCalendars() {
    return this.authorise()
    .then(() => {
      Utils.TRACE(TAG, "Listing calendars");
      const calendar = googleCalendarAPI();

      return new Promise((resolve, reject) => {
        calendar.calendarList.list({
          auth: this.oauth2Client
        },
                                   (err, response) => {
                                     if (err) {
                                       reject(`calendarList failed: ${err}`);
                                     } else {
                                       resolve(response.data.items);
                                     }
                                   });
      });
    });
  }
}

/**
 * Configuration model, for use with {@link DataModel}
 * @typedef GoogleCalendar.Model
 * @property {String} id calendar id
 * @property {object} secrets secrets used by google OAuth
 * @property {String} secrets.client_id see README.md
 * @property {String} secrets.client_secret see README.md
 * @property {String} secrets.redirect_uris see README.md
 * @property {object} auth_cache File containing cached oauth authentication
 * @property {String} auth_cache.access_token see README.md
 * @property {String} auth_cache.token_type see README.md
 * @property {String} auth_cache.refresh_token see README.md
 * @property {number} auth_cache.expiry_date see README.md
 */
GoogleCalendar.Model = Utils.extend(Calendar.Model, {
  $class: GoogleCalendar,
  id: {
    // id used by google calendar
    $doc: "calendar id",
    $class: String
  },
  secrets: {
    $doc: "secrets used by google OAuth",
    client_id: {
      $doc: "see README.md",
      $class: String
    },
    client_secret: {
      $doc: "see README.md",
      $class: String
    },
    redirect_uris: {
      $doc: "see README.md",
      $array_of: {
        $class: String
      }
    }
  },
  auth_cache: {
    $doc: "File containing cached oauth authentication",
    access_token: {
      $class: String
    },
    token_type: {
      $class: String
    },
    refresh_token: {
      $class: String
    },
    expiry_date: {
      $class: Number
    },
    $fileable: true
  }
});

export { GoogleCalendar }
