/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Q = require("q");
const Fs = require("fs");
const readFile = Q.denodeify(Fs.readFile);

const Utils = require("../common/Utils.js");
const Time = require("../common/Time.js");

const CACHE_LENGTH = 24 * 60 * 60 * 1000; // cache size in ms

const TAG = "Calendar";

/**
 * Calendar event cache entry. Events stored here are filtered; only central
 * heating events are cached. The cache size is limited by CACHE_LENGTH.
 * Longer means less frequent automatic updates, and larger memory
 * footprint for the server, but less network traffic.
 * @ignore
 */
function ScheduledEvent(cal, id, start, end, pin, state) {
    var now = Time.now();
    this.calendar = cal;
    this.id = id;
    this.pin = pin;
    this.state = state;
    this.startms = start;
    this.endms = end;

    var self = this;
    if (start > now) {
        Utils.TRACE(TAG, "Event will start at ", Date, start,
                   " now is ", Date, now);
        this.event = setTimeout(function() {
            self.start();
        }, start - now);
    } else if (start <= now && end > now) {
        Utils.TRACE(TAG, "Event has already started");
        this.start();
    } else {
        Utils.TRACE(TAG, "Event is already finished");
    }
}

ScheduledEvent.prototype.cancel = function() {
    Utils.TRACE(TAG, this.id, " cancelled");
    if (typeof this.event !== "undefined")
        clearTimeout(this.event);
    if (typeof this.calendar.remove === "function")
        this.calendar.remove(this.id, this.pin);
    this.event = undefined;
};

ScheduledEvent.prototype.start = function() {
    Utils.TRACE(TAG, this.id, " starting");
    if (typeof this.calendar.trigger === "function")
        this.calendar.trigger(this.id, this.pin, this.state, this.endms);
    var self = this;
    this.event = setTimeout(function() {
        self.calendar.remove(self.id, self.pin);
    }, this.endms - Time.now());
};

/**
 * Get active events from a Google calendar.
 * @param {string} name name of the calendar
 * @param {Config} config configuration
 * * `id`: calendar id, as used by Google
 * * `auth_cache`: file to cache authorisation in
 * * `secrets`: secrets used by google OAuth
 *   * `client_id`
 *   * `client_secret`
 *   * `redirect_uris`
 * @param {function} trigger callback triggered when an event starts
 * (or after an update and the event has already started).
 * ```
 * trigger(String id, String pin, int state, int until)
 * ```
 * * `id` id of the event
 * * `pin` in the even is for (or `ALL` for all pins)
 * * `state` required state 0|1|2
 * * `until` when the event ends (epoch ms)
 * @param {function} remove callback invoked when a scheduled event is removed.
 * ```
 * remove(String id, String pin)
 * ```
 * * `id` id of the event being removed
 * * `pin` pin the event appies to
 * @class
 */
function Calendar(name, config, trigger, remove) {
    "use strict";
    this.name = name;
    this.config = config;
    this.oauth2Client = undefined;
    this.schedule = [];
    this.trigger = trigger;
    this.remove = remove;
}
module.exports = Calendar;

/**
 * Return a promise to start the calendar
 * @private
 */
Calendar.prototype.authorise = function() {
    "use strict";
    if (typeof this.oauth2Client !== "undefined")
        return Q(); // already started

    var self = this;

    return readFile(Utils.expandEnvVars(self.config.auth_cache))

    .then(function(token) {
        var clientSecret = self.config.secrets.client_secret;
        var clientId = self.config.secrets.client_id;
        var redirectUrl = self.config.secrets.redirect_uris[0];
        var googleAuth = require("google-auth-library");
        var auth = new googleAuth();
        self.oauth2Client = new auth.OAuth2(
            clientId, clientSecret, redirectUrl);
        self.oauth2Client.credentials = JSON.parse(token);
    });
};

/**
 * Return a promise that will update the list of the events
 * stored for the next 24 hours.
 * @private
 */
Calendar.prototype.fillCache = function() {
    "use strict";
    var self = this;

    return this.authorise()

    .then(function() {
        var google = require("googleapis");
        var calendar = google.calendar("v3");
        var now = Time.now();

        // Q.denodeify doesn't work for this, so have to promisify it
        // manually :-(
        return Q.Promise(function(ok, fail) {
            calendar.events.list(
                {
                    auth: self.oauth2Client,
                    calendarId: "primary",//self.config.id,
                    // For reasons undocumented by google, if timeMin and
                    // timeMax are the same time it returns no events. So
                    // we need to offset them by a second.
                    timeMin: (new Date()).toISOString(),
                    timeMax: (new Date(now + CACHE_LENGTH))
                              .toISOString(),
                    q: "Hotpot:",
                    singleEvents: true
                },
                function(err, response) {
                    if (err) {
                        Utils.TRACE(TAG, self.name, " update failed ", err);
                        fail(err);
                    } else {
                        ok(response);
                    }
                });
        });
    })

    .then(function(response) {
        self.clearSchedule();
        var events = response.items;
        for (var i = 0; i < events.length; i++) {
            var event = events[i];
            var start = Date.parse(event.start.dateTime || event.start.date);
            var end = Date.parse(event.end.dateTime || event.end.date);
            // Can have orders in the event summary or the description
            var fullText = event.summary + " " + event.description;
            var re = /HOTPOT\s*:\s*([A-Z]+)[=\s]+([A-Z0-9]+)/ig;
            var match;
            while ((match = re.exec(fullText)) !== null) {
                var pin = match[1];
                if (pin.toUpperCase() === "ALL")
                    pin = "ALL";
                var state = match[2];
                if (/^[0-9]+$/i.test(state))
                    state = parseInt(state);
                else if (/^(off|away)$/i.test(state))
                    state = 0;
                else if (/^on$/i.test(state))
                    state = 1;
                else if (/^boost$/i.test(state))
                    state = 2;
                else {
                    Utils.TRACE(TAG, "Ignored bad calendar entry ",
                                Date, start, "..",
                                Date, end, " ",
                                pin, "=", state);
                    continue;
                }
                Utils.TRACE(TAG, "Got entry ", Date, start, "..",
                            Date, end, " ",
                            pin, "=", state);
                self.schedule.push(new ScheduledEvent(
                    self,
                    "Calendar:" + self.name + ":" + self.schedule.length,
                    start, end, pin, state));
            }
        }
        Utils.TRACE(TAG, self.name, " ready");
    })

    .catch(function(e) {
        throw "Calendar had an error: " + e.stack;
    });
};

/**
 * Clear the existing schedule
 * @private
 */
Calendar.prototype.clearSchedule = function() {
    for (var i in this.schedule)
        this.schedule[i].cancel();
    this.schedule = [];
};

/**
 * Schedule a calendar update in 'after' milliseconds. The update is
 * performed asynchronously.
 * @param {Number} after delay before updating the calendar asynchronously
 * @private
 */
Calendar.prototype.update = function(after) {
    "use strict";
    var self = this;

    // Kill the old timer
    if (this.update_timeout)
        clearTimeout(this.update_timeout);
    this.update_timeout = setTimeout(function() {
        Utils.TRACE(TAG, "Updating '", self.name, "'");
        self.fillCache().done(function() {
            self.update_timeout = undefined;
            self.update(CACHE_LENGTH);
        });
    }, after);
};
