/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Q = require("q");
const Fs = require("fs");
const readFile = Q.denodeify(Fs.readFile);

const Utils = require("../common/Utils.js");
const Time = require("../common/Time.js");
const DataModel = require("../common/DataModel.js");

// MS in an hour
const HOURS = 60 * 60 * 1000;

const TAG = "Calendar";

/**
 * Calendar event cache entry. Events stored here are filtered; only central
 * heating events are cached. The cache size is limited by the config.
 * Longer means less frequent automatic updates, and larger memory
 * footprint for the server, but less network traffic.
 * Hotpot events are read from the summary and description fields of calendar
 * events. They are of the form
 * ```
 * <event> : <prefix> <service> [=] <command>? <target>
 * ```
 * where <prefix> is an optional prefix (HOTPOT:), <service> is a service
 * name e.g. CH, <command> is an optional command e.g. BOOST and
 * target is a temperature in  degrees C. For example,
 * ```
 * Hotpot:CH BOOST 18
 * ```
 * is a command to boost the central heating up to 18C. The prefix and
 * <command> are case-insensitive.
 *
 * @ignore
 */
function ScheduledEvent(cal, id, start, end, service, state) {
    // Reference to container {Calendar}
    this.calendar = cal;
    // Event ID
    this.id = id;
    // Service the event applies to e.g. "CH"
    this.service = service;
    // Required state
    this.state = state;
    // Start of the event, in epoch ms
    this.startms = start;
    // End of the event, in epoch ms
    this.endms = end;

    var self = this;
    var now = Time.now();
    if (start > now) {
        Utils.TRACE(TAG, self.id, "(", service, ",", state, ") will start at ", new Date(start),
            " now is ", new Date());
        this.event = setTimeout(function () {
            self.start();
        }, start - now);
    } else if (start <= now && end > now) {
        Utils.TRACE(TAG, self.id, " began in the past");
        this.start();
    } else {
        Utils.TRACE(TAG, self.id, " is already finished");
    }
}

// Cancel this event. Will remove the event from the containing calendar.
ScheduledEvent.prototype.cancel = function () {
    Utils.TRACE(TAG, this.id, " cancelled");
    if (typeof this.event !== "undefined") {
        clearTimeout(this.event);
        this.event = undefined;
    }
    if (typeof this.calendar.remove === "function") {
        this.calendar.remove(this.id, this.service);
    }
};

// Start this event. The calendar trigger will be called.
ScheduledEvent.prototype.start = function () {
    var self = this;

    Utils.TRACE(TAG, this.id, " starting");
    if (typeof this.calendar.trigger === "function")
        this.calendar.trigger(this.id, this.service, this.state, this.endms);

    Utils.runAt(function () {
        Utils.TRACE(TAG, self.id, " finished");
        self.calendar.remove(self.id, self.service);
    }, this.endms);
};

/**
 * Get active events from a Google calendar.
 * @param {string} name name of the calendar
 * @param {object} proto see Calendar.Model
 * @class
 */
function Calendar(proto, name) {
    "use strict";
    Utils.extend(this, proto);
    // @property {String} name name of the calendar
    this.name = name;
    // GoogleAuthClient.OAuth2
    this.oauth2Client = undefined;
    // Current events schedule
    this.schedule = [];
    // Trigger function called when an event starts
    this.trigger = null;
    // Function called when an event is removed
    this.remove = null;
    // current timeout, as returned by setTimeout
    this.timeoutId = undefined;
    // @property {string} last_update last time the calendars were updated
    this.last_update = undefined;
}
module.exports = Calendar;

/**
 * @param {function} trigger callback triggered when an event starts
 * (or after an update and the event has already started).
 * ```
 * trigger(String id, String service, int state, int until)
 * ```
 * * `id` id of the event
 * * `service` service the event is for (or `ALL` for all services)
 * * `state` required state 0|1|2
 * * `until` when the event ends (epoch ms)
 * @param {function} remove callback invoked when a scheduled event is removed.
 * ```
 */
Calendar.prototype.setTrigger = function (trigger) {
    this.trigger = trigger;
};

/*
 * remove(String id, String service)
 * ```
 * * `id` id of the event being removed
 * * `service` service the event appies to
 */
Calendar.prototype.setRemove = function (remove) {
    this.remove = remove;
};

Calendar.Model = {
    $class: Calendar,
    id: {
        $doc: "calendar id, as used by Google",
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
        $class: DataModel.File,
        $mode: "r"
    },
    require_prefix: {
        $doc: "set true if a 'hotpot:' prefix is required in the calendar",
        $class: Boolean,
        $optional: true
    },
    update_period: {
        $doc: "Delay between calendar reads, in hours",
        $class: Number
    },
    cache_length: {
        $doc: "Period of calendar entries to cache, in hours",
        $class: Number
    }
};

