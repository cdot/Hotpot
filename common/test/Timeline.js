/*eslint-env node, mocha */
var assert = require('chai').assert;

const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms
var Timeline = require('../Timeline.js');
const TAG = "Timeline";

var test_line_proto = {
    min: 4,
    max: 100,
    period: 30,
    points: [
        { time: 0, value: 10 },
        { time: 10, value: 100 },
        { time: 20, value: 4 },
        { time: 29, value: 10 }
    ]
};

describe('common/Timeline', function() {
    it('constructs', function() {
        var tl;
        try {
            tl = new Timeline({ period: -1 });
            assert(false, "Should not get here");
        } catch (e) {
            assert(e instanceof Error);
            assert.equal(e.name, TAG);
            assert.equal(e.message, "Bad model");
        }
        tl = new Timeline({
            min: 0,
            max: 100,
            period: 1000
        });
        // Timeline always has start and end points
        assert.equal(tl.nPoints(), 2);
        var p = tl.getPoint(0);
        assert.equal(p.time, 0);
        assert.equal(p.value, 50);
        p = tl.getPoint(1);
        assert.equal(p.time, 999);
        assert.equal(p.value, 50);
    });
    
    it('handles points', function() {
        var tl = new Timeline(test_line_proto);
        assert.equal(tl.nPoints(), 4);
        assert.equal(tl.getPointAfter(0), 1);
        assert.equal(tl.getPointAfter(28), 3);
        assert.equal(tl.getPointAfter(29), 3);
        assert.equal(tl.getPointAfter(19), 2);
        tl.setPoint(0);
        tl.setPoint(1);
        tl.setPoint(2);
        tl.setPoint(3);
        try {
            tl.setPoint(5, { time: 1000, value: 50});
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "Point 5 not in timeline");
        }
        try {
            tl.setPoint(-1, { time: 1000, value: 50});
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "Point -1 not in timeline");
        }
        try {
            tl.setPoint(2, { time: 1000, value: 50});
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "Time 1000 outside period 0..29");
        }
        try {
            tl.setPoint(2, { time: 0, value: 50});
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "setPoint 0 is earlier than preceding point @10");
        }
        try {
            tl.insertBefore(1, { time: 9, value: 1000 });
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "setPoint value 1000 is out of range 4..100");
        }
        try {
            tl.insertBefore(1, { time: 9, value: 2 });
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "setPoint value 2 is out of range 4..100");
        }
    });

    it('interpolates', function() {
        var tl = new Timeline(test_line_proto);          
        var p = tl.getPoint(2);
        assert.equal(p.time, 20);
        assert.equal(p.value, 4);
        assert.equal(tl.getMaxValue(), 100);
        assert.equal(tl.valueAtTime(0), 10);
        assert.equal(tl.valueAtTime(20), 4);
        assert.equal(tl.valueAtTime(29), 10);
        assert.equal(tl.valueAtTime(20+(29-20)/2), 7);
        try {
            tl.valueAtTime(1000);
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "1000 is outside timeline 0..29");
        }
        try {
            tl.valueAtTime(-1);
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "-1 is outside timeline 0..29");
        }
    });

    it('supports insertion', function() {
        var tl = new Timeline({
            min: 0,
            max: 100,
            period: 20,
            points: [
                { time: 0, value: 10 },
                { time: 19, value: 10 }]
        });
        assert.equal(tl.nPoints(), 2);
        try {
            tl.insertBefore(2, { time: 15, value: 76 });
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "Index 2 is outside timeline 0..1");
        }
        try {
            tl.insertBefore(0, { time: 15, value: 76 });
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "Index 0 is outside timeline 0..1");
        }
        assert.equal(tl.nPoints(), 2);
        tl.insertBefore(1, { time: 10, value: 5 });
        assert.equal(tl.nPoints(), 3);
        assert.equal(tl.getPoint(1).value, 5);
        try {
            tl.insertBefore(1, { time: 10, value: 5 });
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "setPoint 10 is later than following point @10");
        }

    });

    it('handles constrained points', function() {
        var tl = new Timeline(test_line_proto);
        try {
            tl.setPointConstrained(5, { time: 1000, value: 50});
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "Point 5 not in timeline");
        }
        try {
            tl.setPointConstrained(-1, { time: 1000, value: 50});
            assert(false);
        } catch (e) {
            assert.equal(e.name, TAG);
            assert.equal(e.message, "Point -1 not in timeline");
        }
        var p = tl.getPoint(2);
        assert(tl.setPointConstrained(2, { time: 1000, value: 500}));
        assert.equal(p.time, 28);
        assert.equal(p.value, 100);
        assert(tl.setPointConstrained(2, { time: 0, value: 1}));
        assert.equal(p.time, 11);
        assert.equal(p.value, 4);

        p = tl.getPoint(0);
        assert(tl.setPointConstrained(0, { time: 1000, value: 500}));
        assert.equal(p.time, 0);
        assert.equal(p.value, 100);
        assert(tl.setPointConstrained(0, { time: 0, value: 1}));
        assert.equal(p.time, 0);
        assert.equal(p.value, 4);

        p = tl.getPoint(3);
        assert(tl.setPointConstrained(3, { time: 1000, value: 500}));
        assert.equal(p.time, 29);
        assert.equal(p.value, 100);
        assert(tl.setPointConstrained(3, { time: 0, value: 1}));
        assert.equal(p.time, 29);
        assert.equal(p.value, 4);

    });
});
