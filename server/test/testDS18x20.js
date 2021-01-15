/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["node-getopt", "common/js/Utils", "server/js/Gpio"], function(Getopt, Utils, Gpio) {

	var getopt = new Getopt([
		[ "h", "help", "Show this help" ],
		[ "p", "poll", "Poll the device(s) continuously" ]
	])
	.setHelp(`Usage: node ${process.argv[1]} [OPTION] <sensor>\n`
			 + "With no options, get the value of all sensors\n\n"
			 + "[[OPTIONS]]")
    .bindHelp()
    .parseSystem();

	var cliopt = getopt.options;

	var sensor = getopt.argv[0];
	let sensors = [];
	if (typeof sensor === "undefined") {
		sensors = DS18x20.list();
	} else
		sensors.push(sensor);

	function poll() {
		let promises = [];
		for (let i in sensors) {
			promises.push((id) => {
				let sensor = new DS18x20(id);
				return sensor.initialiseSensor()
				.then((t) => {
					console.log(`${id}: ${t}`);
				});
			});
		}
		Promise.all(promises)
		.then(() => {
			if (cliopt.poll)
				setTimeout(() => poll(), 2000);
		});
	}

	poll();
});
