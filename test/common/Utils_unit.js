/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

import { assert } from "chai";

import { extend } from "../../src/common/extend.js";
import { expandEnv } from "../../src/common/expandEnv.js";

/*eslint-env node, mocha */
describe("Utils", () => {

	it('expands env vars', () => {
		let q = process.env["HOME"];
		assert.equal(expandEnv("${HOME}"), q);
		assert.equal(expandEnv("~"), q);
		assert.equal(expandEnv("$HOME"), q);
		assert.equal(expandEnv("${HOME}and$HOME"),
					 q + "and" + q);
	});

	it('extends', () => {
		const a = { a: 1 };
		const b = { b: 2 };
    const q = { q: 3 };
		let c = extend(a, b, q);
		assert.deepEqual(c, { a:1, b:2, q: 3 });
		c = extend(c, {a:3});
		assert.deepEqual(c, { a:3, b:2, q:3 });
	});
});
