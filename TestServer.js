// Unit tests for Hottie HTTP server
// Need a fresh server running on 13196
const HTTP = require("http");
const assert = require("assert");

function extend(a, b) {
    var extended = {}, i;
    for (i in a)
        extended[i] = a[i];
    for (i in b)
        extended[i] = b[i];
    return extended;
};

var options = {
  hostname: 'daphne',
  port: 13196
};

function send(commands, on_reply) {
    var opt = options;

    if (commands !== null) {
        var postData = JSON.stringify(commands);
        opt = extend(
            opt,
            {
                method: postData === null ? "GET" : "POST",
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': postData.length
                }
            });
    }

    var res;
    var reply = "";
    var req = HTTP.request(opt, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            reply += chunk;
        });
        res.on('end', function() {
            if (commands === null)
                reply = JSON.parse(reply);
            else if (reply !== "")
                throw "Unexpected reply to POST " + reply;
            if (on_reply)
                on_reply(reply);
        })
    });

    req.on('error', function(e) {
        console.log("problem with request: " + e.message);
    });

    if (commands !== null)
        req.write(postData);
    req.end();
}

send(null, function(reply) {
    assert.equal(reply.CH.target, 16); // set by rules
    assert.equal(reply.CH.window, 5);
    assert(reply.CH.rules_enabled);
    assert.equal(reply.CH.rules.length, 3);
    assert.equal(reply.HW.target, 55); // set by rules
    assert.equal(reply.HW.window, 5);
    assert(reply.HW.rules_enabled);
    assert.equal(reply.HW.rules.length, 3);
});

send([ { command: "set_target", thermostat: "CH", number: 250 } ]);
send([ { command: "set_window", thermostat: "CH", number: 10 } ]);
send(null, function(reply) { assert.equal(reply.CH.target, 250);
                             assert.equal(reply.CH.window, 10) });
send([ { command: "insert_rule", thermostat: "HW", number: 0, name: "new", test: "function(){ console.log('Driven to fail'); }" } ]);
send([ { command: "enable_rules", thermostat: "HW" } ]);
send([ { command: "enable_rules", thermostat: "CH" } ]);
send(null, function(reply) { assert(reply.HW.rules_enabled && reply.CH.rules_enabled, reply); });
send([ { command: "disable_rules", thermostat: "HW" } ]);
send(null, function(reply) { assert(!reply.HW.rules_enabled&&reply.CH.rules_enabled, reply); });
send([ { command: "disable_rules", thermostat: "HW" },
       { command: "disable_rules", thermostat: "CH" } ]);
send(null, function(reply) { assert(!reply.HW.rules_enabled && !reply.CH.rules_enabled, reply); });
send([ { command: "enable_rules", thermostat: "HW" },
       { command: "enable_rules", thermostat: "CH" } ]);
send(null, function(reply) { assert(reply.HW.rules_enabled && reply.CH.rules_enabled, reply); });

send([ { command: "remove_rule", thermostat: "HW", name: "new" },
       { command: "set_target", thermostat: "CH", number: 16 },
       { command: "set_window", thermostat: "CH", number: 5 } ]);
send(null, function(reply) {
    assert.equal(reply.CH.target, 16); // set by rules
    assert.equal(reply.CH.window, 5);
    assert(reply.CH.rules_enabled);
    assert.equal(reply.CH.rules.length, 3);
    assert.equal(reply.HW.target, 55); // set by rules
    assert.equal(reply.HW.window, 5);
    assert(reply.HW.rules_enabled);
    assert.equal(reply.HW.rules.length, 3);
});

