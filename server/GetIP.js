/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Stand-alone program to:
 * * Get the current public IP address of this host
 * * Compare it with the IP address stored in a web-accessible file
 * * Update that file if the address is different
 * @module GetIP
 */

/*
{
    debug: true,
    netgear_router: {
        url: "http://admin:password@192.168.1.1/RST_status.htm",
        logout_url: "http://192.168.1.1/LGO_logout.htm"
    },
    ftp: {
        debugEnable: true,
        host: "ftp.isp.net",
        user: "example",
        pass: "password",
        path: "/htdocs/hotpot.html"
    },
    http: {
        host: "example.co.uk",
        port: "80",
        path: "/hotpot.html"
    },
    target: {
        protocol: "https",
        port: 13196,
        path: ""
    }
}
*/

const Q = require("q");
const JSFtp = require("jsftp");
const Fs = require("fs");
const Utils = require("../common/Utils");

var config;
eval("config=" + Fs.readFileSync("./getip.config"));

const TEMPLATE = '<!DOCTYPE html\n' +
  'PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"\n' +
  '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n' +
  '<html xmlns="http://www.w3.org/1999/xhtml" lang="en-US" xml:lang="en-US">\n' +
  '<head>\n' +
  '<title>Untitled Document</title>\n' +
  '<meta http-equiv="REFRESH" content="0; #protocol:#ipaddr#port/" />\n' +
  '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />\n' +
  '</head>\n' +
  '<body>\n' +
  'Redirecting\n' +
  '</body>';

// Update the IP address using FTP, if it has changed
function update(data) {
    "use strict";

    var Ftp = new JSFtp(config.ftp);

    if (config.ftp.debugEnable) {
        Ftp.on("jsftp_debug", function(eventType, daa) {
            Utils.TRACE("DEBUG: ", eventType);
            Utils.TRACE(JSON.stringify(daa, null, 2));
        });
    }

    Utils.TRACE("Push up new redirect");

    Ftp.put(new Buffer(data), config.ftp.path,
            function(hadErr) {
                Utils.TRACE("Upload finished");
                if (hadErr)
                    Utils.TRACE("Had an error" + hadErr);
                else
                    Utils.TRACE(config.ftp.path + " updated");
                Ftp.raw.quit();
            });
}    

function httpGET(url, nofollow) {
    "use strict";
    Utils.TRACE("Getting ", url);
    var result = "";
    var getter;
    if (nofollow)
        getter = require("http");
    else if (/^https/.test(url))
        getter = require("follow-redirects").https;
    else
        getter = require("follow-redirects").http;
    console.log("GET ", url);
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

var current = {};

/**
 * Determine if the address has changed and if it has, upload a changed
 * HTML.
 * @ignore
 */
function finish(ip) {
    if (current.ipaddr && ip === current.ipaddr
        && current.protocol && current.protocol === config.target.protocol
        && current.port && current.port === config.target.port) {
        console.log("Existing address is correct");
        return;
    }
    current.ipaddr = ip;
    current.port = config.target.port;
    current.protocol = config.target.protocol;

    console.log("Update " + ip);
    var html = TEMPLATE;
    for (var k in current) {
        if (typeof current[k] !== "undefined")
            html = html.replace(new RegExp("#" + k), current[k]);
    }
    update(html);
}

/**
 * Fetch the current HTML, if it's available.
 * @private
 */
function step1() {
    httpGET(config.http, true) // dodge redirects
    .then(function(data) {
        var m = /"REFRESH" content=\"0: ([^:]+):\/\/([0-9.]+|\[[0-9:]+\])(:[0-9]+)?"/.exec(data);
        if (m) {
            Utils.TRACE("Existing redirect target");
            current.protocol = m[1];
            current.ipaddr = m[2];
            if (m[3])
                current.port = m[3];
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

if (config.debug)
    Utils.setTRACE("all");

step1();
