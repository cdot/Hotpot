/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Get and set the current date by visiting a site on the web
 * See README.md for information.
 */
const getopt = require("node-getopt");
const Http = require("http");

let cliopt = getopt.create([
    ["h", "help", "Show this help"],
    ["s", "set", "Set the time (must be root)"]
])
    .bindHelp()
    .parseSystem()
    .options;

Http.get(
        "http://www.ntp.org",
        function (res) {
            console.log(res.headers.date);
            if (res.statusCode < 200 || res.statusCode > 299) {
                console.error(new Error("Failed to load URL, status: " +
                    res.statusCode));
            } else if (cliopt.set) {
                let Sys = require('child_process');

                Sys.execFile("/bin/date", ["-s", res.headers.date],
                    function (error, stdout, stderr) {
                        if (error)
                            console.error(error);
                    });
            }
        })
    .on("error", function (err) {
        console.error(err);
    });
