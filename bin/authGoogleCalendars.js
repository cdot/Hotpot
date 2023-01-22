/*@preserve Copyright (C) 2016-2023 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import getopt from "posix-getopt";
import { promises as Fs } from "fs";
import readline from "readline";
import { OAuth2Client } from "google-auth-library";

/**
 * Stand-alone program to authorise calendars declared in hotpot.cfg
 * @module server/AuthoriseCalendars
 */
import { Utils } from "../src/common/Utils.js";
import { Time } from "../src/common/Time.js";
import { DataModel } from "../src/common/DataModel.js";

const DESCRIPTION = [
  "Hotpot Google Calendar Authorisation",
  "This program will cache the access token required to access",
  "a Google calendar that contains control events",
  "OPTIONS",
	"\tc, config=ARG - Configuration file (default ./hotpot.cfg)",
	"\th, help - Show this help"
].join("\n");

const go_parser = new getopt.BasicParser(
  "h(help)c:(config)",
  process.argv);

const cliopt = {
  config: "./hotpot.cfg"
};
let option;
while ((option = go_parser.getopt())) {
  switch (option.option) {
  default: console.log(DESCRIPTION); process.exit(0);
    case 'c': cliopt.config = option.optarg; break;
    case 'd': cliopt.debug = true; break;
    }
  }

function configureCalendar(credentials) {
  let cfn = Utils.expandEnvVars(credentials.auth_cache);
  if (cliopt.debug) console.debug(`Auth cache ${cfn}`);
  return Fs.stat(cfn)
  .catch(e => {
    if (cliopt.debug) console.debug("Authorising...");
    authorise(credentials);
  })
  .then(stats => {
    if (cliopt.debug) {
      console.debug("\t" + credentials.auth_cache + " already exists");
      console.debug("\tContinuing will overwrite it.");
    }
    let rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question("Continue [Y/n]?: ", ans => {
      rl.close();
      if (ans === "" || /^[Yy]/.test(ans))
        authorise(credentials);
      else if (cliopt.debug)
        console.debug("\nSkipping this calendar");
    });
  });
}

function authorise(credentials) {
  let clientSecret = credentials.secrets.client_secret;
  let clientId = credentials.secrets.client_id;
  let redirectUrl = credentials.secrets.redirect_uris[0];
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
  rl.question("Enter the code here: ", code => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.log("Error while trying to retrieve access token",
                    err);
        return;
      }
      oAuth2Client.credentials = token;

      Fs.writeFile(Utils.expandEnvVars(credentials.auth_cache),
                   JSON.stringify(token))

      .then(() => {
        console.log("Token cached in '" + credentials.auth_cache +
                    "'");
      })

      .catch(e => {
        console.error("Failed to write '" +
                      credentials.auth_cache + "': " + e);
      });
    });
  });
}

DataModel.loadData(cliopt.config, {
  $unchecked: true
})

.then(config => Promise.all(
  Object.values(config.controller.calendar)
  .map(cal => configureCalendar(cal))));
