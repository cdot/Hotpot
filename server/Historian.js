/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
const Q = require("q");
const fs = require("fs");
const writeFile = Q.denodeify(fs.writeFile);
const statFile = Q.denodeify(fs.stat);
const appendFile = Q.denodeify(fs.appendFile);

const Time = require("../common/Time.js");
const Utils = require("../common/Utils.js");

// Default history interval - once a minute
const DEFAULT_INTERVAL = 60; // seconds
// Default history limit - number of seconds to store history for
const DEFAULT_LIMIT = 24 * 60 * 60;

const TAG = "Historian";

/**
 * interval: time
 * limit: time
 * datum: function
 * file: string
 */
function Historian(options) {
    "use strict";
    if (typeof options.interval !== "number")
	options.interval = DEFAULT_INTERVAL;
    if (typeof options.limit !== "number")
        options.limit = DEFAULT_LIMIT;
    if (typeof options.maxbytes !== "number")
	options.maxbytes = 2 * (options.limit / options.interval) * 15;

    this.name = options.name;
    this.datum = options.datum;
    this.limit = options.limit;
    this.interval = options.interval;
    this.maxbytes = options.maxbytes;
    this.file = Utils.expandEnvVars(options.file);

    // @private
    this.basetime = Math.floor(Time.nowSeconds());
    // @private
    this.history = [];
    console.TRACE(TAG, "Set up for ", this.name,
                  " with limit ", this.limit, " and interval ",
                  this.interval, " in ", this.file);
    this.rewriteHistory();
}
module.exports = Historian;

/**
 * @private
 */
Historian.prototype.rewriteHistory = function(callback) {
    "use strict";
    var self = this;

    var report = self.history;
    var s = "B," + self.basetime + "\n";
    for (var i in report)
        s += (report[i].time - self.basetime) + "," + report[i][1] + "\n";
    writeFile(this.file, s)
        .then(callback,
              function(err) {
                  console.error("Failed to write history file '"
                                + self.file + "': " + err);
                  if (typeof callback !== "undefined")
                      callback();
              });
};

/**
 * Load history from a data string
 * @param {string} data data string
 * @private
 */
Historian.prototype.load = function(data) {
    "use strict";
    var lines = data.toString().split("\n");
    var basetime;
    var cutoff = Time.nowSeconds() - this.limit;
    var report = [];
    var p0;

    // Load report, discarding points that are before the cutoff
    for (var i in lines) {
        var csv = lines[i].split(",", 2);
        if (csv[0] === "B") // basetime
            basetime = parseFloat(csv[1]);
        else {
            var point = {
                time: basetime + parseFloat(csv[0]),
                sample: parseFloat(csv[1])
            };
            if (point.time < cutoff)
                p0 = point;
            else {
                if (p0 && p0.time < point.time) {
                    // Interpolate a point at the cutoff
                    report.push([
                        cutoff,
                        (point.time - cutoff) / (point.time - p0.time)
                            * (point.sample - p0.sample) + p0.sample
                    ]);
                    p0 = null;
                }
                report.push(point);
            }
        }
    }
    return report;
};

/**
 * Get a serialisable 1D array for the history.
 * @return {object} array of alternating times and temps. Times are all
 * relative to basetime, which is in the first array element.
 */
Historian.prototype.getSerialisableHistory = function() {
    "use strict";
    var report = this.history();
    var res = [ this.basetime ];
    for (var i in report) {
        res.push(report[i].time - this.basetime);
        res.push(report[i].sample);
    }
    return res;
};

/**
 * Start the history polling loop.
 * Records are written every minute or so (set in config)
 */
Historian.prototype.start = function(quiet) {
    "use strict";

    var self = this;

    var t = self.datum();

    function repoll() {
        setTimeout(function() {
            self.start(true);
        }, self.interval * 1000);
    }

    if (typeof t !== "number") {
        repoll();
        return;
    }

    if (t === self.last_recorded) {
        repoll();
        return;
    }

    if (!quiet)
        console.TRACE(TAG, this.name, " started");

    console.TRACE(TAG, "Log ", t, " to ", self.name, " history");

    self.record(t, repoll);
};

/**
 * Record a datum in the log.
 * @param {number} t the data to record
 * @param {function} callback callback when recording is done
 */
Historian.prototype.record = function(t, callback) {
    "use strict";

    var self = this;

    self.last_recorded = t;

    statFile(self.file).then(
        function(stats) {
            // If we hit 2 * the size limit, open the file and
            // reduce the size. Each sample is about 15 bytes.
            if (stats.size > self.maxbytes) {
                console.TRACE(TAG, self.name, " history is full");
                self.rewriteHistory(callback);
                return;
            }
            // otherwise simply append
            appendFile(
                self.file,
                Math.round(Time.nowSeconds() - self.basetime)
                    + "," + t + "\n")
                .then(
                    callback,
                    function(ferr) {
                        console.error(
                            TAG + " failed to append to  history file '"
                                + self.file + "': "
                                + ferr);
                        callback();
                    });
        },
        function(err) {
            console.TRACE(TAG, "Failed to stat history file '",
                          self.file, "': ", err);
            // Probably the first time; write the whole history file
            self.rewriteHistory(callback);
        });
};
