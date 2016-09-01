/**
 * Simple test program to create an HTTP server
 * on 13198
 */
const Utils = require("../common/Utils.js");
const Server = require("./Server.js");

Utils.setTRACE("all");

var server = new Server({
    port: 13198,
    docroot: "$HOME",
    auth: {
        user: "test",
        pass: "x",
        realm: "Test Server"
    }
},
function(path, params) {
    Utils.TRACE("Dispatch ", path, " with ", params);
});

server.start();


