/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Stand-alone program to authorise calendars declared in hotpot.cfg
 * @module AuthoriseCalendars
 */
const Getopt = require("node-getopt");
const Fs = require("fs");
const Q = require("q");
const writeFile = Q.denodeify(Fs.writeFile);
const googleAuth = require("google-auth-library");
const readline = require("readline");

const Utils = require("../common/Utils.js");

const Config = require("./Config.js");

const HELP = "Hotpot Google Calendar Authorisation\n"
    + "This program will cache the access token required to access "
    + "a Google calendar that contains control events";

var cliopt = new Getopt([
    [ "h", "help", "Show this help" ],
    [ "c", "config=ARG", "Configuration file (default ./hotpot.cfg)" ]
])
    .bindHelp()
    .setHelp(HELP + "[[OPTIONS]]")
    .parseSystem()
    .options;

if (typeof cliopt.config === "undefined")
    cliopt.config = "./hotpot.cfg";

function configureCalendar(credentials) {
    var cfn = Utils.expandEnvVars(credentials.auth_cache);
    Fs.stat(cfn, function(e, stats) {
        if (e) {
            authorise(credentials);
        } else if (stats.isFile()) {
            console.log("\t" + credentials.auth_cache + " already exists");
            console.log("\tContinuing will overwrite it.");
            var rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question("Continue [Y/n]?: ", function(ans) {
                rl.close();
                if (ans === "" || /^[Yy]/.test(ans))
                    authorise(credentials);
                else
                    console.log("\nSkipping this calendar");
            });
        } else {
            console.error("Skipping because " + credentials.auth_cache
                    + " is not a file" + "\n"
                    + "Please check the auth_cache of this calendar");
        }
    });
}

function authorise(credentials) {
    var clientSecret = credentials.secrets.client_secret;
    var clientId = credentials.secrets.client_id;
    var redirectUrl = credentials.secrets.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/calendar.readonly"]
    });

    console.log("Please visit this URL in a browser: ", authUrl);
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });    
    rl.question("Enter the code here: ", function(code) {
        rl.close();
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                console.log("Error while trying to retrieve access token",
                            err);
                return;
            }
            oauth2Client.credentials = token;

            writeFile(Utils.expandEnvVars(credentials.auth_cache),
                      JSON.stringify(token))

                .then(function() {
                    console.log("Token cached in '" + credentials.auth_cache
                                + "'");
                })

                .catch(function(e) {
                    console.error("Failed to write '"
                                  + credentials.auth_cache + "': " + e);
                });
        });
    });
}

Config.load(cliopt.config)

.done(function(config) {
    for (var cal in config.controller.calendar) {
        console.log("Configuring calendar '" + cal + "'");
        configureCalendar(config.controller.calendar[cal]);
    }
});

