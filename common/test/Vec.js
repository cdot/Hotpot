/*eslint-env node, mocha */
var assert = require('chai').assert;

var Vec = require('../Vec.js');
const TAG = "Vec";

describe('common/Vec', function() {
    it('sub', function() {
        assert.deepEqual(Vec.sub([9, 8, 7], [1, 2, 3]), [ 8, 6, 4 ]);
        assert.deepEqual(Vec.sub({x:9, y:8, z:7}, {x:1, y:2, z:3}),
                         {x:8, y:6, z:4});
    });

    it('add', function() {
        assert.deepEqual(Vec.add([9, 8, 7], [1, 2, 3]), [ 10, 10, 10 ]);
        assert.deepEqual(Vec.add({x:9, y:8}, {x:1, y:2}), {x:10,y:10});
    });
    
    it('scalar mul', function() {
        assert.deepEqual(Vec.mul([9, 8, 7], 2), [ 18, 16, 14 ]);
        assert.deepEqual(Vec.mul({a:9}, 2), {a:18});
    });
    
    it('scalar div', function() {
        assert.deepEqual(Vec.div([8, 6, 4], 2), [ 4, 3, 2 ]);
        assert.deepEqual(Vec.div({a:18}, 2), {a:9});
    });
    
    it('dot product', function() {
        assert.equal(Vec.dot([9, 8, 7], [1, 2, 3]), 46);
        assert.equal(Vec.dot({a:9, b:8}, {a:10, b:5}), 130);
    });
    
    it('mag2', function() {
        assert.equal(Vec.mag2([9, 8, 7]), 194);
    });
    
    it('mag', function() {
        assert.equal(Vec.mag([9, 8, 7]), Math.sqrt(194));
    });
    
    it('normalises', function() {
        assert.deepEqual(Vec.normalise([9, 8, 7]),
                         Vec.div([9,8,7],Math.sqrt(194)));
    });
});
