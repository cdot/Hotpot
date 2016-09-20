/*eslint-env node, mocha */

var Fs = require("fs");
const Q = require("q");
var assert = require('chai').assert;

var Historian = require("../Historian");

//Utils.setTRACE("all");
Q.longStackSupport = true;

describe('Historian', function() {
    describe('unordered', function() {
        var h = new Historian({
            name: "test",
            unordered: true,
            file: "/tmp/unordered_historian.log"
        });

        try {
            Fs.unlinkSync(h.path());
        } catch (e) {
        }

        var p = Q();

        function do_record(t, s) {
            p = p.then(function() {
                return h.record(s, t);
            });
        }

        // Create some out-of-order samples
        for (var i = 2; i >= 0; i--)
            do_record(i, i);

        /// Create some rewrites
        for (i = 1; i < 3; i++)
            do_record(i, -i);

        it("Accepts unordered data", function() {
            return p.then(function() {
                return h.getSerialisableHistory()
                .then(function(report) {
                    assert.equal(report.length, 7);
                    assert.equal(report[0], 0);
                    assert.equal(report[1], 0);
                    assert.equal(report[2], 0);
                    assert.equal(report[3], 1);
                    assert.equal(report[4], -1);
                    assert.equal(report[5], 2);
                    assert.equal(report[6], -2);
                });
            });
        });
    });

    describe('sampled', function() {
        var nsamples = 0;

        var h = new Historian({
            name: "test2",
            file: "/tmp/sampled_historian.log",
            interval: 50,
            sample: function() {
                if (nsamples === 7) {
                    h.stop();
                    h.done();
                }
                return nsamples++;
            }
        });

        try {
            Fs.unlinkSync(h.path());
        } catch (e) {
        }

        beforeEach(function(done) {
            h.done = done;
            h.start();
        });

        it('Supports polling', function() {
            return h.getSerialisableHistory()
            .then(function(report) {
                var d = new Date(report[0]);
                d.setHours(0, 0, 0);
                var now = new Date();
                now.setHours(0, 0, 0);
                assert.equal(d.toString(), now.toString());
                var t = report[1] - h.config.interval;
                var c = 0;
                for (var i = 1; i < report.length; i += 2, c++) {
                    assert(report[i] >= t + h.config.interval);
                    assert.equal(report[i + 1], c);
                    t = report[i];
                }
            });
        });
    });
});
