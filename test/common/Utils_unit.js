/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

import { assert } from "chai";
import { Utils } from "../../src/common/Utils.js";

/*eslint-env node, mocha */
describe("Utils", () => {

	it('expands env vars', () => {
		let q = process.env["HOME"];
		assert.equal(Utils.expandEnvVars("${HOME}"), q);
		assert.equal(Utils.expandEnvVars("~"), q);
		assert.equal(Utils.expandEnvVars("$HOME"), q);
		assert.equal(Utils.expandEnvVars("${HOME}and$HOME"),
					 q + "and" + q);
	});

	it('extends', () => {
		const a = { a: 1 };
		const b = { b: 2 };
    const q = { q: 3 };
		let c = Utils.extend(a, b, q);
		assert.deepEqual(c, { a:1, b:2, q: 3 });
		c = Utils.extend(c, {a:3});
		assert.deepEqual(c, { a:3, b:2, q:3 });
	});

	it("exceptions", () => {
		let t = Utils.exception("A", {b: 1}, " flabdab");
		assert.equal(t.name, "A");
		assert.equal(t.message, "{\n b: 1\n} flabdab");
	});
});
