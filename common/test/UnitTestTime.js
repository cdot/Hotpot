/*@preserve Copyright (C) 2017-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["test/TestRunner", "common/js/Time"], function(TestRunner, Time) {
    const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms

    let tr = new TestRunner("Time");
    let assert = tr.assert;

    tr.addTest('should give a time of 00:00', function() {
        let lds = new Date().toDateString();
        assert.equal(Date.parse(lds), Time.midnight());
        let d = new Date(Time.midnight());
        assert.equal(0, d.getHours());
        assert.equal(0, d.getMinutes());
        assert.equal(0, d.getSeconds());
    });
    tr.addTest('should be before the current time', function() {
        assert(Time.midnight() <= Time.now());
    });

    tr.addTest('should parse h, h:m, and h:m:s', function() {
        let today = Time.parse('0');
        assert.equal(0, today);
        today = Time.parse('00:0');
        assert.equal(0, today);
        today = Time.parse('0:00:00');
        assert.equal(0, today);
    });
    tr.addTest('should parse small mins', function() {
        let t1 = Time.parse('00:01');
        assert.equal(60000, t1);
    });
    tr.addTest('should parse small ms', function() {
        let t1 = Time.parse('00:00:00.001');
        assert.equal(1, t1);
    });
    tr.addTest('should parse single digits', function() {
        let t1 = Time.parse('0:0:1');
        assert.equal(t1, 1000);
    });
    tr.addTest('should parse large secs', function() {
        let t1 = Time.parse('23:59:59');
        assert.equal((((23*60)+59)*60+59)*1000,ONE_DAY-1000);
        assert.equal(t1, ONE_DAY - 1000);
    });
    tr.addTest('should parse large ms', function() {
        let t1 = Time.parse('23:59:59.999');
        assert.equal(t1, ONE_DAY - 1);
    });
    tr.addTest('should throw on bad times', function() {
        try {
            Time.parse('24');
            assert(false);
        } catch (e) {
        }
        try {
            Time.parse('00:60');
            assert(false);
        } catch (e) {
        }
        try {
            Time.parse('00:00:61');
            assert(false);
        } catch (e) {
        }
    });

    tr.addTest("should unparse 1ms as 00:00:00.001", function() {
        assert.equal(Time.unparse(1), "00:00:00.001");
    });
    tr.addTest("should unparse 0 as 00:00", function() {
        assert.equal(Time.unparse(0), "00:00");
    });
    tr.addTest("should unparse 1 hour as 01:00", function() {
        assert.equal(Time.unparse(60 * 60 * 1000), "01:00");
    });
    tr.addTest("should unparse unparse 1 minute as 00:01", function() {
        assert.equal(Time.unparse(60 * 1000), "00:01");
    });
    tr.addTest("should unparse 1 second as 00:00:01", function() {
        assert.equal(Time.unparse(1000), "00:00:01");
    });
    tr.addTest("should unparse 23:59:59.999", function() {
        assert.equal(Time.unparse(ONE_DAY-1), "23:59:59.999");
    });
    tr.addTest("should check upper end of range", function() {
        try {
            Time.unparse(ONE_DAY + 1);
            assert(false);
        } catch (e) {
        }
    });
    tr.addTest("should check lower end of range", function() {
        try {
            Time.unparse(-1);
            assert(false);
        } catch (e) {
        }
    });
    tr.run();
});