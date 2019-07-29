/*@preserve Copyright (C) 2017-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["test/TestRunner", "server/js/Historian"], function(TestRunner, Historian) {

    let tr = new TestRunner("Historian");
    let assert = tr.assert;

    tr.addTest('unordered', function() {
        var h = new Historian({
            unordered: true,
            file: "/tmp/unordered_historian.log"
        }, "test1");

        try {
            Fs.unlinkSync(h.path());
        } catch (e) {
        }

        var p = Promise.resolve();

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

    tr.addTest('sampled', function() {
        var nsamples = 0;

        var h = new Historian({
            file: "/tmp/sampled_historian.log",
            interval: 50
        }, "test2");

        try {
            Fs.unlinkSync(h.path());
        } catch (e) {
        }

        h.start(function() {
            if (nsamples === 7) {
                h.stop();
            }
            return nsamples++;
        });

        return h.getSerialisableHistory()
        .then(function(report) {
            var d = new Date(report[0]);
            d.setHours(0, 0, 0);
            var now = new Date();
            now.setHours(0, 0, 0);
            assert.equal(d.toString(), now.toString());
            var t = report[1] - h.interval;
            var c = 0;
            for (var i = 1; i < report.length; i += 2, c++) {
                assert(report[i] >= t + h.interval);
                assert.equal(report[i + 1], c);
                t = report[i];
            }
        });
    });

    tr.run();
});
