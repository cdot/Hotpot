/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Implementation of Calendar using Google calendar
 */
define("server/js/GoogleCalendar", ["fs", "common/js/Utils", "common/js/Time", "common/js/DataModel", "server/js/Calendar"], function(fs, Utils, Time, DataModel, Calendar) {

	// MS in an hour
	const HOURS = 60 * 60 * 1000;

	const Fs = fs.promises;

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
			delete this.oauth2Client;
		}

		/**
		 * Return a promise to start the calendar
		 * @private
		 */
		authorise() {
			if (typeof this.oauth2Client !== "undefined")
				return Promise.resolve(); // already started

			return Fs.readFile(Utils.expandEnvVars(this.auth_cache))

			.then(token => {
				let clientSecret = this.secrets.client_secret;
				let clientId = this.secrets.client_id;
				let redirectUrl = this.secrets.redirect_uris[0];
				let {OAuth2Client} = require("google-auth-library");
				this.oauth2Client = new OAuth2Client(
					clientId, clientSecret, redirectUrl);
				this.oauth2Client.credentials = JSON.parse(token);
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

			return this.authorise()

			.then(() => {
				let calendarAPI = googleCalendarAPI()
				let now = Date.now();

				let params = {
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
				return new Promise((ok, fail) => {
					calendarAPI.events.list(
						params,
						(err, response) => {
							delete this.pending_update;
							if (err) {
								fail(`'${this.name}' events list failed: ${err}`);
							} else {
								ok(response);
							}
						});
				});
			})

			.then(response => {
				this.clearSchedule();
				let events = response.data.items;
				Utils.TRACE(TAG, `'${this.name}' has ${events.length} events`);
				this.last_update = new Date();
				for (let i = 0; i < events.length; i++) {
					let event = events[i];
					let start = Date.parse(event.start.dateTime || event.start.date);
					let end = Date.parse(event.end.dateTime || event.end.date);
					// Can have orders in the event summary or the description
					let fullText = `${event.summary};${event.description}`;
					this.parseEvents(start, end, fullText);
				}
				Utils.TRACE(TAG, `'${this.name}' ready`);
			});
		}

		listCalendars() {

			return this.authorise()
			.then(() => {
				Utils.TRACE(TAG, "Listing calendars");
				let calendar = googleCalendarAPI();

				return new Promise((resolve, reject) => {
					calendar.calendarList.list(
						{
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