/**
 * Return a promise to start the calendar
 * @private
 */
Calendar.prototype.authorise = function () {
    "use strict";
    if (typeof this.oauth2Client !== "undefined")
        return Q(); // already started

    var self = this;

    return readFile(Utils.expandEnvVars(self.auth_cache))

        .then(function (token) {
            var clientSecret = self.secrets.client_secret;
            var clientId = self.secrets.client_id;
            var redirectUrl = self.secrets.redirect_uris[0];
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
Calendar.prototype.fillCache = function () {
    "use strict";
    var self = this;

    return this.authorise()

        .then(function () {
            var google = require("googleapis");
            var calendar = google.calendar("v3");
            var now = Time.now();

            // Q.denodeify doesn't work for this, so have to promisify it
            // manually :-(
            var params = {
                auth: self.oauth2Client,
                calendarId: self.id,
                // For reasons undocumented by google, if timeMin and
                // timeMax are the same time it returns no events. So
                // we need to offset them.
                timeMin: (new Date()).toISOString(),
                timeMax: (new Date(now + self.cache_length * HOURS))
                    .toISOString(),
                // Expand recurring events
                singleEvents: true
            };

            // If a prefix is required, add a query
            if (self.require_prefix)
                params.q = "Hotpot:";

            self.pending_update = true;
            return Q.Promise(function (ok, fail) {
                calendar.events.list(
                    params,
                    function (err, response) {
                        delete self.pending_update;
                        if (err) {
                            fail("'" + self.name + "' events list failed: " + err);
                        } else {
                            ok(response);
                        }
                    });
            });
        })

        .then(function (response) {
            self.clearSchedule();
            var events = response.items;
            var re = new RegExp(
                (self.require_prefix ? "HOTPOT:\\s*" : "") +
                "([A-Z]+)[=\\s]+((?:BOOST\\s+)?[\\d.]+)", "ig");
            Utils.TRACE(TAG, "'" + self.name + "' has " +
                events.length + " events");
            self.last_update = new Date();
            for (var i = 0; i < events.length; i++) {
                var event = events[i];
                var start = Date.parse(event.start.dateTime || event.start.date);
                var end = Date.parse(event.end.dateTime || event.end.date);
                // Can have orders in the event summary or the description
                var fullText = event.summary + " " + event.description;
                var match;
                while ((match = re.exec(fullText)) !== null) {
                    var service = match[1];
                    var target = match[2].toUpperCase();
                    self.schedule.push(new ScheduledEvent(
                        self,
                        "Calendar '" + self.name + "' event " + i,
                        start, end, service, target));
                }
            }
            Utils.TRACE(TAG, self.name, " ready");
        })

        .catch(function (e) {
            throw "Calendar had an error: " + e;
        });
};


/**
 * The serialisable state of a calendar is the current (or next) active
 * event in the calendar for each unique service in the calendar.
 * {
 *   pending_update: boolean indicates if we are waiting for an update from
 *   the calendar service
 *   service: {
 *     map from service name to current (or next) event for that service
 *   }
 * }
 */
Calendar.prototype.getSerialisableState = function () {
    var state = {
        events: {}
    };
    if (this.pending_update)
        state.pending_update = true;
    var now = Date.now();
    for (var i = 0; i < this.schedule.length; i++) {
        var event = this.schedule[i];
        if (!state.events[event.service]) {
            state.events[event.service] = {
                state: event.state,
                start: event.startms,
                length: event.endms - event.startms
            };
        }
    }
    return Q.fcall(function () {
        return state;
    });
};

/**
 * Clear the existing schedule
 * @private
 */
Calendar.prototype.clearSchedule = function () {
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
Calendar.prototype.update = function (after) {
    "use strict";
    var self = this;

    // Kill the old timer
    if (this.timeoutId)
        clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(function () {
        Utils.TRACE(TAG, "Updating '", self.name, "'");
        self.fillCache().then(
            function () {
                self.timeoutId = undefined;
                self.update(self.update_period * HOURS);
            },
            function (err) {
                // Report, but don't propagate, the error
                Utils.ERROR(TAG, err);
            });
    }, after);
};

Calendar.prototype.listCalendars = function () {
    "use strict";
    var self = this;

    return this.authorise()

        .then(function () {
            var google = require("googleapis");
            var calendar = google.calendar("v3");

            // Q.denodeify doesn't work for this, so have to promisify it
            // manually :-(
            return Q.Promise(function (ok, fail) {
                calendar.calendarList.list({
                        auth: self.oauth2Client
                    },
                    function (err, response) {
                        if (err) {
                            fail("calendarList failed: " + err);
                        } else {
                            ok(response.items);
                        }
                    });
            });
        });
};