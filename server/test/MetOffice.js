/*eslint-env node, mocha */

const getopt = require("node-getopt");
const Q = require("q");
var assert = require('chai').assert;
const Utils = require("../../common/Utils");
const Time = require("../../common/Time");
const MetOffice = require("../MetOffice");

//Utils.setTRACE("all");
Q.longStackSupport = true;

var config = {
    api_key: "f6268ca5-e67f-4666-8fd2-59f219c5f66d",
    history: {
        file: "/tmp/metoffice.log"
    },
    location: {
      latitude: 53.2479442,
      longitude: -2.5043655
    }
};

describe('server/MetOffice', function() {
    it('Works', function() {
        var mo = new MetOffice(config);
        return mo.setLocation(config.location).then(function() {
            return mo.getSerialisableState()
            .then(function(d) {
                assert(typeof d.temperature === "number");
                return mo.getSerialisableLog()
                .then(function(result) {
                    var base = result[0];
                    assert(typeof base === "number");
                    var last = 0;
                    for (var i = 1; i < result.length; i += 2) {
                        assert(result[i] >= last);
                        assert(result[i] <= Time.now());
                        last = result[i];
                        assert(result[i + 1] > -10);
                        assert(result[i + 1] < 50);
                    }
                    /// Force an update to make sure it happens
                    var u1 = mo.last_update;
                    return mo.update()
                    .then(function() {
                        assert(mo.last_update > u1, "No fresh data");
                        mo.stop();
                    });
                });
            });
        });
    });
});
