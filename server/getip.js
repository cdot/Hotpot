/**
 * Stand-alone program to:
 * Scrape the current public IP address of our Netgear router (DHCP allocated)
 * Compare it with the IP address stored in a web-accessible file
 * Update that file if the address is different
 */

//Config format
//{
//    debug: false, // or true
//    // Assumes router has a page (in this case, RST_status.htm) that
//    // shows the current IP address in a table that we can scrape it
//    // from.
//    router: {
//        host: "192.168.1.1", // usually
//        port: 80,
//        path: "/RST_status.htm",
//        headers: {
//            authorization: "Basic "
//                + new Buffer("admin:password").toString("base64")
//        }
//    },
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

var http = require("http");
var JSFtp = require("jsftp");
const Fs = require("fs");

// Regex used to scrape the report from the router
const search_re = /IP Address.*?(\d+\.\d+\.\d+\.\d+)/g;

var config;
eval("config=" + Fs.readFileSync("./getip.config"));

// Update the IP address in the file, if it has changed
function update_address(new_addr) {
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
                    console.TRACE("hotpot.ip updated");
                Ftp.raw.quit();
            });
}    

// Get the content of the existing IP address file from the webspace
// callback(ip_addr, err) err is non-null if there's a problem
function get_existing_address(callback) {
    "use strict";
    var addr = "";
    http.get(config.http,
             function(res) {
                 res.on("data", function(chunk) {
                     addr += chunk;
                 });
                 res.on("end", function() {
                     callback(addr);
                 });
             })
        .on("error", function(err) {
            callback(null, err);
        });
}

// Scrape the IP address from the router report
// callback(ip_addr, err) err is non-null if there's a problem
function scrape_ip_address(output, callback) {
    "use strict";
    output = output.replace(/\s+/g, " ");
    console.TRACE("Scraping IP address")
    var match = search_re.exec(output);
    if (match) {
        callback(match[1]);
    } else {
        callback(null, "Router output strange: No match for "
                 + search_re + " in " + output);
    }
}

// Get the current IP address from the router, and call callback with it.
// callback(ip_addr, err) err is non-null if there's a problem
function get_ip_from_router(callback) {
    "use strict";
    console.TRACE("Getting IP address from router");
    http.get(
        config.router,
        function(res) {
            var output = "";
            res.on("data", function(chunk) {
                output += chunk;
            });

            res.on("end", function() {
                //console.TRACE("Response received from router " + output);
                if (/Authorization failed/.exec(output) !== null)
                    console.TRACE(
                        "Cannot talk to router: Authorisation failed");
                else if (/is managing this device/.exec(output) !== null)
                    console.TRACE(
                        "Cannot talk to router: Another manager is logged in");
                else
                    scrape_ip_address(output, callback);
            });
        })

        .on("error", function(err) {
            console.TRACE("Cannot talk to router: " + err);
        });
}

if (config.debug)
    console.TRACE = console.log;
else
    console.TRACE = function() {};

get_ip_from_router(
    function(new_addr, scraperr) {
        if (scraperr)
            console.TRACE("Cannot scrape router output: " + err);
        else
            console.TRACE("Router IP address " + new_addr);
            get_existing_address(function(old_addr, geterr) {
                console.TRACE("Existing IP address " + old_addr);
                if (geterr)
                    console.TRACE(
                        "Cannot get existing address: " + geterr);
                // force update
                // old_addr="ignored";
                if (old_addr !== new_addr)
                    update_address(new_addr);
                else
                    console.TRACE("No need to update");
            });
    });
