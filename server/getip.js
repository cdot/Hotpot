// Determine the current internet IP address from a netgear router, then upload it to
// http://c-dot.co.uk/hotpot.ip

/**
Config format
{
    router: {
	host: "192.168.1.1", // usually
	port: 80,
	path: "/RST_status.htm",
	headers: {
	    authorization: "Basic " + new Buffer("admin:password").toString("base64")
	}
    },
    ftp: {
        host: "ftp.host to use for uploading",
        user: "ftp.user",
        pass: "ftp.pass"
        path: "path to file to create on ftp server"
    },
    http: {
	host: "host where ftp uploads are seen",
	port: "80",
	path: "/path to the same file as in the ftp uploads"
    }
}
*/

var http = require("http");
var JSFtp = require("jsftp");
const Fs = require("fs");
 
const username = "admin";
const password = "t055P0t";
const search_re = /<td.*?>IP Address.*?<td.*?>([0-9.]+)</g;

var config;
eval("config=" + Fs.readFileSync("./getip.config"));

function update_address(old_addr, new_addr) {
    if (old_addr == new_addr) {
	console.log("IP address unchanged");
	return;
    }

    console.log("Updating IP address");
    var Ftp = new JSFtp(config.ftp);

    Ftp.on('jsftp_debug', function(eventType, data) {
	console.log('DEBUG: ', eventType);
	console.log(JSON.stringify(data, null, 2));
    });

    console.log("Push up new IP address " + new_addr);
    Ftp.put(new Buffer(new_addr), config.ftp.path,
	function(hadErr) {
	    if (hadErr)
		console.error("Had an error" + hadErr);
	    else
		console.log("hotpot.ip updated");
	});
}

// Get the current IP address from hotpot.ip
function check_existing_address(new_addr) {
    var old_addr = "";
    console.log("Getting old IP address from website");
    http.get(config.http,
	function(res) {
            res.on("data", function(chunk) {
		old_addr += chunk;
            });
	    res.on("end", function() {
		update_address(old_addr, new_addr);
	    });
    })
    .on("error", function(err) {
	console.log("Cannot get existing address: " + err);
	update_address("unknown", new_addr);
    });
}

function publish_ip_address(output) {
    output = output.replace(/\s+/g, " ");
    var match = search_re.exec(output);
    if (match)
	check_existing_address(match[1]);
    else
	console.error("Router output strange: No match for " + search_re + " in " + output);
}

function get_ip_from_router() {
console.log("Getting IP address from router");
http.get(
    config.router,
    function(res) {
	var output = "";
        res.on("data", function(chunk) {
	    output += chunk;
        });

	res.on("end", function() {
	    if (/"is managing this device"/.exec(output) !== null)
		console.error("Cannot talk to router: Another manager is logged in");
	    else
	     publish_ip_address(output);
	});
     })

.on("error", function(err) {
    console.log("Cannot talk to router: " + err);
});
}

get_ip_from_router();

