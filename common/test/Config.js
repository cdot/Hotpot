/*eslint-env node, mocha */
const Q = require("q");
const Fs = require("fs");
const writeFile = Q.denodeify(Fs.writeFile);
const assert = require('chai').assert;

const Config = require('../Config');

const mainfile = "/tmp/blah";
const subfile = "/tmp/blahblah";

var simpleConfig = {
    pugh: "pugh",
    barney: "mcgrew",
    cuthbert: {
        dibble: "grubb"
    }
};

var complexConfig = {
    windy_file: subfile
};

var complexSerial = {
    windy: "miller"
};

var complexSerialUpdated = {
    windy: "pops"
};

describe('Config', function() {
    it("Should simple save-load", function() {
        return Config.save(simpleConfig, mainfile)
        .then(function() {
            return Config.load(mainfile);
        })
        .then(function(config) {
            assert.equal(config.pugh, "pugh");
            assert.equal(config.barney, "mcgrew");
            assert.equal(config.cuthbert.dibble, "grubb");
            return Q(config);
        });
    });

    it("Should simple-serialise", function() {
        return Config.save(simpleConfig, mainfile)
        .then(function() {
            return Config.load(mainfile);
        })
        .then(function(config) {
            return Config.getSerialisable(config)
            .then(function(s) {
                assert.deepEqual(s, simpleConfig);
            });
        });
    });

    it("Should complex save-load", function() {
        return writeFile(subfile, complexSerial.windy)
        .then(function() {
            return Config.save(complexConfig, mainfile);
        })
        .then(function() {
            return Config.load(mainfile);
        })
        .then(function(config) {
            return Config.fileableConfig(config, "windy");
        })
        .then(function(config) {
            assert.equal(config, complexSerial.windy);
            return Q(config);
        });
    });

    it("Should complex serialise", function() {
        return writeFile(
            subfile,
            complexSerial.windy)
        .then(function() {
            return Config.save(complexConfig, mainfile);
        })
        .then(function() {
            return Config.load(mainfile);
        })
        .then(function(config) {
            return Config.getSerialisable(config)
            .then(function(s) {
                assert.deepEqual(s, complexSerial);
            });
        });
    });

    it("Should update complex serialise", function() {
        return writeFile(
            subfile,
            complexSerial.windy)
        .then(function() {
            return Config.save(complexConfig, mainfile);
        })
        .then(function() {
            return Config.load(mainfile);
        })
        .then(function(config) {
            return Config.updateFileableConfig(
                config, "windy", complexSerialUpdated.windy);
        })
        .then(function() {
            return Config.getSerialisable(complexConfig)
            .then(function(s) {
                assert.deepEqual(s, complexSerialUpdated);
            });
        });
    });
});

