/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Implementation of Calendar using Google calendar
 */
define("server/js/GoogleCalendar", ["fs-extra", "common/js/Utils", "common/js/Time", "common/js/DataModel", "server/js/Calendar"], function(Fs, Utils, Time, DataModel, Calendar) {

    // MS in an hour
    const HOURS = 60 * 60 * 1000;

    const TAG = "GoogleCalendar";

    function googleCalendarAPI() {
		let googleApis = require("googleapis");
        let apis = new googleApis.GoogleApis();
		return apis.calendar("v3");
	}

    class GoogleCalendar extends Calendar{

        /**
         * Get active events from a Google calendar.
         * @param {string} name name of the calendar
         * @param {object} proto see Calendar.Model
         * @class
         */
        constructor(proto, name) {
			super(proto, name);
            // GoogleAuthClient.OAuth2
            this.oauth2Client = undefined;
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
                let {OAuth2Client} = require("google-auth-library");
                self.oauth2Client = new OAuth2Client(
                    clientId, clientSecret, redirectUrl);
                self.oauth2Client.credentials = JSON.parse(token);
            });
        }

        /**
         * Return a promise that will update the list of the events
         * stored for the next 24 hours.
		 * The cache size is limited by the config.
		 * Longer means less frequent automatic updates, and larger memory
		 * footprint for the server, but less network traffic.
         * @private
         */
        fillCache() {
            let self = this;

            return this.authorise()

            .then(function () {
                let calendarAPI = googleCalendarAPI()
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
                if (self.prefix)
                    params.q = self.prefix;

                self.pending_update = true;
                return new Promise((ok, fail) => {
                    calendarAPI.events.list(
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
                let events = response.data.items;
				console.log(response)
                Utils.TRACE(TAG, "'" + self.name + "' has " + events.length + " events");
                self.last_update = new Date();
                for (let i = 0; i < events.length; i++) {
                    let event = events[i];
                    let start = Date.parse(event.start.dateTime || event.start.date);
                    let end = Date.parse(event.end.dateTime || event.end.date);
                    // Can have orders in the event summary or the description
                    let fullText = event.summary + ";" + event.description;
					parseEvents(start, end, fullText);
                }
                Utils.TRACE(TAG, self.name, " ready");
            })

            .catch(function (e) {
                throw new Utils.exception(TAG, "error: ", e);
            });
        }

        listCalendars() {
            let self = this;

            return this.authorise()
            .then(function () {
				console.debug("Listing calendars");
                let calendar = googleCalendarAPI();

                return new Promise(function (resolve, reject) {
                    calendar.calendarList.list(
                        {
                            auth: self.oauth2Client
                        },
                        function (err, response) {
                            if (err) {
                                reject("calendarList failed: " + err);
                            } else {
                                resolve(response.data.items);
                            }
                        });
                });
            });
        }
    }
    
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
            $class: DataModel.File,
            $mode: "r"
        },
    });

    return GoogleCalendar;
});
