/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
	baseUrl: __dirname + "/../.."
});

requirejs(["posix-getopt", "js/common/Utils", "js/server/DS18x20"], function(getopt, Utils, DS18x20) {

  const ASYNC = true;

  const go_parser = new getopt.BasicParser(
    "h(help)p:(poll)",
    process.argv);

	const DESCRIPTION = [
    "DESCRIPTION",
    "Read DS18x20 one-wire temperature sensors",
	  "USAGE",
    `node ${process.argv[1]} [OPTION] <sensor>`,
		"With no options, get the value of all sensors",
    "OPTIONS",
		"\t-h, --help -Show this help",
		"\t-p, --poll=ARG - Poll the device(s) every ARG seconds"
  ].join("\n");

	const cliopt = {};
  let option;
  while ((option = go_parser.getopt())) {
    switch (option.option) {
    case 'p': cliopt.poll = option.optarg; break;
    case 'd': cliopt.debug = true; break;
    default: console.log(DESCRIPTION); process.exit(0);
	  }
  }
	let id = process.argv[go_parser.optind()];
  let freq = cliopt.poll ? parseFloat(cliopt.poll) : 2;

	// Number of ms since last-known-good sample
	let longestWait = [];
	let lastKnownGood = [];

	function poll(sensors) {
		// This could (might but probably won't) result in asynchronous reads from the
		// 1-wire bus.
		let promise;
    if (ASYNC) {
		  promise = Promise.all(sensors.map(sensor => {
			  sensor.getTemperature()
			  .then(t => {
				  let now = Date.now();
				  let diff = (now - lastKnownGood[sensor.id]) / 1000;
				  console.log(`${sensor.id}: ${t} ${diff}`);
				  lastKnownGood[sensor.id] = now;
			  })
			  .catch(() => {
				  let wait = (Date.now() - lastKnownGood[sensor.id]) / 1000;
				  if (wait > longestWait[sensor.id])
					  longestWait[sensor.id] = wait;
				  console.error(`Nothing from ${sensor.id} for ${wait} (${longestWait[sensor.id]})`);
	 		  });
		  }));
    } else {
		  promise = Promise.resolve();
		  for (let i in sensors) {
			  let sensor = sensors[i];
			  promise = promise.then(() => sensor.getTemperature())
			  .then(t => {
				  let now = Date.now();
				  let diff = (now - lastKnownGood[sensor.id]) / 1000;
				  console.log(`${sensor.id}: ${t} ${diff}`);
				  lastKnownGood[sensor.id] = now;
			  })
			  .catch(() => {
				  let wait = (Date.now() - lastKnownGood[sensor.id]) / 1000;
				  if (wait > longestWait[sensor.id])
					  longestWait[sensor.id] = wait;
				  console.error(`Nothing from ${sensor.id} for ${wait} (${longestWait[sensor.id]})`);
	 		  });
		  }
    }
		promise.finally(() => {
			if (freq > 0)
				Utils.startTimer("freq", () => poll(sensors), freq * 1000);
		});
	}

	((typeof id === "undefined") ? DS18x20.list() : Promise.resolve([id]))
	.then(ids => {
		console.log("Sensors ", ids);
		Promise.all(ids.map(id => {
			let sensor = new DS18x20(id);
			lastKnownGood[sensor.id] = Date.now();
			longestWait[sensor.id] = 0;
			return sensor.initialiseSensor();
		}))
		.then(sensors => {
			poll(sensors);
		});
	})
	.catch(e => {console.error(e);});
});
