/*eslint-env node, mocha */
var assert = require('chai').assert;

var Location = require('../Location.js');
describe('Location', function() {
    var l1, l2, l3;
    describe('#Location()', function() {
        it('should handle numbers', function() {
            l1 = new Location(53, -2);
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
        l1 = new Location(53, -2);
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
        l1 = new Location(53, -2);
        it('should handle almost the same location', function() {
            l2 = new Location(l1.lat + 0.00004, l1.lng - 0.00004);
            assert.equal(5, Math.round(l1.haversine(l2)));
        });
        it('should handle almost the same location 2', function() {
            l2 = new Location(l1.lat + 0.00006, l1.lng - 0.00006);
            assert.equal(8, Math.round(l1.haversine(l2)));
        });
        it('should handle a distant location', function() {
            l2 = new Location(50, 5);
            assert.equal(587856, Math.round(l1.haversine(l2)));
        });
    });
    describe('#toString()', function() {
        l1 = new Location(53, -2);
        it('should stringify cleanly', function() {
            assert.equal("53,-2", l1.toString());
        });
    });
});
