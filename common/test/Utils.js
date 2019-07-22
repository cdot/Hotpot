/*eslint-env node, mocha */
var assert = require('chai').assert;

var Utils = require('../Utils.js');
const TAG = "Utils";

describe('common/Utils', function() {
    it('expands env vars', function() {
        var q = process.env["HOME"];
        assert.equal(Utils.expandEnvVars("${HOME}"), q);
        assert.equal(Utils.expandEnvVars("~"), q);
        assert.equal(Utils.expandEnvVars("$HOME"), q);
        assert.equal(Utils.expandEnvVars("${HOME}and$HOME"),
                     q + "and" + q);
    });

    it('extends', function() {
        var a = { a: 1 };
        var b = { b: 2 };
        var c = Utils.extend(a, b);
        assert.deepEqual(c, { a:1, b:2 });
        c = Utils.extend(c, {a:3});
        assert.deepEqual(c, { a:3, b:2 });
    });

    it("exceptions", function() {
        var t = new Utils.exception("A", {b: 1}, " flabdab");
        assert.equal(t.name, "A");
        assert.equal(t.message, "{\n b: 1\n} flabdab");
    });
});
