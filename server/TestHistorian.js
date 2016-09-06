var Historian = require("./Historian");
const Utils = require("../common/Utils.js");
const Q = require("q");

Utils.setTRACE("all");
Q.longStackSupport = true;

// Unordered test
var h = new Historian({
    name: "test",
    unordered: true,
    file: "historian.log"
});

var p = Q();

function do_record(i, j) {
    p = p.then(function() {
        return h.record(i, j);
    });
}

for (var i = 0; i < 10; i++)
    do_record(i, i);

for (var i = 1; i < 5; i++)
    do_record(-i, i * 2);

p.then(function() {
    h.getSerialisableHistory()
    .then(function(report) {
        console.log("Baseline ", report[0]);
        for (var i = 1; i < report.length; i+= 2)
            console.log(report[i], report[i + 1]);
    })
    .catch(function(e) {
        console.error(e);
    });
}).done();
