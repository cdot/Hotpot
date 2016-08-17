/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

const getopt = require("node-getopt");
const Fs = require("fs");
const Q = require("q");
const writeFile = Q.denodeify(Fs.writeFile);
var google = require("googleapis");
var googleAuth = require("google-auth-library");
var readline = require("readline");

const Config = require("../commn/Config.js");
const Utils = require("../common/Utils.js");

const HELP = "Hotpot Google Calendar Authorisation\n"
    + "This program will cache the access token required to access "
    + "a Google calendar that contains control events";

var cliopt = getopt.create([
    [ "h", "help", "Show this help" ],
    [ "c", "config=ARG", "Configuration file (default ./hotpot.cfg)" ]
])
    .bindHelp()
    .setHelp(HELP + "[[OPTIONS]]")
    .parseSystem()
    .options;

if (typeof cliopt.config === "undefined")
    cliopt.config = "./hotpot.cfg";

new Config(cliopt.config).load()
.done(function(config) {
    var credentials = config.get("apis").google_calendar;
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
                console.log("Error while trying to retrieve access token", err);
                return;
            }
            oauth2Client.credentials = token;

            writeFile(Utils.expandEnvVars(credentials.cache),
                      JSON.stringify(token))

            .then(function() {
                console.log("Token cached in '" + credentials.cache + "'");
            })

            .catch(function(e) {
                console.error("Failed to write '" + credentials.cache + "': " + e);
            });
        });
    });
});
