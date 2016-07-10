var assert = require('chai').assert;

var Time = require('./Time.js');
describe('Time', function() {
    describe('#midnight()', function() {
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
        })
    });

    describe('#parse()', function() {
        var midnight = Time.midnight();
        var today;
        it('should parse h, h:m, and h:m:s', function() {
            today = Time.parse('0');
            assert.equal(midnight.toISOString(), today.toISOString());
            today = Time.parse('00:0');
            assert.equal(midnight.toISOString(), today.toISOString());
            today = Time.parse('0:00:00');
            assert.equal(midnight.toISOString(), today.toISOString());
        });
        it('should parse 00:00 to midnight just past', function() {
            var t0 = new Date();
            t0.setHours(0,0,0,0);
            var t1 = Time.parse('00:00');
            assert.equal(t1.getTime(), t0.getTime());
        });
        it('should parse 00:01 to midnight just past', function() {
            var t0 = new Date();
            t0.setHours(0,1,0,0);
            var t1 = Time.parse('00:01');
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

    describe('#between()', function() {
        var t;
        it('should pass 08:00 < 12:00 < 20:00', function() {
            Time.force_now(Time.parse("12:00"));
            assert(Time.between("08:00", "20:00"));
            Time.unforce_now();
        });
        it('should fail 20:00 < 12:00 < 08:00', function() {
            Time.force_now(Time.parse("12:00"));
            assert(!Time.between("20:00", "08:00"));
            Time.unforce_now();
        });       

        it('should pass 22:00 < 00:00 < 02:00', function() {
            Time.force_now(Time.parse("00:00"));
            assert(Time.between("22:00", "02:00"));
        });
        it('should fail 02:00 < 00:00 < 22:00', function() {
            Time.force_now(Time.parse("00:00"));
            assert(!Time.between("02:00", "22:00"));
            Time.unforce_now();
        });
    });
    describe('#after()', function() {
        var t;
        it('should fail 08:00 after 12:00', function() {
            Time.force_now(Time.parse("08:00"));
            assert(!Time.after("12:00"));
        });
        it('should pass 12:00:01 after 12:00', function() {
            Time.force_now(Time.parse("12:00:01"));
            assert(Time.after("12:00"));
        });
    });
    describe('#before()', function() {
        var t;
        it('should pass 08:00 before 12:00', function() {
            Time.force_now(Time.parse("08:00"));
            assert(Time.before("12:00"));
        });
        it('should fail 12:00:01 before 12:00', function() {
            Time.force_now(Time.parse("12:00:00"));
            assert(!Time.before("12:00"));
        });
    });
});

var Location = require('./Location.js');
describe('Location', function() {
    var l1, l2, l3;
    describe('#Location()', function() {
        it('should handle numbers', function() {
            l1 = new Location(53,-2);
            assert.equal(53, l1.lat);
            assert.equal(-2, l1.lng);
        });
        it('should handle another location', function() {
            l2 = new Location(l1);
            assert.equal(53, l1.lat);
            assert.equal(-2, l1.lng);
            assert.equal(53, l2.lat);
            assert.equal(-2, l2.lng);
        });
    });
    describe('#equals()', function() {
        l1 = new Location(53,-2);
        it('should handle the same location', function() {
            l2 = new Location(l1);
            assert(l2.equals(l1));
        });
        it('should handle almost the same location', function() {
            l2 = new Location(l1.lat + 0.00004, l1.lng - 0.00004);
            assert(l2.equals(l1));
            l2 = new Location(l1.lat + 0.00006, l1.lng - 0.00006);
            assert(!l2.equals(l1));
        });
    });
    describe('#haversine()', function() {
        l1 = new Location(53,-2);
        it('should handle almost the same location', function() {
            l2 = new Location(l1.lat + 0.00004, l1.lng - 0.00004);
            assert.equal(5, Math.round(l1.haversine(l2)));
        });
        it('should handle almost the same location 2', function() {
            l2 = new Location(l1.lat + 0.00006, l1.lng - 0.00006);
            assert.equal(8, Math.round(l1.haversine(l2)));
        });
        it('should handle a distant location', function() {
            l2 = new Location(50,5);
            assert.equal(587856, Math.round(l1.haversine(l2)));
        });
    });
    describe('#toString()', function() {
        l1 = new Location(53,-2);
        it('should stringify cleanly', function() {
            assert.equal("53,-2", l1.toString());
        });
    });
});
