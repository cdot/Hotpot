/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
const Q = require("q");
const fs = require("fs");
const readFile = Q.denodeify(fs.readFile);
const writeFile = Q.denodeify(fs.writeFile);
const appendFile = Q.denodeify(fs.appendFile);

const Time = require("../common/Time.js");
const Utils = require("../common/Utils.js");
const DataModel = require("../common/DataModel");

const TAG = "Historian";

/**
 * Logger. Can either log according to a time interval using a sampling
 * callback, or only on demand.
 * @param {string} name identifier
 * @param {object} proto see Historian.Model
 * If `sample` is not given, or `start()` is not called, sampling is only by
 * calling `record()`
 * @class
 */
function Historian(proto, name) {
    "use strict";

    Utils.extend(this, proto);

    this.name = name;
    
    this.timeout = null;
    Utils.TRACE(TAG, "for ", name, " in ", this.path());
}
module.exports = Historian;

Historian.Model = {
    $class: Historian,
    file: {
        $doc: "Full path to the log file",
        $class: DataModel.File,
        $mode: "w"
    },
    unordered: {
        $doc: "Set if sample events may be added out of order",
        $optional: true,
        $class: "boolean"
    },
    interval: {
        $doc: "Sample frequency in ms, required if `start()` is called",
        $optional: true,
        $class: "number"
    },
    sample: {
        // Function returning a sample. Called every `interval` when
        // `start()` is called. Set in code, cannot be set in the config.
        $optional: true,
        $class: "function"
    }
};

/**
 * @private
 * Get the expanded file name
 */
Historian.prototype.path = function() {
    "use strict";
    return Utils.expandEnvVars(this.file);
};

/**
 * Return a promise to rewrite the history file with the given data
 * @private
 */
Historian.prototype.rewriteFile = function(report) {
    "use strict";
    var s = "";
    for (var i = 0; i < report.length; i++)
        s += report[i].time + "," + report[i].sample + "\n";
    return writeFile(this.path(), s)
    .then(function() {
        Utils.TRACE(TAG, "Wrote ", this.path());
    });
};

/**
 * Load history from the data file
 * @private
 */
Historian.prototype.loadFromFile = function() {
    "use strict";
    var self = this;

    return readFile(this.path())
    .then(function(data) {
        var lines = data.toString().split("\n");
        var report = [];
        var i;

        // Load report
        for (i in lines) {
            var csv = lines[i].split(",", 2);
            if (csv.length === 2) {
                var point = {
                    time: parseFloat(csv[0]),
                    sample: parseFloat(csv[1])
                };
                report.push(point);
            }
        }
        if (self.unordered && report.length > 1) {
            // Sort samples by time. If two samples occur at the same
            // time, keep the most recently added.
            var doomed = report;
            report = [];
            for (i = 0; i < doomed.length; i++)
                doomed[i].index = i;
            doomed.sort(function(a, b) {
                if (a.time < b.time)
                    return -1;
                if (a.time > b.time)
                    return 1;
                if (a.index < b.index)
                    a.dead = true;
                else
                    b.dead = true;
                return 0;
            });
            for (i = 0; i < doomed.length; i++) {
                if (!doomed[i].dead)
                    report.push({
                        time: doomed[i].time,
                        sample: doomed[i].sample
                    });
            }
            if (report.length !== doomed.length)
                self.rewriteFile(report);
        }

        return report;
    })
    .catch(function(e) {
        Utils.TRACE(TAG, "Failed to open history ", e);
        return [];
    });
};

/**
 * Get a promise for a serialisable 1D array for the history.
 * @param since earliest datime we are interested in. Can prune log
 * data before this.
 * @return {array} First element is the base time in epoch ms,
 * subsequent elements are alternating times and samples. Times are
 * in ms.
 */
Historian.prototype.getSerialisableHistory = function(since) {
    "use strict";
    return this.loadFromFile()
    .then(function(report) {
        var basetime = report.length > 0 ? report[0].time : Time.now();
        var res = [ basetime ];
        for (var i in report) {
            if (typeof since === "undefined" || report[i].time >= since) {
                res.push(report[i].time - basetime);
                res.push(report[i].sample);
            }
        }
        return res;
    });
};

/**
 * Start the history polling loop.
 * Records are written according to the interval set in the config.
 * Requires the `sample` and `interval` options to be given.
 */
Historian.prototype.start = function(quiet) {
    "use strict";

    var sample = this.sample;

    if (typeof sample !== "function")
        throw "Cannot start Historian; sample() not defined";

    if (typeof this.interval === "undefined")
        throw "Cannot start Historian; interval not defined";

    var self = this;
    function repoll() {
        self.timeout = setTimeout(function() {
            self.start(true);
        }, self.interval);
    }

    // Don't record if this sample has the same value as the last
    if (typeof sample !== "number"
        || sample === this.last_sample) {
        repoll();
        return;
    }

    if (!quiet)
        Utils.TRACE(TAG, this.name, " started");

    this.record(sample)
    .then(repoll);
};

/**
 * Stop the polling loop
 */
Historian.prototype.stop = function() {
    if (typeof this.timeout !== undefined) {
        clearTimeout(this.timeout);
        delete this.timeout;
        Utils.TRACE(TAG, this.name, " stopped");
    }
};

/**
 * Get a promise to record a sample in the log.
 * @param {number} sample the data to record
 * @param {int} time (optional) time in ms to force into the record
 * @public
 */
Historian.prototype.record = function(sample, time) {
    "use strict";

    if (typeof time === "undefined")
        time = Time.now();

    var promise;

    // If we've skipped recording an interval since the last
    // recorded sample, pop in a checkpoint
    if (typeof this.last_time !== "undefined"
        && time > this.last_time + 5 * this.interval / 4)
        promise = appendFile(
            this.path(),
            (time - this.interval) + "," + this.last_sample + "\n");
    else
        promise = Q();

    this.last_time = time;
    this.last_sample = sample;

    var self = this;
    return promise.then(function() {
        return appendFile(self.path(), time + "," + sample + "\n")
        .catch(function(ferr) {
            Utils.ERROR(TAG, "failed to append to '",
                        self.path(), "': ", ferr);
        });
    });
};
