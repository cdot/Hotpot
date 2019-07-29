/*@preserve Copyright (C) 2017-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["test/TestRunner", "common/js/Vec"], function(TestRunner, Vec) {

    let tr = new TestRunner("Utils");
    let assert = tr.assert;

    tr.addTest('sub', function() {
        assert.deepEqual(Vec.sub([9, 8, 7], [1, 2, 3]), [ 8, 6, 4 ]);
        assert.deepEqual(Vec.sub({x:9, y:8, z:7}, {x:1, y:2, z:3}),
                         {x:8, y:6, z:4});
    });

    tr.addTest('add', function() {
        assert.deepEqual(Vec.add([9, 8, 7], [1, 2, 3]), [ 10, 10, 10 ]);
        assert.deepEqual(Vec.add({x:9, y:8}, {x:1, y:2}), {x:10,y:10});
    });
    
    tr.addTest('scalar mul', function() {
        assert.deepEqual(Vec.mul([9, 8, 7], 2), [ 18, 16, 14 ]);
        assert.deepEqual(Vec.mul({a:9}, 2), {a:18});
    });
    
    tr.addTest('scalar div', function() {
        assert.deepEqual(Vec.div([8, 6, 4], 2), [ 4, 3, 2 ]);
        assert.deepEqual(Vec.div({a:18}, 2), {a:9});
    });
    
    tr.addTest('dot product', function() {
        assert.equal(Vec.dot([9, 8, 7], [1, 2, 3]), 46);
        assert.equal(Vec.dot({a:9, b:8}, {a:10, b:5}), 130);
    });
    
    tr.addTest('mag2', function() {
        assert.equal(Vec.mag2([9, 8, 7]), 194);
    });
    
    tr.addTest('mag', function() {
        assert.equal(Vec.mag([9, 8, 7]), Math.sqrt(194));
    });
    
    tr.addTest('normalises', function() {
        assert.deepEqual(Vec.normalise([9, 8, 7]),
                         Vec.div([9,8,7],Math.sqrt(194)));
    });

    tr.run();
});
