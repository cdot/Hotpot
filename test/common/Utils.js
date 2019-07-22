/*@preserve Copyright (C) 2017-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["test/TestRunner", "common/Utils"], function(TestRunner, Utils) {

    let tr = new TestRunner("Utils");
    let assert = tr.assert;

    tr.addTest('expands env vars', function() {
        var q = process.env["HOME"];
        assert.equal(Utils.expandEnvVars("${HOME}"), q);
        assert.equal(Utils.expandEnvVars("~"), q);
        assert.equal(Utils.expandEnvVars("$HOME"), q);
        assert.equal(Utils.expandEnvVars("${HOME}and$HOME"),
                     q + "and" + q);
    });

    tr.addTest('extends', function() {
        var a = { a: 1 };
        var b = { b: 2 };
        var c = Utils.extend(a, b);
        assert.deepEqual(c, { a:1, b:2 });
        c = Utils.extend(c, {a:3});
        assert.deepEqual(c, { a:3, b:2 });
    });

    tr.addTest("exceptions", function() {
        var t = new Utils.exception("A", {b: 1}, " flabdab");
        assert.equal(t.name, "A");
        assert.equal(t.message, "{\n b: 1\n} flabdab");
    });

    tr.run();
});
