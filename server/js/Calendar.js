/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("server/js/Calendar", ["fs-extra", "common/js/Utils", "common/js/Time", "common/js/DataModel"], function(Fs, Utils, Time, DataModel) {

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
    
    class ScheduledEvent {
        constructor(cal, id, start, end, service, state) {
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

            let self = this;
            let now = Time.now();
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
        cancel() {
            Utils.TRACE(TAG, this.id, " cancelled");
            if (typeof this.event !== "undefined") {
                clearTimeout(this.event);
                this.event = undefined;
            }
            if (typeof this.calendar.remove === "function") {
                this.calendar.remove(this.id, this.service);
            }
        }

        // Start this event. The calendar trigger will be called.
        start() {
            let self = this;

            Utils.TRACE(TAG, this.id, " starting");
            if (typeof this.calendar.trigger === "function")
                this.calendar.trigger(this.id, this.service, this.state, this.endms);
       
            Utils.runAt(function () {
                Utils.TRACE(TAG, self.id, " finished");
                self.calendar.remove(self.id, self.service);
            }, this.endms);
        }
    }

    class Calendar {

        /**
         * Get active events from a Google calendar.
         * @param {string} name name of the calendar
         * @param {object} proto see Calendar.Model
         * @class
         */
        constructor(proto, name) {
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
        setTrigger(trigger) {
            this.trigger = trigger;
        }

        /*
         * remove(String id, String service)
         * ```
         * * `id` id of the event being removed
         * * `service` service the event appies to
         */
        setRemove(remove) {
            this.remove = remove;
        }
    
        /**
         * Return a promise to start the calendar
         * @private
         */
        authorise() {
            if (typeof this.oauth2Client !== "undefined")
                return Promise.resolve(); // already started

            let self = this;

            return Fs.readFile(Utils.expandEnvVars(self.auth_cache))

            .then(function (token) {
                let clientSecret = self.secrets.client_secret;
                let clientId = self.secrets.client_id;
                let redirectUrl = self.secrets.redirect_uris[0];
                let googleAuth = require("google-auth-library");
                let auth = new googleAuth();
                self.oauth2Client = new auth.OAuth2(
                    clientId, clientSecret, redirectUrl);
                self.oauth2Client.credentials = JSON.parse(token);
            });
        }

        /**
         * Return a promise that will update the list of the events
         * stored for the next 24 hours.
         * @private
         */
        fillCache() {
            "use strict";
            let self = this;

            return this.authorise()

            .then(function () {
                let google = require("googleapis");
                let calendar = google.calendar("v3");
                let now = Time.now();

                let params = {
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
                return new Promise((ok, fail) => {
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
                let events = response.items;
                let re = new RegExp(
                    (self.require_prefix ? "HOTPOT:\\s*" : "") +
                    "([A-Z]+)[=\\s]+((?:BOOST\\s+)?[\\d.]+)", "ig");
                Utils.TRACE(TAG, "'" + self.name + "' has " +
                            events.length + " events");
                self.last_update = new Date();
                for (let i = 0; i < events.length; i++) {
                    let event = events[i];
                    let start = Date.parse(event.start.dateTime || event.start.date);
                    let end = Date.parse(event.end.dateTime || event.end.date);
                    // Can have orders in the event summary or the description
                    let fullText = event.summary + " " + event.description;
                    let match;
                    while ((match = re.exec(fullText)) !== null) {
                        let service = match[1];
                        let target = match[2].toUpperCase();
                        self.schedule.push(new ScheduledEvent(
                            self,
                            "Calendar '" + self.name + "' event " + i,
                            start, end, service, target));
                    }
                }
                Utils.TRACE(TAG, self.name, " ready");
            })

            .catch(function (e) {
                throw new Utils.exception(TAG, "error: ", e);
            });
        }

        /**
         * The serialisable state of a calendar is the current (or next) active
         * event in the calendar for each unique service in the calendar.
         * {
         *   pending_update: boolean indicates if we are waiting for an
         *   update from the calendar service
         *   service: {
         *     map from service name to current (or next) event for that
         *     service
         *   }
         * }
         * @return Promise to get the state
         */
        getSerialisableState() {
            let state = {
                events: {}
            };
            if (this.pending_update)
                state.pending_update = true;
            let now = Date.now();
            for (let i = 0; i < this.schedule.length; i++) {
                let event = this.schedule[i];
                if (!state.events[event.service]) {
                    state.events[event.service] = {
                        state: event.state,
                        start: event.startms,
                        length: event.endms - event.startms
                    };
                }
            }
            return Promise.resolve(state);
        }

        /**
         * Clear the existing schedule
         * @private
         */
        clearSchedule() {
            for (let i in this.schedule)
                this.schedule[i].cancel();
            this.schedule = [];
        }

        /**
         * Schedule a calendar update in 'after' milliseconds. The update is
         * performed asynchronously.
         * @param {Number} after delay before updating the calendar asynchronously
         * @private
         */
        update(after) {
            "use strict";
            let self = this;

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
        }

        listCalendars() {
            "use strict";
            let self = this;

            return this.authorise()
            .then(function () {
                requirejs(["googleapis"], function(google) {
                    let calendar = google.calendar("v3");

                    return new Promise(function (resolve, reject) {
                        calendar.calendarList.list(
                            {
                                auth: self.oauth2Client
                            },
                            function (err, response) {
                                if (err) {
                                    reject("calendarList failed: " + err);
                                } else {
                                    resolve(response.items);
                                }
                            });
                    });
                });
            });
        }
    }
    
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

    return Calendar;
});
