/*@preserve Copyright (C) 2017-2022 Crawford Currie http://c-dot.co.uk license MIT*/

import { assert } from "chai";
import { Location } from "../../src/common/Location.js";

describe("Location", () => {

	it('should handle numbers', () => {
		let l1 = new Location(53, -2);
		assert.equal(53, l1.latitude);
		assert.equal(-2, l1.longitude);
	});

	it('should handle another location', () => {
		let l1 = new Location(53, -2);
		let l2 = new Location(l1);
		assert.equal(53, l1.latitude);
		assert.equal(-2, l1.longitude);
		assert.equal(53, l2.latitude);
		assert.equal(-2, l2.longitude);
	});

	it('should handle the same location', () => {
		let l1 = new Location(53, -2);
		let l2 = new Location(l1);
		assert(l2.equals(l1));
	});

	it('should handle almost the same location', () => {
		let l1 = new Location(53, -2);
		let l2 = new Location(l1.latitude + 0.00004, l1.longitude - 0.00004);
		assert(l2.equals(l1));
		l2 = new Location(l1.latitude + 0.00006, l1.longitude - 0.00006);
		assert(!l2.equals(l1));
	});

	it('should handle almost the same location', () => {
		let l1 = new Location(53, -2);
		let l2 = new Location(l1.latitude + 0.00004, l1.longitude - 0.00004);
		assert.equal(5, Math.round(l1.haversine(l2)));
	});
	it('should handle almost the same location 2', () => {
		let l1 = new Location(53, -2);
		let l2 = new Location(l1.latitude + 0.00006, l1.longitude - 0.00006);
		assert.equal(8, Math.round(l1.haversine(l2)));
	});

  it('should handle a distant location', () => {
		let l1 = new Location(53, -2);
		let l2 = new Location(50, 5);
		assert.equal(587856, Math.round(l1.haversine(l2)));
	});

  it('should stringify cleanly', () => {
		let l1 = new Location(53, -2);
		assert.equal("(53,-2)", l1.toString());
	});
});
