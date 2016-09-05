/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * @module GetIP
 * See README.md for information.
 */
const getopt = require("node-getopt");
const Q = require("q");
const JSFtp = require("jsftp");
const Fs = require("fs");
const readFile = Q.denodeify(Fs.readFile);

const Utils = require("../common/Utils");
const Config = require("../common/Config.js");

var cliopt = getopt.create([
    [ "h", "help", "Show this help" ],
    [ "", "debug", "Run in debug mode" ],
    [ "", "force", "Force an update, even if the target hasn't changed" ],
    [ "c", "config=ARG", "Configuration file (default ./GetIP.cfg)" ]
])
    .bindHelp()
    .parseSystem()
    .options;

if (typeof cliopt.config === "undefined")
    cliopt.config = "./GetIP.cfg";

if (cliopt.debug)
    Utils.setTRACE("all");

var config;

Config.load(cliopt.config)
.done(function(cfg) {
    config = cfg;
    step1();
});

/**
 * Return a promise to update the IP address using FTP, if it has changed
 * (or config.force is on)
 */
function update(data) {
    "use strict";

    var Ftp = new JSFtp(config.ftp);

    if (config.ftp.debugEnable) {
        Ftp.on("jsftp_debug", function(eventType, daa) {
            Utils.TRACE("FTP DEBUG: ", eventType);
            Utils.TRACE(JSON.stringify(daa, null, 2));
        });
    }

    Utils.TRACE("Push up new redirect");

    return Q.Promise(function(resolve, reject) {
        Ftp.put(new Buffer(data), config.ftp.path,
                function(hadErr) {
                    Utils.TRACE("Upload finished");
                    Ftp.raw.quit();
                    if (hadErr)
                        reject(hadErr);
                    else
                        resolve();
                })
    });
}    

function httpGET(url, nofollow) {
    "use strict";
    Utils.TRACE("GET ", url);
    var result = "";
    var getter;
    if (nofollow)
        getter = require("http");
    else if (/^https/.test(url))
        getter = require("follow-redirects").https;
    else
        getter = require("follow-redirects").http;
    return Q.Promise(function(resolve, reject) {
        getter.get(
            url,
            function(res) {
                if (res.statusCode < 200 || res.statusCode > 299) {
                    reject(new Error("Failed to load URL, status: "
                                     + res.statusCode));
                    return;
                }

                res.on("data", function(chunk) {
                    result += chunk;
                });
                res.on("end", function() {
                    resolve(result);
                });
            })
            .on("error", function(err) {
                reject(err);
            });
    });
}

// Known details, taken from the target
var current = {};

/**
 * Upload a changed HTML.
 * @ignore
 */
function finish(ip) {
    if (current.ipaddr && ip === current.ipaddr
        && current.protocol && current.protocol === config.target.protocol
        && current.path && current.path === config.target.path
        && current.port && current.port === config.target.port) {
        console.log("Existing address is correct");
        if (!config.force) {
            console.log("No update required");
            return;
        }
    }

    current.ipaddr = ip;
    current.port = config.target.port;
    current.protocol = config.target.protocol;
    current.path = config.target.path;

    readFile(Utils.expandEnvVars(config.template))
    .then(function(buf) {
        var html = buf.toString();
        console.log("Update " + ip);
        for (var k in current) {
            if (typeof current[k] !== "undefined")
                html = html.replace(new RegExp("#" + k, "g"), current[k]);
        }
        return update(html);
    })
    .catch(function (e) {
        Utils.ERROR("Update failed", e);
    });
}

/**
 * Fetch and parse the current HTML, if it's available.
 * @private
 */
function step1() {
    httpGET(config.http, true) // dodge redirects
    .then(function(data) {
        var s = data.toString();
        // The current information is encoded in a JSON block comment
        var m = /<!--GetIP((.|\n)*?)-->/g.exec(s);
        if (m && m[1]) {
            try {
                eval("current=" + m[1]);
                Utils.TRACE("Existing redirect target ", current);
            } catch (e) {
                Utils.TRACE("Old redirect meta-information unparseable ", e);
            }
        } else {
            Utils.TRACE("Old redirect had no meta-information", s);
        }
        step2();
    })
    .catch(function(e) {
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
    var Telnet = require("telnet-client");
    var connection = new Telnet();
    connection
    .connect(config.gateway_router)
    .then(function() {
        return connection
        .exec('ip iplist')
        .then(function(resp) {
            connection.end();
            var m = config.gateway_router.extract.exec(resp);
            if (m)
                finish(m[1]);
            else {
                Utils.TRACE("Gateway router no IP address found");
                step3();
            }
        },
        function(err) {
            Utils.TRACE("Gateway router Telnet error", err);
            step3();
        });
    },
    function (err) {
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
    .then(function(data) {
        return Q.Promise(function(resolve, reject) {
            var l = data.split(/\n/);
            var il;
            for (var i = 0; i < l.length; i++) {
                if (/IP Address/.test(l[i])) {
                    i++;
                    il = l[i].replace(/^.*?>([\d.]+).*/, "$1");
                    resolve(il);
                    return;
                }
            }
            didnt_work(config.netgear_router.url + " had no IP address");
            reject();
        });
    }, didnt_work)        
    .finally(function() {
        httpGET(config.netgear_router.logout_url);       
    });
}

/**
 * Try icanhazip.com
 * @private
 */
function step4() {
    httpGET("http://icanhazip.com")
    .then(function(data) {
        finish(data.toString().trim());
    },
    function(err) {
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
    .then(function(data) {
        finish(JSON.parse(data).ip);
    },
    function(err) {
        Utils.ERROR("Failed to fetch new IP address: " + err);
    });
}

