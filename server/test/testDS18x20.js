/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["node-getopt", "common/js/Utils", "server/js/DS18x20"], function(Getopt, Utils, DS18x20) {

	let getopt = new Getopt([
		[ "h", "help", "Show this help" ],
		[ "p", "poll", "Poll the device(s) continuously" ]
	])
	.setHelp(`Usage: node ${process.argv[1]} [OPTION] <sensor>\n`
			 + "With no options, get the value of all sensors\n\n"
			 + "[[OPTIONS]]")
    .bindHelp()
    .parseSystem();

	let cliopt = getopt.options;

	function poll(sensors) {
		Promise.all(sensors.map((sensor) => 
			sensor.getTemperature()
			.then((t) => { console.log(`${sensor.id}: ${t}`); })))
		.then(() => {
			if (cliopt.poll)
				setTimeout(() => poll(), 2000);
		})
		.catch((e) => {console.error(e);});
	}

	let id = getopt.argv[0];
	let promise;
	if (typeof id === "undefined")
		promise = DS18x20.list();
	else
		promise = Promise.resolve(id);

	promise
	.then((ids) => {
		console.log("Sensors ", ids);
		Promise.all(ids.map(id => {
			let sensor = new DS18x20(id);
			return sensor.initialiseSensor();
		}))
		.then((sensors) => {
			poll(sensors);
		});
	})
	.catch((e) => {console.error(e);});
});
