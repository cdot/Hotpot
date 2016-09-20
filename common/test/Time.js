/*eslint-env node, mocha */
var assert = require('chai').assert;

var Time = require('../Time.js');
describe('Time', function() {
    describe('#midnight()', function() {
        assert(Time.midnight().getTime() ===
            Date.parse(new Date().toLocaleDateString()));
        it('should return a date', function() {
            assert(Time.midnight() instanceof Date);
        });
        it('should give a time of 00:00', function() {
            assert.equal(0, Time.midnight().getHours());
            assert.equal(0, Time.midnight().getMinutes());
            assert.equal(0, Time.midnight().getSeconds());
        });
        it('should be before the current time', function() {
            assert(Time.midnight() <= new Date());
        });
    });

    describe('#parse()', function() {
        var today;
        it('should parse h, h:m, and h:m:s', function() {
            today = Time.parse('0');
            assert.equal(Time.midnight().toISOString(), today.toISOString());
            today = Time.parse('00:0');
            assert.equal(Time.midnight().toISOString(), today.toISOString());
            today = Time.parse('0:00:00');
            assert.equal(Time.midnight().toISOString(), today.toISOString());
        });
        it('should parse 00:00 to midnight just past', function() {
            var t0 = new Date();
            t0.setHours(0, 0, 0, 0);
            var t1 = Time.parse('00:00');
            assert.equal(t1.getTime(), t0.getTime());
        });
        it('should parse 00:01 to just past midnight', function() {
            var t0 = new Date();
            t0.setHours(0, 1, 0, 0);
            var t1 = Time.parse('00:01');
            assert.equal(t1.getTime(), t0.getTime());
        });
        it('should parse 0:0:1 to just past midnight', function() {
            var t0 = new Date();
            t0.setHours(0, 0, 1, 0);
            var t1 = Time.parse('0:0:1');
            assert.equal(t1.getTime(), t0.getTime());
        });
        it('should parse 23:59:59 to one second before midnight', function() {
            var t0 = new Date();
            t0.setHours(23, 59, 59, 0);
            var t1 = Time.parse('23:59:59');
            assert.equal(t1.getTime(), t0.getTime());
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

    describe('#before()', function() {
        it('should pass 08:00 before 12:00', function() {
            Time.for_now(Time.parse("08:00"), function() {
                assert(Time.before("12:00"));
            });
        });
        it('should fail 12:00:00 before 12:00', function() {
            Time.for_now(Time.parse("12:00:00"), function() {
                assert(!Time.before("12:00"));
            });
        });
        it('should pass 11:59:59 before 12:00', function() {
            Time.for_now(Time.parse("11:59:59"), function() {
                assert(Time.before("12:00"));
            });
        });
        it('should fail 12:00:01 before 12:00', function() {
            Time.for_now(Time.parse("12:00:01"), function() {
                assert(!Time.before("12:00"));
            });
        });
    });

    describe('#after()', function() {
        it('should fail 08:00 after 12:00', function() {
            Time.for_now(Time.parse("08:00"), function() {
                assert(!Time.after("12:00"));
            });
        });
        it('should pass 12:00:01 after 12:00', function() {
            Time.for_now(Time.parse("12:00:01"), function() {
                assert(Time.after("12:00"));
            });
        });
    });

    describe('#between()', function() {

        it('should pass 08:00 < 12:00 < 20:00', function() {
            Time.for_now(Time.parse("12:00"), function() {
                assert(Time.between("08:00", "20:00"));
            });
        });

        it('should fail 20:00 < 12:00 < 08:00', function() {
            Time.for_now(Time.parse("12:00"), function() {
                assert(!Time.between("20:00", "08:00"));
            });
        });

        it('should pass 22:00 < 00:00 < 02:00', function() {
            Time.for_now(Time.midnight(), function() {
                assert(Time.between("22:00", "02:00"));
            });
        });

        it('should fail 02:00 < 00:00 < 22:00', function() {
            Time.for_now(Time.midnight(), function() {
                assert(!Time.between("02:00", "22:00"));
            });
        });

        it('should pass 22:00 < 01:00 < 02:00', function() {
            Time.for_now(Time.parse("01:00"), function() {
                assert(Time.between("22:00", "02:00"));
            });
        });

        it('should pass 22:00 < 23:00 < 02:00', function() {
            Time.for_now(Time.parse("23:00"), function() {
                assert(Time.between("22:00", "02:00"));
            });
        });
    });
});
