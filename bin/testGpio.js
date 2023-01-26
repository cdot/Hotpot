/*@preserve Copyright (C) 2021-2023 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import getopt from "posix-getopt";
import { Gpio } from "../src/server/Gpio.js";

const DESCRIPTION = [
	`Usage: node ${process.argv[1]} [OPTION] <pin>`,
	"\tWith no options, get the value of the pin",
	"-h, --help - Show this help",
	"-d, --direction=ARG - Set the direction, in or out (default out)",
	"-a, --active=ARG - Set active low or high (default low)",
	"-s, --set=ARG - Set the value of the GPIO, 1 or 0"
].join("\n");

const go_parser = new getopt.BasicParser(
  "h(help)l(list)C:(calendar)c:(config)",
  process.argv);
const cliopt = {
  config: "./hotpot.cfg"
};

let option;
while ((option = go_parser.getopt())) {
  switch (option.option) {
  case 'd': cliopt.direction = option.optarg; break;
  case 'a': cliopt.active = option.optarg; break;
  case 's': cliopt.set = option.optarg; break;
  default: console.log(DESCRIPTION); process.exit(0);
	}
}

let direction = cliopt.direction;
if (typeof direction === "undefined")
	direction = "out";
else if (direction !== "in" && direction !== "out") {
	console.error(`Bad direction=${direction}`);
  console.log(DESCRIPTION); process.exit(0);
}

let active = cliopt.active;
if (typeof active === "undefined")
	active = "low";
else if (active !== "low" && active !== "high") {
	console.error(`Bad active=${active}`);
  console.log(DESCRIPTION); process.exit(0);
}

const value = cliopt.set;
if (typeof value !== "undefined" && value != 0 && value != 1) {
	console.error(`Bad set=${value}`);
  console.log(DESCRIPTION); process.exit(0);
}

let pin = parseInt(process.argv[go_parser.optind()]);
if (typeof pin !== "number") {
	console.error(`Bad pin ${pin}`);
  console.log(DESCRIPTION); process.exit(0);
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
