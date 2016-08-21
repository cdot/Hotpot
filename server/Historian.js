/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
const Q = require("q");
const fs = require("fs");
const writeFile = Q.denodeify(fs.writeFile);
const statFile = Q.denodeify(fs.stat);
const appendFile = Q.denodeify(fs.appendFile);

const Time = require("../common/Time.js");
const Utils = require("../common/Utils.js");

const TAG = "Historian";

/**
 * Logger. Can either log according to a time interval, or only on demand.
 * @param options { interval: time, max_samples: sample count,
 * max_bytes: byte count, sample: function, file: string }
 * If "sample" is given, will automatically sample by calling "sample" every
 * "interval" (default: 300) seconds.
 * Otherwise sampling is only by calling "record".
 * If "max_samples" is given, then logging is limited to that number of samples.
 * If "max_bytes" is given, log file is automatically limited to that number
 * of bytes.
 */
function Historian(options) {
    "use strict";

    this.name = options.name;
    this.sample = options.sample;
    this.max_samples = options.max_samples;
    this.max_bytes = options.max_bytes;
    this.interval = options.interval;
    this.file = Utils.expandEnvVars(options.file);

    // @private
    this.basetime = Math.floor(Time.nowSeconds());

    // @private
    this.history = [];

    Utils.TRACE(TAG, "Set up for ", this.name, this.file);
    this.rewriteHistory();
}
module.exports = Historian;

/**
 * Reset the historian to the given start time
 * @param {int} time base time for the historian, in seconds
 */
Historian.prototype.reset = function(time) {
    Utils.TRACE(TAG, this.name, " reset baseline to ", Date, time);
    this.basetime = time;
    this.history = [];
    this.rewriteHistory();
};

/**
 * Get a promise to rewrite the history file from the history
 * cached in this object.
 * @private
 */
Historian.prototype.rewriteHistory = function() {
    "use strict";
    var self = this;

    var report = self.history;
    var s = "B," + self.basetime + "\n";
    for (var i in report)
        s += (report[i].time - self.basetime) + "," + report[i][1] + "\n";
    return writeFile(this.file, s)
    .catch(function(err) {
        Utils.ERROR(TAG, "Failed to write '",
                    self.file, "': ", err.toString());
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
    var report = [];
    
    if (typeof this.max_samples !== "undefined"
        && lines.length > this.max_samples)
        lines.splice(0, lines.length - this.max_samples);

    // Load report
    for (var i in lines) {
        var csv = lines[i].split(",", 2);
        if (csv[0] === "B") // basetime
            basetime = parseFloat(csv[1]);
        else {
            var point = {
                time: basetime + parseFloat(csv[0]),
                sample: parseFloat(csv[1])
            };
            report.push(point);
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
    var self = this;
    return Q.fcall(function() {
        var report = self.history;
        var res = [ self.basetime ];
        for (var i in report) {
            res.push(report[i].time - self.basetime);
            res.push(report[i].sample);
        }
        return res;
    });
};

/**
 * Start the history polling loop.
 * Records are written every minute or so (set in config)
 */
Historian.prototype.start = function(quiet) {
    "use strict";

    var self = this;

    if (typeof self.sample !== "function")
        throw "Cannot start Historian; sample() not defined";

    if (typeof self.interval === "undefined")
        throw "Cannot start Historian; interval not defined";

    var sample = self.sample();

    function repoll() {
        setTimeout(function() {
            self.start(true);
        }, self.interval * 1000);
    }

    if (typeof sample !== "number") {
        repoll();
        return;
    }

    // Don't record if this sample has the same value as the last
    if (sample === self.last_recorded) {
        repoll();
        return;
    }

    if (!quiet)
        Utils.TRACE(TAG, this.name, " started");

    self.record(sample)
    .then(repoll);
};

/**
 * Get a promise to record a sample in the log.
 * @param {number} sample the data to record
 * @param {int} time (optional) time in s to force into the record
 * @public
 */
Historian.prototype.record = function(sample, time) {
    "use strict";

    var self = this;

    if (typeof time === "undefined")
        time = Time.nowSeconds();

    Utils.TRACE(TAG, self.name, " record ", sample, " ", Date, time * 1000);

    self.last_recorded = sample;
    self.history.push({time: time, sample: sample });

    return statFile(self.file).then(
        function(stats) {
            // If we hit 2 * the size limit, open the file and
            // reduce the size. Each sample is about 15 bytes.
            if (stats.size > self.max_bytes) {
                Utils.TRACE(TAG, self.name, " history is full");
                return self.rewriteHistory();
            }
            // otherwise simply append
            return appendFile(
                self.file,
                Math.round(Time.nowSeconds() - self.basetime)
                    + "," + sample + "\n")
            .catch(function(ferr) {
                Utils.ERROR(TAG, "failed to append to '",
                            self.file, "': ",
                            ferr.toString());
            });
        })
        .catch(function(err) {
            Utils.TRACE(TAG, "Failed to stat history file '",
                          self.file, "': ", err);
            // Probably the first time; write the whole history file
            return self.rewriteHistory();
        });
};
