/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["node-getopt", "common/js/Utils", "server/js/Gpio"], function(Getopt, Utils, Gpio) {

	var getopt = new Getopt([
		[ "h", "help", "Show this help" ],
		[ "d", "direction=ARG", "Set the direction, in or out (default out)" ],
		[ "a", "active=ARG", "Set active low or high (default low)" ],
		[ "s", "set=ARG", "Set the value of the GPIO, 1 or 0" ]
	])
	.setHelp(`Usage: node ${process.argv[1]} [OPTION] <pin>\n`
			 + "With no options, get the value of the pin\n\n"
			 + "[[OPTIONS]]")
    .bindHelp()
    .parseSystem();

	var cliopt = getopt.options;

	var direction = cliopt.direction;
	if (typeof direction === "undefined")
		direction = "out";
	else if (direction !== "in" && direction !== "out") {
		console.error(`Bad direction=${direction}`);
		cliopt.showHelp();
	}

	let active = cliopt.active;
	if (typeof active === "undefined")
		active = "low";
	else if (active !== "low" && active !== "high") {
		console.error(`Bad active=${active}`);
		getopt.showHelp();
	}

	let value = cliopt.set;
	if (typeof value !== "undefined" && value != 0 && value != 1) {
		console.error(`Bad set=${value}`);
		getopt.showHelp();
	}

	Utils.TRACEwhat("Gpio");

	let pin = parseInt(getopt.argv[0]);
	if (typeof pin !== "number") {
		console.error(`Bad pin ${pin}`);
		getopt.showHelp();
	}

	let gpio = new Gpio(pin);
	console.log(`Pin ${pin} direction ${direction} active ${active}`);
	if (typeof value !== "undefined")
		console.log(`\tset ${value}`);

	gpio.initialiseGpio(direction, active)
	.then(() => {
		if (typeof value !== "undefined")
			return gpio.setValue(value);
		else
			return Promise.resolve();
	})
	.then(() => gpio.getValue())
	.then(val => {
		console.log(`Value is ${val}`);
	})
	.catch(e => {
		console.error(e);
	});
});
