/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

requirejs = require("requirejs");

requirejs.config({
    baseUrl: ".."
});

/**
 * Stand-alone program to authorise calendars declared in hotpot.cfg
 * @module AuthoriseCalendars
 */
requirejs(["node-getopt", "fs-extra", "readline", "common/Utils", "common/Time", "common/DataModel"], function(Getopt, Fs, readLine, Utils, Time, DataModel) {

    const HELP = "Hotpot Google Calendar Authorisation\n" +
          "This program will cache the access token required to access " +
          "a Google calendar that contains control events";

    let cliopt = new Getopt([
        ["h", "help", "Show this help"],
        ["c", "config=ARG", "Configuration file (default ./hotpot.cfg)"]
    ])
        .bindHelp()
        .setHelp(HELP + "[[OPTIONS]]")
        .parseSystem()
        .options;

    if (typeof cliopt.config === "undefined")
        cliopt.config = "./hotpot.cfg";

    function configureCalendar(credentials) {
        let cfn = Utils.expandEnvVars(credentials.auth_cache);
        Fs.stat(cfn, function (e, stats) {
            if (e) {
                authorise(credentials);
            } else if (stats.isFile()) {
                console.log("\t" + credentials.auth_cache + " already exists");
                console.log("\tContinuing will overwrite it.");
                let rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                rl.question("Continue [Y/n]?: ", function (ans) {
                    rl.close();
                    if (ans === "" || /^[Yy]/.test(ans))
                        authorise(credentials);
                    else
                        console.log("\nSkipping this calendar");
                });
            } else {
                console.error("Skipping because " + credentials.auth_cache +
                              " is not a file" + "\n" +
                              "Please check the auth_cache of this calendar");
            }
        });
    }

    function authorise(credentials) {
        let clientSecret = credentials.secrets.client_secret;
        let clientId = credentials.secrets.client_id;
        let redirectUrl = credentials.secrets.redirect_uris[0];
        let auth = new googleAuth();
        let {OAuth2Client} = require("google-auth-library");
		let oAuth2Client = new OAuth2Client(clientId, clientSecret, redirectUrl);
        let authUrl = oAuth2Client.generateAuthUrl({
            access_type: "offline",
            scope: ["https://www.googleapis.com/auth/calendar.readonly"]
        });

        console.log("Please visit this URL in a browser: ", authUrl);
        let rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question("Enter the code here: ", function (code) {
            rl.close();
            oAuth2Client.getToken(code, function (err, token) {
                if (err) {
                    console.log("Error while trying to retrieve access token",
                                err);
                    return;
                }
                oAuth2Client.credentials = token;

                writeFile(Utils.expandEnvVars(credentials.auth_cache),
                          JSON.stringify(token))

                .then(function () {
                    console.log("Token cached in '" + credentials.auth_cache +
                                "'");
                })

                .catch(function (e) {
                    console.error("Failed to write '" +
                                  credentials.auth_cache + "': " + e);
                });
            });
        });
    }

    DataModel.loadData(cliopt.config, {
        $skip: true
    })

    .then(function (config) {
        for (let cal in config.controller.calendar) {
            console.log("Configuring calendar '" + cal + "'");
            configureCalendar(config.controller.calendar[cal]);
        }
    });
});
