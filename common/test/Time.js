/*eslint-env node, mocha */
var assert = require('chai').assert;

const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms
var Time = require('../Time.js');
describe('Time', function() {
    describe('#midnight()', function() {
        it('should give a time of 00:00', function() {
            assert.equal(Date.parse(new Date().toLocaleDateString()),
                    Time.midnight());
            var d = new Date(Time.midnight());
            assert.equal(0, d.getHours());
            assert.equal(0, d.getMinutes());
            assert.equal(0, d.getSeconds());
        });
        it('should be before the current time', function() {
            assert(Time.midnight() <= Time.now());
        });
    });

    describe('#parse()', function() {
        var today;
        it('should parse h, h:m, and h:m:s', function() {
            today = Time.parse('0');
            assert.equal(0, today);
            today = Time.parse('00:0');
            assert.equal(0, today);
            today = Time.parse('0:00:00');
            assert.equal(0, today);
        });
        it('should parse small mins', function() {
            var t1 = Time.parse('00:01');
            assert.equal(60000, t1);
        });
        it('should parse small ms', function() {
            var t1 = Time.parse('00:00:00.001');
            assert.equal(1, t1);
        });
        it('should parse single digits', function() {
            var t1 = Time.parse('0:0:1');
            assert.equal(t1, 1000);
        });
        it('should parse large secs', function() {
            var t1 = Time.parse('23:59:59');
            assert.equal((((23*60)+59)*60+59)*1000,ONE_DAY-1000);
            assert.equal(t1, ONE_DAY - 1000);
        });
        it('should parse large ms', function() {
            var t1 = Time.parse('23:59:59.999');
            assert.equal(t1, ONE_DAY - 1);
        });
        it('should throw on bad times', function() {
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
    });

    describe('#unparse()', function() {
        it("should unparse 00:00:00.001", function() {
            assert.equal(Time.unparse(1), "00:00:00");
        });
        it("should unparse 00:00:00", function() {
            assert.equal(Time.unparse(0), "00:00:00");
        });
        it("should unparse 00:01", function() {
            assert.equal(Time.unparse(60 * 60 * 1000), "01:00:00");
        });
        it("should unparse 00:01", function() {
            assert.equal(Time.unparse(60 * 1000), "00:01:00");
        });
        it("should unparse 00:01:01", function() {
            assert.equal(Time.unparse(61 * 1000), "00:01:01");
        });
        it("should unparse 23:59:59.999", function() {
            assert.equal(Time.unparse(ONE_DAY-1), "23:59:59");
        });
        it("should check upper end of range", function() {
            try {
                Time.unparse(ONE_DAY + 1);
                assert(false);
            } catch (e) {
            }
        });
        it("should check lower end of range", function() {
            try {
                Time.unparse(-1);
                assert(false);
            } catch (e) {
            }
        });
    });
});
