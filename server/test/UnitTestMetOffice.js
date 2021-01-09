/*eslint-env node, mocha */

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["test/TestRunner", "common/js/Utils", "common/js/Time", "server/js/MetOffice"], function(TestRunner, Utils, Time, MetOffice) {

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

    let tr = new TestRunner("MetOffice");
    let assert = tr.assert;
    
    tr.addTest('Works', function() {
        let mo = new MetOffice(config);
        return mo.setLocation(config.location).then(function() {
            return mo.getSerialisableState()
            .then(function(d) {
                assert(typeof d.temperature === "number");
                return mo.getSerialisableLog()
                .then(function(result) {
                    let base = result[0];
                    assert(typeof base === "number");
                    let last = 0;
                    for (let i = 1; i < result.length; i += 2) {
                        assert(result[i] >= last);
                        assert(result[i] <= Time.now());
                        last = result[i];
                        assert(result[i + 1] > -10);
                        assert(result[i + 1] < 50);
                    }
                    /// Force an update to make sure it happens
                    let u1 = mo.last_update;
                    return mo.update()
                    .then(function() {
                        assert(mo.last_update > u1, "No fresh data");
                        mo.stop();
                    });
                });
            });
        });
    });

    tr.run();
});
