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

// Update the IP address in the file, if it has changed
function updateAddress(addr) {
    "use strict";

    console.TRACE("Updating IP address");
    var Ftp = new JSFtp(config.ftp);

    if (config.ftp.debugEnable) {
        Ftp.on("jsftp_debug", function(eventType, data) {
            console.TRACE("DEBUG: ", eventType);
            console.TRACE(JSON.stringify(data, null, 2));
        });
    }

    console.TRACE("Push up new IP address " + addr);
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
            fail(err);
        });
    req.on("response", function(mess) {
        statusCode = mess.statusCode;
    });
}

if (config.debug)
    console.TRACE = console.log;
else
    console.TRACE = function() { "use strict"; };

function new_address(addr, url) {
    "use strict";
    console.TRACE("Current IP address " + addr);
    // Convert to JSON
    addr = "//" + url + "\nhotpot_ip=\"" + addr + "\";";

    if (addr !== existing_addr)
        updateAddress(addr);
}

// Get known address
/*httpGET(
  config.http,
  function(status, old_addr) {
  if (status === 200) {
  if (/^hotpot_ip="\d+(\.\d+)+"$/.test(old_addr)) {
  var hotpot_ip;
  eval(old_addr);
  console.TRACE("Recorded IP address " + hotpot_ip);
  httpGET(
  { host: hotpot_ip + ":" + config.target.port,
  path: config.target.path },
  function(status, data) {
  if (status === 200) {
  existing_addr = old_addr;
  } else {
  console.TRACE("Recorded IP address responded " + status);
  }
  });
  } else
  console.TRACE("Recorded IP address " + old_addr + " is corrupt");
  }
  });
*/
var chain1 = 
    {
        // Scrape from netgear router "Router status" page
	id: "Router",
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
        }
    };
var chain = [
chain1, chain1,
    {
        // Get from freegeoip
	id: "freegeoip",
        url: "http://freegeoip.net/json",
        ok: function(data) {
            "use strict";
            try {
                return JSON.parse(data).ip;
            } catch (e) {
                return null;
            }
        }
    },
    {
        // Get from smart_ip.net (defunct?)
	id: "smartip",
        url: "http://smart_ip.net/myip",
        ok: function(data) {
            "use strict";
            return data;
        }
    }
];

var new_addr;
function askChain(i, after) {
    "use strict";
    console.TRACE("ask " + chain[i].url);
    httpGET(chain[i].url,
            function(status, res, url) {
                if (status === 200) {
                    new_addr = chain[i].ok(res);
                    if (typeof new_addr !== "undefined") {
                        after(new_addr.trim(), chain[i].id);
                        return;
                    }
                    console.TRACE(chain[i].url + " bad data " + res);
                } else {
                    console.TRACE(chain[i].url + " bad status " + status);
                }
                askChain(i + 1, after);
            },
	    function(err) {
		console.TRACE("Error: " + err);
	    });
}

if (!existing_addr) {
    askChain(
        0,
        new_address);
}
