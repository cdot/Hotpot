/*eslint-env node, mocha */
const Q = require("q");
const Fs = require("fs");
const writeFile = Q.denodeify(Fs.writeFile);
const assert = require('chai').assert;

const DataModel = require('../DataModel');
const Utils = require('../Utils');

const mainfile = "/tmp/blah";
const subfile = "/tmp/blahblah";

var simpleModel = {
    pugh: { $type: "string", $doc: "hugh" },
    barney: { $type: "number", $min: 0, $max: 100 },
    cuthbert: {
        $doc: "mcgrew",
        dibble: { $type: "string", $doc: "grubb" },
        bob: { $type: "string", $doc: "builder", $optional: true }
    }
};

var simpleProto = {
    pugh: "hugh",
    barney: 99,
    cuthbert: {
        dibble: "grubb"
    }
};

var illegalProto1 = {
    pugh: "hugh",
    barney: 101,
    cuthbert: {
        dibble: "grubb"
    }
};

var illegalProto2 = {
    pugh: "hugh",
    barney: 7,
    cuthbert: {
        // dibble is missing
    }
};

var complexModel = {
    fnaar: { $type: DataModel.TextOrFile, $doc: "fnarr" },
    phoar: { $type: DataModel.TextOrFile, $doc: "cor" },
};

var complexProto = {
    fnaar: mainfile,
    phoar: "flab a dab\nsnooty\nwhoops a daisy\nclump\nratfink"
};

var complexSerial = {
    windy: "miller"
};

var complexSerialUpdated = {
    windy: "pops"
};

var helpModel = {
    simple: simpleModel,
    complex: complexModel
};

var helpModelString = [
    "{",
    " simple: {",
    "  pugh: {string} hugh",
    "  barney: {number}",
    "  cuthbert: mcgrew {",
    "   dibble: {string} grubb",
    "   bob: (optional) {string} builder",
    "  }",
    " }",
    " complex: {",
    "  fnaar: {TextOrFile} fnarr",
    "  phoar: {TextOrFile} cor",
    " }",
    "}" ].join("\n");

var simpleArrayModel = {
    array: { $array_of: "string" }
};

var simpleArrayProto = {
    array: [ "a", "b", "c" ]
};

describe('DataModel', function() {

    it("Should simple-serialise", function() {
        return DataModel.getSerialisable(simpleProto, simpleModel)
            .then(function(s) {
                assert.deepEqual(s, simpleProto);
            });
    });

    it("Should illegal1-serialise", function() {
        try {
            DataModel.remodel('', illegalProto1, simpleModel);
        } catch(s) {
            assert.equal(s, "Bad data: .barney max 100 for barney but got 101");
            return;
        }
        assert(false, "Failed");
    });

    it("Should illegal2-serialise", function() {
        try {
            DataModel.remodel("", illegalProto2, simpleModel)
        } catch(s) {
            assert.equal(
                s, "Bad data: .cuthbert.dibble not optional and no default");
            return;
        }
        assert(false, "Failed");
    });

    it("Should simple save-load", function() {
        return DataModel.saveData(simpleProto, simpleModel, mainfile)
            .then(function() {
                return DataModel.loadData(mainfile, simpleModel);
            })
            .then(function(config) {
                assert.equal(config.pugh, "hugh");
                assert.equal(config.barney, 99);
                assert.equal(config.cuthbert.dibble, "grubb");
                return Q(config);
            });
    });

    it("Should complex-serialise", function() {
        
        var data = DataModel.remodel("", complexProto, complexModel);
        return DataModel.getSerialisable(data, complexModel)
            .then(function(s) {
                assert.deepEqual(s, complexProto);
            });
    });

    it("Should array-serialise", function() {
        
        var data = DataModel.remodel("", simpleArrayProto, simpleArrayModel);
        return DataModel.getSerialisable(data, simpleArrayModel)
            .then(function(s) {
                assert.deepEqual(s, simpleArrayProto);
            });
    });

    it("Should help", function() {
        assert.equal(DataModel.help(helpModel), helpModelString);
    })
});

