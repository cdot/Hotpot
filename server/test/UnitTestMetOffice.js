/*eslint-env node, mocha */

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
	baseUrl: "../.."
});

requirejs(["common/test/TestRunner", "common/js/Utils", "common/js/Time", "common/js/DataModel", "server/js/MetOffice"], function(TestRunner, Utils, Time, DataModel, MetOffice) {

	var config = {
		api_key: "f6268ca5-e67f-4666-8fd2-59f219c5f66d",
		history: {
			file: "/tmp/metoffice.log"
		},
		location: {
			latitude: 53.2479442,
			longitude: -2.5043655
		}
	};

	let tr = new TestRunner("MetOffice");
	let assert = tr.assert;

	tr.addTest('Works', () => {
		return DataModel.remodel(
			"test",
			{
				api_key: "f6268ca5-e67f-4666-8fd2-59f219c5f66d",
				history: {
					file: "/tmp/metoffice.log"
				}
			}, MetOffice.Model, [])
		.then(mo => {
			let u1;
			return mo.setLocation({
				latitude: 53.2479442,
				longitude: -2.5043655
			})
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
				u1 = mo.last_update;
				return mo.update();
			})
			.then(() => {
				assert(mo.last_update > u1, "No fresh data");
				mo.stop();
			});
		});
	});

	tr.run();
});
