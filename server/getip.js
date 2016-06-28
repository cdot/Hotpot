/**
 * Stand-alone program to:
 * Get the current public IP address of this host
 * Compare it with the IP address stored in a web-accessible file
 * Update that file if the address is different
 */

//Config format
//{
//    debug: false, // or true
//    // Webspace where the IP file is stored
//    http: {
//        host: "host where ftp uploads are seen",
//        port: "80",
//        path: "/path to the same file as in the ftp uploads"
//    }
//    // Details of FTP server used to manage the webspace
//    ftp: {
//        host: "ftp.host to use for uploading",
//        user: "ftp.user",
//        pass: "ftp.pass"
//        path: "path to file to create on ftp server"
//    }
//}

const http = require("follow-redirects").http;
const https = require("follow-redirects").https;
const JSFtp = require("jsftp");
const Fs = require("fs");

var config;
eval("config=" + Fs.readFileSync("./getip.config"));

var existing_addr;

// Update the IP address using FTP, if it has changed
function updateAddress(addr) {
    "use strict";

    var Ftp = new JSFtp(config.ftp);

    if (config.ftp.debugEnable) {
        Ftp.on("jsftp_debug", function(eventType, data) {
            console.TRACE("DEBUG: ", eventType);
            console.TRACE(JSON.stringify(data, null, 2));
        });
    }

    console.TRACE("Push up new IP address " + addr);
Ftp.raw.quit();return;
    Ftp.put(new Buffer(addr), config.ftp.path,
            function(hadErr) {
                if (hadErr)
                    console.TRACE("Had an error" + hadErr);
                else
                    console.TRACE(config.ftp.path + " updated");
                Ftp.raw.quit();
            });
}    

function httpGET(url, ok, fail) {
    "use strict";

    var result = "";
    var statusCode = 0;
    var getter = (/^https/.test(url) ? https : http);
    var req = getter.get(
        url,
        function(res) {
            res.on("data", function(chunk) {
                result += chunk;
            });
            res.on("end", function() {
                ok(statusCode, result, url);
            });
        })
        .on("error", function(err) {
            if (fail)
		fail(err);
	    else
		console.TRACE("GET " + url + "failed: " + err);
        });
    req.on("response", function(mess) {
        statusCode = mess.statusCode;
    });
}

if (config.debug)
    console.TRACE = console.log;
else {
    console.TRACE = function() { "use strict"; };
}

function newAddress(addr, old_addr, id) {
    "use strict";
    console.TRACE("Determined current IP address to be " + addr);
    if (addr !== existing_addr) {
	// Convert to JSON
	addr = "hotpot_ip=\"" + addr + "\"; /*" + id + "*/";
	updateAddress(addr);
    }
}

var chain = [];

function nextInChain(after, old_addr) {
    "use strict";
    if (chain.length === 0)
	return;
    if (typeof chain[0].repeats === "undefined")
	chain[0].repeats = 0;
    else if (chain[0].repeats === 0)
	chain.shift();
    else
	chain[0].repeats--;
    chain[0].fn.call(chain[0], after, old_addr);
}

function chainGET(after, old_addr) {
    var self = this;
    console.TRACE("ask " + self.url);
    httpGET(self.url,
	    function(status, res, url) {
                if (status === 200) {
		    var new_addr = self.ok(res);
		    if (typeof new_addr !== "undefined") {
                        after(new_addr.trim(), old_addr, self.id);
                        return;
		    }
		    console.TRACE(self.url + " bad data " + res);
                } else {
		    console.TRACE(self.url + " bad status " + status);
                }
		nextInChain(after, old_addr);
	    },
	    function(err) {
		console.TRACE("Error: " + err);
	    });
}

function chainTelnet(after, old_addr) {
    var self = this;
    var tn = self.telnet;
    var Telnet = require("telnet-client");

    var connection = new Telnet();
    connection
	.connect(tn)
	.then(
	    function(prompt) {
		connection
		    .exec('ip iplist')
		    .then(
			function(resp) {
			    //console.TRACE(resp);
			    var m = tn.extract.exec(resp);
			    console.TRACE(self.id + " says IP address is "
					  + m[1]);
			    after(m[1], old_addr, self.id);
			    connection.end();
			},
			function(err) {
			    console.TRACE("Telnet error " + err);
			    nextInChain(after, old_addr);
			})
	    },
	    function (err) {
		console.TRACE("Telnet error " + err);
		nextInChain(after, old_addr);
	    });
    connection.on("error", function(e) {
	console.TRACE("Telnet " + e);
	nextInChain(after, old_addr);
    });
}

if (config.gateway_router) {
    chain.push({
	id: "Gateway Router",
	fn: chainTelnet,
	telnet: config.gateway_router
    });
}

if (config.netgear_router) {
    chain.push({
	// Scrape from netgear router "Router status" page
	id: "Netgear Router",
	fn: chainGET,
        url: config.netgear_router,
        ok: function(data) {
	    "use strict";
	    var l = data.split(/\n/);
	    var il;
	    for (var i = 0; i < l.length; i++) {
                if (/IP Address/.test(l[i])) {
		    i++;
		    il = l[i].replace(/^.*?>([\d.]+).*/, "$1");
		    return il;
                }
	    }
	    return null;
        },
	repeats: 2
    });
}

chain.push(
    {
        // Get from freegeoip
	id: "icanhazip",
	fn: chainGET,
        url: "http://icanhazip.com",
        ok: function(data) {
            "use strict";
            try {
                return ("" + data).trim();
            } catch (e) {
                return null;
            }
        }
    });

chain.push(
    {
        // Get from freegeoip
	id: "freegeoip",
	fn: chainGET,
        url: "http://freegeoip.net/json",
        ok: function(data) {
            "use strict";
            try {
                return JSON.parse(data).ip;
            } catch (e) {
                return null;
            }
        }
    });

chain.push(
    {
        // Get from smart_ip.net (defunct?)
	id: "smartip",
	fn: chainGET,
        url: "http://smart_ip.net/myip",
        ok: function(data) {
            "use strict";
            return data;
        }
    });

function refreshAddr(old_address) {
    nextInChain(newAddress, old_address);
}

// Get known address
httpGET(
    config.http,
    function(status, old_addr) {
	if (status === 200) {
	    var hotpot_ip;
	    try {
		eval(old_addr);
		console.TRACE("IP address from web " + hotpot_ip);
/*		httpGET(
		    "http://" + hotpot_ip + ":" + config.target.port +
		      config.target.path,
		    function(status, data) {
			if (status === 200) {
			    console.TRACE("Validated recorded IP address");
			} else {
			    console.TRACE("Recorded IP address responded "
					  + status);
			    refreshAddr(old_addr);
			}
		    });
*/
		refreshAddr(old_addr); // test
	    } catch (e) {
		console.TRACE("Recorded IP address " + old_addr
			      + " is corrupt: " + e);
		refreshAddr(old_addr);
	    }
	}
    });
