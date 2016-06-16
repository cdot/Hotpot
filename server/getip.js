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
function updateAddress(new_addr) {
    "use strict";

    console.TRACE("Updating IP address");
    var Ftp = new JSFtp(config.ftp);

    if (config.ftp.debugEnable) {
        Ftp.on("jsftp_debug", function(eventType, data) {
            console.TRACE("DEBUG: ", eventType);
            console.TRACE(JSON.stringify(data, null, 2));
        });
    }

    console.TRACE("Push up new IP address " + new_addr);
    Ftp.put(new Buffer(new_addr), config.ftp.path,
            function(hadErr) {
                if (hadErr)
                    console.TRACE("Had an error" + hadErr);
                else
                    console.TRACE(config.ftp.path + " updated");
                Ftp.raw.quit();
            });
}    

function dump(data) {
    var cache = [];
    return JSON.stringify(data, function(key, value) {
        if (typeof value === 'object' && value !== null) {
            if (cache.indexOf(value) !== -1) {
                // Circular reference found, discard key
                return;
            }
            // Store value in our collection
            cache.push(value);
        }
        return value;
    }, 2);
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
                ok(statusCode, result);
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

function new_address(new_addr) {
    console.TRACE("Current IP address " + new_addr);
    // Convert to JSON
    new_addr = "hotpot_ip=\"" + new_addr + "\"";

    if (new_addr !== existing_addr)
        updateAddress(new_addr);
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
var chain = [
    {
        // Scrape from netgear router "Router status" page
        url: config.netgear_router,
        ok: function(data) {
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
    },
    {
        // Get from freegeoip
        url: "http://freegeoip.net/json",
        ok: function(data) {
            try {
                return JSON.parse(data).ip;
            } catch (e) {
                return null;
            }
        }
    },
    {
        // Get from smart_ip.net (defunct?)
        url: "http://smart_ip.net/myip",
        ok: function(data) {
            return data;
        }
    }
];

var new_addr;
function askChain(i, after) {
    console.TRACE("ask " + chain[i].url);
    httpGET(chain[i].url,
            function(status, res) {
                if (status == 200) {
                    new_addr = chain[i].ok(res);
                    if (typeof new_addr !== "undefined") {
                        after(new_addr.trim());
                        return;
                    }
                    console.TRACE(chain[i].url + " bad data " + data);
                } else {
                    console.TRACE(chain[i].url + " bad status " + status);
                }
                askChain(i + 1, after);
            });
}

if (!existing_addr) {
    var new_addr;

    askChain(
        0,
        new_address);
}
