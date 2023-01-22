/*eslint-env node, mocha */

/*eslint-env node */

import { assert } from "chai";
import { Time } from "../../src/common/Time.js";
import { DataModel } from "../../src/common/DataModel.js";
import { MetOffice } from "../../src/server/MetOffice.js";

describe("MetOffice", () => {

	const config = {
		api_key: "f6268ca5-e67f-4666-8fd2-59f219c5f66d",
		history: {
			file: "/tmp/metoffice.log"
		},
		location: {
			latitude: 53.2479442,
			longitude: -2.5043655
		}
	};

	it('Works', () => {
		let mo;
		return DataModel.remodel({
			index: "test",
			data: {
				api_key: "f6268ca5-e67f-4666-8fd2-59f219c5f66d",
				history: {
					file: "/tmp/metoffice.log"
				}
			},
      model: MetOffice.Model
    })
		.then(obj => { mo = obj; })
		.then(() => mo.setLocation({
			latitude: 53.2479442,
			longitude: -2.5043655
		}))
		.then(() => mo.getSerialisableState())
		.then(d => {
			assert(typeof d.temperature === "number");
		})
		.then(() => mo.getSerialisableLog())
		.then(result => {
			let base = result[0];
			assert(typeof base === "number");
			let last = 0;
			for (let i = 1; i < result.length; i += 2) {
				assert(result[i] >= last);
				assert(result[i] <= Date.now());
				last = result[i];
				assert(result[i + 1] > -10);
				assert(result[i + 1] < 50);
			}
			/// Force an update to make sure it happens
			const u1 = mo.last_update;
			return mo.update()
			.then(() => u1);
		})
		.then(u1 => {
			assert(mo.last_update > u1, "No fresh data");
			// Stop the update timer
			mo.stop();
		});
	});
});
