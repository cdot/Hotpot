/*@preserve Copyright (C) 2017-2019 Crawford Currie http://c-dot.co.uk license MIT*/

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["test/TestRunner", "common/Location"], function(TestRunner, Location) {

    let tr = new TestRunner("DataModel");
    let assert = tr.assert;

    tr.addTest('should handle numbers', function() {
        let l1 = new Location(53, -2);
        assert.equal(53, l1.latitude);
        assert.equal(-2, l1.longitude);
    });
    
    tr.addTest('should handle another location', function() {
        let l1 = new Location(53, -2);
        let l2 = new Location(l1);
        assert.equal(53, l1.latitude);
        assert.equal(-2, l1.longitude);
        assert.equal(53, l2.latitude);
        assert.equal(-2, l2.longitude);
    });

    tr.addTest('should handle the same location', function() {
        let l1 = new Location(53, -2);
        let l2 = new Location(l1);
        assert(l2.equals(l1));
    });
    
    tr.addTest('should handle almost the same location', function() {
        let l1 = new Location(53, -2);
        let l2 = new Location(l1.latitude + 0.00004, l1.longitude - 0.00004);
        assert(l2.equals(l1));
        l2 = new Location(l1.latitude + 0.00006, l1.longitude - 0.00006);
        assert(!l2.equals(l1));
    });

    tr.addTest('should handle almost the same location', function() {
        let l1 = new Location(53, -2);
        let l2 = new Location(l1.latitude + 0.00004, l1.longitude - 0.00004);
        assert.equal(5, Math.round(l1.haversine(l2)));
    });
    tr.addTest('should handle almost the same location 2', function() {
        let l1 = new Location(53, -2);
        let l2 = new Location(l1.latitude + 0.00006, l1.longitude - 0.00006);
        assert.equal(8, Math.round(l1.haversine(l2)));
    });
    tr.addTest('should handle a distant location', function() {
        let l1 = new Location(53, -2);
        let l2 = new Location(50, 5);
        assert.equal(587856, Math.round(l1.haversine(l2)));
    });
    tr.addTest('should stringify cleanly', function() {
        let l1 = new Location(53, -2);
        assert.equal("(53,-2)", l1.toString());
    });
    tr.run();
});
