/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Determine "true" IP address.
 * See README.md for information.
 */

/** @private */
const requirejs = require('requirejs');

requirejs.config({
	baseUrl: __dirname + "/../.."
});

requirejs(["node-getopt", "jsftp", "fs", "common/js/Utils", "common/js/DataModel"], function(Getopt, JSFtp, fs, Utils, DataModel) {

	const DESCRIPTION = "DESCRIPTION\nSimple server time synchronisation";
	const Fs = fs.promises;

	function Url(e) {
		for (let i in e)
			this[i] = e[i];
	}

	Url.prototype.toString = () => {
		return (this.protocol ? this.protocol : "?") +
		"://" +
		(this.ipaddr ? this.ipaddr : "?") +
		(this.port ? this.port : "") +
		(this.path ? this.path : "");
	};

	Url.prototype.equals = other => {
		return (this.ipaddr === other.ipaddr) &&
		(this.protocol === other.protocol) &&
		(this.path === other.path) &&
		(this.port === other.port);
	};

	let cliopt = Getopt.create([
		["h", "help", "Show this help"],
		["", "debug", "Run in debug mode"],
		["", "force", "Force an update, even if the target hasn't changed"],
		["c", "config=ARG", "Configuration file (default ./GetIP.cfg)"]
	])
		.bindHelp()
		.setHelp(DESCRIPTION + "[[OPTIONS]]")
		.parseSystem()
		.options;

	if (typeof cliopt.config === "undefined")
		cliopt.config = "./GetIP.cfg";

	if (cliopt.debug)
		Utils.TRACEfilter("all");

	let config, current = {};

	DataModel.loadData(cliopt.config, {
		$unchecked: true
	})
	.then(cfg => {
		config = cfg;
		step1();
	});

	/**
	 * Return a promise to update the IP address using FTP, if it has changed
	 * (or config.force is on)
	 */
	function update(data) {
		let Ftp = new JSFtp(config.ftp);

		if (config.ftp.debugEnable) {
			Ftp.on("jsftp_debug", (eventType, daa) => {
				Utils.TRACE("FTP DEBUG: ", eventType);
				Utils.TRACE(JSON.stringify(daa, null, 2));
			});
		}

		Utils.TRACE("Push up new redirect");

		return new Promise((resolve, reject) => {
			Ftp.put(new Buffer(data), config.ftp.path,
					hadErr => {
						Utils.TRACE("Upload finished");
						Ftp.raw.quit();
						if (hadErr)
							reject(hadErr);
						else
							resolve();
					});
		});
	}

	function httpGET(url, nofollow) {
		Utils.TRACE("GET ", url);
		let result = "";
		let getter;
		if (nofollow)
			getter = require("http");
		else if (/^https/.test(url))
			getter = require("follow-redirects").https;
		else
			getter = require("follow-redirects").http;
		return new Promise((resolve, reject) => {
			getter.get(
				url,
				res => {
					if (res.statusCode < 200 || res.statusCode > 299) {
						reject(new Error("Failed to load URL, status: " +
										 res.statusCode));
						return;
					}

					res.on("data", chunk => {
						result += chunk;
					});
					res.on("end", () => {
						resolve(result);
					});
				})
			.on("error", err => {
				reject(err);
			});
		});
	}

	/**
	 * Upload a changed HTML.
	 * @ignore
	 */
	function finish(ip) {
		let url = new Url(config.target);
		url.ipaddr = ip;

		if (url.equals(current)) {
			console.log("Existing ", current, " is correct");
			if (!config.force) {
				console.log("No update required");
				return;
			}
		} else
			console.log("Old target ", current);

		current.ipaddr = ip;
		current.port = config.target.port;
		current.protocol = config.target.protocol;
		current.path = config.target.path;
		console.log("New target ", current);

		Fs.readFile(Utils.expandEnvVars(config.template))
		.then(buf => {
			let html = buf.toString();
			for (let k in current) {
				if (typeof current[k] !== "undefined")
					html = html.replace(new RegExp("#" + k, "g"), current[k]);
			}
			html = html.replace(new RegExp("#url", "g"), current.toString());
			return update(html);
		})
		.catch(e => {
			Utils.TRACE("Update failed", e);
		});
	}

	/**
	 * Fetch and parse the current HTML, if it's available.
	 * @private
	 */
	function step1() {
		httpGET(config.http, true) // dodge redirects
		.then(data => {
			let s = data.toString();
			// The current information is encoded in a JSON block comment
			let m = /<!--GetIP((.|\n)*?)-->/g.exec(s);
			if (m && m[1]) {
				try {
					eval("current=new Url(" + m[1] + ")");
					Utils.TRACE("Existing redirect target ", current);
				} catch (e) {
					Utils.TRACE("Old redirect meta-information unparseable ", e);
				}
			} else {
				Utils.TRACE("Old redirect had no meta-information", s);
			}
			step2();
		})
		.catch(e => {
			Utils.TRACE("Old GET failed ", e);
			step2();
		});
	}

	/**
	 * Try gateway router, if there is one
	 * @private
	 */
	function step2() {
		if (!config.gateway_router) {
			step3();
			return;
		}
		let Telnet = require("telnet-client");
		let connection = new Telnet();
		connection
		.connect(config.gateway_router)
		.then(() => {
			return connection
			.exec('ip iplist')
			.then(resp => {
				connection.end();
				let m = config.gateway_router.extract.exec(resp);
				if (m)
					finish(m[1]);
				else {
					Utils.TRACE("Gateway router no IP address found");
					step3();
				}
			},
				  err => {
					  Utils.TRACE("Gateway router Telnet error", err);
					  step3();
				  });
		},
			  err => {
				  Utils.TRACE("Gateway router Telnet error:", err);
				  step3();
			  });
	}

	/**
	 * Try Netgear router, if there is one
	 * @private
	 */
	function step3(second) {
		if (!config.netgear_router) {
			step4();
			return;
		}

		function didnt_work(err) {
			Utils.TRACE("Netgear router failed: ", err);
			if (second)
				step4();
			else {
				Utils.TRACE("Trying Netgear router again");
				step3(true);
			}
		}

		httpGET(config.netgear_router.url)
		.then(data => {
			return new Promise((resolve, reject) => {
				data = data.replace(/\n/g, " ");
				let scan = /<td[^>]*>\s*IP Address\s*<\/td>\s*<td[^>]*>\s*(\d+\.\d+\.\d+\.\d+)\s*</g;
				let m;
				while ((m = scan.exec(data)) != null) {
					if (!/^192\.168/.test(m[1])) {
						console.log("Got ", m[1], " from Netgear Router");
						finish(m[1]);
						resolve();
						return;
					}
				}
				didnt_work(config.netgear_router.url + " had no IP address");
				reject();
			});
		}, didnt_work)
		.finally(() => {
			httpGET(config.netgear_router.logout_url)
			.catch(e => {
				if (!/status: 401/.test(e))
					Utils.TRACE("Problem logging out of netgear router ", e);
			});
		});
	}

	/**
	 * Try icanhazip.com
	 * @private
	 */
	function step4() {
		httpGET("http://icanhazip.com")
		.then(data => {
			finish(data.toString().trim());
		},
			  err => {
				  Utils.TRACE("icanhazip failed: ", err);
				  step5();
			  });
	}

	/**
	 * Try freegeoip.net
	 * @private
	 */
	function step5() {
		httpGET("http://freegeoip.net/json")
		.then(data => {
			finish(JSON.parse(data).ip);
		},
			  err => {
				  Utils.TARCE("Failed to fetch new IP address: " + err);
			  });
	}
});
