/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const Q = require("q");
const Fs = require("fs");
const readFile = Q.denodeify(Fs.readFile);

const Utils = require("../common/Utils.js");
const Time = require("../common/Time.js");
const Config = require("../common/Config.js");

// MS in an hour
const HOURS = 60 * 60 * 1000;

const TAG = "Calendar";

/**
 * Calendar event cache entry. Events stored here are filtered; only central
 * heating events are cached. The cache size is limited by the config.
 * Longer means less frequent automatic updates, and larger memory
 * footprint for the server, but less network traffic.
 * @ignore
 */
function ScheduledEvent(cal, id, start, end, pin, state) {
    // Reference to container {Calendar}
    this.calendar = cal;
    // Event ID
    this.id = id;
    // Pin the event applies to e.g. "CH"
    this.pin = pin;
    // Required state
    this.state = state;
    // Start of the event, in epoch ms
    this.startms = start;
    // End of the event, in epoch ms
    this.endms = end;
    
    var self = this;
    var now = Time.now();
    if (start > now) {
        Utils.TRACE(TAG, self.id, " will start at ", Date, start,
                   " now is ", Date, now);
        this.event = setTimeout(function() {
            self.start();
        }, start - now);
    } else if (start <= now && end > now) {
        Utils.TRACE(TAG, self.id, " has already started");
        this.start();
    } else {
        Utils.TRACE(TAG, self.id, " is already finished");
    }
}

// Cancel this event. Will remove the event from the containing calendar.
ScheduledEvent.prototype.cancel = function() {
    Utils.TRACE(TAG, this.id, " cancelled");
    if (typeof this.event !== "undefined") {
        clearTimeout(this.event);
        this.event = undefined;
    }
    if (typeof this.calendar.remove === "function") {
        this.calendar.remove(this.id, this.pin);
    }
};

// Start this event. The calendar trigger will be called.
ScheduledEvent.prototype.start = function() {
    var self = this;

    Utils.TRACE(TAG, this.id, " starting");
    if (typeof this.calendar.trigger === "function")
        this.calendar.trigger(this.id, this.pin, this.state, this.endms);

    Utils.runAt(function() {
        Utils.TRACE(TAG, self.id, " finished");
        self.calendar.remove(self.id, self.pin);
    }, this.endms);
};

/**
 * Get active events from a Google calendar.
 * @param {string} name name of the calendar
 * @param {Config} config see Calendar.prototype.Config
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
    // @property {String} name name of the calendar
    this.name = name;
    // Reference to config object
    this.config = config;
    Config.check("Calendar " + name, config, name, Calendar.prototype.Config);
    // GoogleAuthClient.OAuth2
    this.oauth2Client = undefined;
    // Current events schedule
    this.schedule = [];
    // Trigger function called when an event starts
    this.trigger = trigger;
    // Function called when an event is removed
    this.remove = remove;
    // current timeout, as returned by setTimeout
    this.timeoutId = undefined;
    // @property {string} last_update last time the calendars were updated
    this.last_update = undefined;
}
module.exports = Calendar;

Calendar.prototype.Config = {
    id: {
        $doc: "calendar id, as used by Google",
        $type: "string"
    },
    secrets: {
        $doc: "secrets used by google OAuth",
        client_id:  {
            $doc: "see README.md",
            $type: "string"
        },
        client_secret:  {
            $doc: "see README.md",
            $type: "string"
        },
        redirect_uris: {
            $doc: "see README.md",
            $array_of: { $type: "string" }
        }
    },
    auth_cache: {
        $doc: "File containing cached oauth authentication",
        $type: "string", $file: "r"
    },
    require_prefix: {
        $doc: "set true if a 'hotpot:' prefix is required in the calendar",
        $type: "boolean",
        $optional: true
    },
    update_period: {
        $doc: "Delay between calendar reads, in hours",
        $type: "number"
    },
    cache_length: {
        $doc: "Period of calendar entries to cache, in hours",
        $type: "number"
    }
};

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
        var params = {
            auth: self.oauth2Client,
            calendarId: self.config.id,
            // For reasons undocumented by google, if timeMin and
            // timeMax are the same time it returns no events. So
            // we need to offset them.
            timeMin: (new Date()).toISOString(),
            timeMax: (new Date(now + self.config.cache_length * HOURS))
                .toISOString(),
            // Expand recurring events
            singleEvents: true
        };
        
        // If a prefix is required, add a query
        if (self.config.require_prefix)
            params.q = "Hotpot:";
        
        return Q.Promise(function(ok, fail) {
            calendar.events.list(
                params,
                function(err, response) {
                    if (err) {
                        fail("'" + self.name + "' events list failed: " + err);
                    } else {
                        ok(response);
                    }
                });
        });
    })

    .then(function(response) {
        self.clearSchedule();
        var events = response.items;
        var re = new RegExp(
            (self.config.require_prefix ? "HOTPOT:\\s*" : "")
                + "([A-Z]+)[=\\s]+(0|1|2|on|off|away|boost)", "ig");
        Utils.TRACE(TAG, "'" + self.name + "' has "
                    + events.length + " events");
        self.last_update = new Date();
        for (var i = 0; i < events.length; i++) {
            var event = events[i];
            var start = Date.parse(event.start.dateTime || event.start.date);
            var end = Date.parse(event.end.dateTime || event.end.date);
            // Can have orders in the event summary or the description
            var fullText = event.summary + " " + event.description;
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
                Utils.TRACE(TAG, "Parsed event ", i, " ", Date, start, "..",
                            Date, end, " ",
                            pin, "=", state);
                self.schedule.push(new ScheduledEvent(
                    self,
                    self.name + "_" + i,
                    start, end, pin, state));
            }
        }
        Utils.TRACE(TAG, self.name, " ready");
    })

    .catch(function(e) {
        throw "Calendar had an error: " + e;
    });
};


/**
 * The serialisable state of a calendar is the current (or next) active
 * event in the calendar for each unique pin in the calendar. 
 */
Calendar.prototype.getSerialisableState = function() {
    var state = {};
    for (var i in this.schedule) {
	var event = this.schedule[i];
	if (typeof state[event.pin] === "undefined") {
	    state[event.pin] = {
		state: event.state,
		start: event.startms,
		length: event.endms - event.startms
	    }
	}
    }
    return Q.fcall(function() {
        return state;
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
    if (this.timeoutId)
        clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(function() {
        Utils.TRACE(TAG, "Updating '", self.name, "'");
        self.fillCache().then(
            function() {
                self.timeoutId = undefined;
                self.update(self.config.update_period * HOURS);
            },
            function(err) {
                // Report, but don't propagate, the error
                Utils.ERROR(TAG, err);
            });
    }, after);
};

Calendar.prototype.listCalendars = function() {
    "use strict";
    var self = this;

    return this.authorise()

    .then(function() {
        var google = require("googleapis");
        var calendar = google.calendar("v3");

        // Q.denodeify doesn't work for this, so have to promisify it
        // manually :-(
        return Q.Promise(function(ok, fail) {
            calendar.calendarList.list(
                {
                    auth: self.oauth2Client
                },
                function(err, response) {
                    if (err) {
                        fail("calendarList failed: " + err);
                    } else {
                        ok(response.items);
                    }
                });
        });
    });
};
