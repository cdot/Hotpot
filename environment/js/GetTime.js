/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Get and set the current date by visiting a site on the web
 * Not needed if NTP or other time synchronisation support is available
 * See environment/README.md for information.
 */
const DESCRIPTION = "DESCRIPTION\nSimple server time synchronisation";

let requirejs = require('requirejs');

requirejs.config({
	baseUrl: __dirname + "/../.."
});

requirejs(["node-getopt", "http", "fs", "common/js/DataModel"], function(Getopt, Http, fs, DataModel) {

	const Fs = fs.promises;

	let cliopt = Getopt.create([
		["h", "help", "Show this help"],
		["s", "set", "Set the time (must be root)"],
		["c", "config=ARG", "Configuration file (default ./GetTime.cfg)"]
	])
		.bindHelp()
		.setHelp(DESCRIPTION + "[[OPTIONS]]")
		.parseSystem()
		.options;

	if (typeof cliopt.config === "undefined")
		cliopt.config = "./GetTime.cfg";

	function setTime(time) {
		let Sys = require('child_process');
		return new Promise((resolve, reject) => {
			Sys.execFile("/bin/date", ["-s", time],
						 (error, stdout, stderr) => {
							 if (error) {
								 console.error(addr + " error " + error);
								 reject();
							 } else {
								 resolve();
							 }
						 });
		});
	}

	function getTimeFrom(addr) {
		return new Promise((resolve, reject) => {
			console.debug("Trying " + addr);
			Http.get(
				addr,
				res => {
					console.log(res.statusCode + " received from " +
								addr + " " + res.headers.date);
					if (res.statusCode < 200 || res.statusCode > 299) {
						console.error("Failed to load URL, status: " +
												res.statusCode);
						reject();
					} else {
						console.log(addr + " says it's " + res.headers.date);
						if (cliopt.set) {
							return setTime(res.headers.date)
							.then(resolve)
							.catch(reject);
						} else
							resolve();
					}
				});
		})
		.catch("error", err => {
			console.error(addr + " failed " + err);
			reject();
		});
	}

	DataModel.loadData(cliopt.config, {
		$skip: true // don't bother checking
	})
	.then(cfg => {
		var proms = [];
		for (var i = 0; i < cfg.length; i++) {
			if (cfg[i][0] != "_")
				proms.push(getTimeFrom(cfg[i]))
		}
		Promise.any(proms).then(() => { console.log("OK"); });
	});
});

