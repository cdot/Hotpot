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

const http = require("http");
const https = require("https");
const JSFtp = require("jsftp");
const Fs = require("fs");

var config;
eval("config=" + Fs.readFileSync("./getip.config"));

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
                    console.TRACE("hotpot.ip updated");
                Ftp.raw.quit();
            });
}    

function httpGET(url, callback) {
    "use strict";
    var result = "";
    http.get(url,
        function(res) {
            res.on("data", function(chunk) {
                result += chunk;
            });
            res.on("end", function() {
                callback(result.trim());
            });
        })
        .on("error", function(err) {
            console.error("Failed to GET from " + url.host + ": " + err);
        });

}

if (config.debug)
    console.TRACE = console.log;
else
    console.TRACE = function() { "use strict"; };

// Get IP address http://smart-ip.net/myip
httpGET(
    {
        host: "smart-ip.net",
        path: "/myip"
    },
    function(new_addr) {
        "use strict";
        
        console.TRACE("Current IP address " + new_addr);
	// Convert to JSON
	new_addr = "hotpot_ip=\"" + new_addr + "\"";

        // Get known address
        httpGET(
            config.http,
            function(old_addr) {
                console.TRACE("Existing IP address " + old_addr);
                // force update
                // old_addr="ignored";
                if (old_addr !== new_addr)
                    updateAddress(new_addr);
                else
                    console.TRACE("No need to update");
            });
    });
