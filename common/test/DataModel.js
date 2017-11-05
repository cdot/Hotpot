/*eslint-env node, mocha */
const Q = require("q");
const Fs = require("fs");
const writeFile = Q.denodeify(Fs.writeFile);
const assert = require('chai').assert;

const DataModel = require('../DataModel');
const Utils = require('../Utils');

const mainfile = "/tmp/blah";

// Test with built-in types
var simpleModel = {
    pugh: { $type: String, $doc: "hugh" },
    barney: { $type: Number },
    cuthbert: {
        $doc: "mcgrew",
        dibble: { $type: String, $doc: "grubb" },
        bob: { $type: String, $doc: "builder", $optional: true }
    },
    array: { $array_of: String }
};

var simpleProto = {
    pugh: "hugh",
    barney: 99,
    cuthbert: {
        dibble: "grubb"
    },
    array: [ "a", "b", "c" ]
};

var simpleProtoBad = {
    pugh: "hugh",
    barney: 7,
    cuthbert: {
        // dibble is missing
    } // array is missing
};

// A model containing builtIns objects
var builtInsModel = {
    fnaar: { $type: DataModel.File, $doc: "fnarr" },
    phoar: { $type: DataModel.TextOrFile, $doc: "cor", $optional: true }
};

var builtInsProto = {
    fnaar: "/",
    phoar: "flab a dab\nsnooty\nwhoops a daisy\nclump\nratfink"
};

var builtInsProtoBad = {
    // fnaar is missing
    phoar: builtInsProto.phoar
};

var builtInsDump = {
    fnaar: {
        data: builtInsProto.fnaar
    },
    phoar: {
        data: builtInsProto.phoar,
        is_file: false
    }
};

var helpModel = {
    simple: simpleModel,
    builtIns: builtInsModel
};

var helpModelString = [
    "{",
    " simple: {",
    "  pugh: <String> hugh",
    "  barney: <Number>",
    "  cuthbert: mcgrew {",
    "   dibble: <String> grubb",
    "   bob: (optional) <String> builder",
    "  }",
    "  array: [",
    "   <String>",
    "  ]",
    " }",
    " builtIns: {",
    "  fnaar: <File> fnarr",
    "  phoar: (optional) <TextOrFile> cor",
    " }",
    "}" ].join("\n");

function Toad(data, index, model) {
    this.update(data);
};

Toad.Model = {
    data: {
        x: { $type: Number },
        y: { $type: Boolean }
    }
};

Toad.prototype.getSerialisable = function(data, model) {
    return Q("Smeg");
};

Toad.prototype.update = function(data) {
    assert.equal(typeof data, "object");
    assert.equal(typeof data.data, "object");
    assert.equal(typeof data.data.x, "number");
    assert.equal(typeof data.data.y, "boolean");
    this.data = data.data;
};

Toad.prototype.croak = function(x, y) {
    assert.equal(x, this.data.x);
    assert.equal(y, this.data.y);
};

var toadyModel = {
    a: { $type: String },
    b: { $type: Toad }
};

var toadyProto = {
    a: "A",
    b: { data: { x: 1, y: true } }
};

var toadySerial = {
    a: "A",
    b: "Smeg"
}

describe('DataModel', function() {
    it("remodel-simple", function() {
        var remodeled = DataModel.remodel('', simpleProto, simpleModel);
        assert.equal(Utils.dump(remodeled), Utils.dump(simpleProto));
    });

    it("remodel-bad-simple", function() {
        try {
            DataModel.remodel('', simpleProtoBad, simpleModel);
        } catch(s) {
            assert.equal(s, "remodel: not optional and no default at cuthbert.dibble");
            return;
        }
        assert(false, "Failed");
    });

    it("remodel-builtIns", function() {
        var remodeled = DataModel.remodel("", builtInsProto, builtInsModel);
        //Utils.LOG(remodeled, builtInsDump);
        //assert.equal(Utils.dump(remodeled), Utils.dump(builtInsDump));
        assert.equal(Utils.dump(remodeled), Utils.dump(builtInsDump));
    });

    it("remodel-bad-builtIns", function() {
        try {
            DataModel.remodel("", builtInsProtoBad, builtInsModel);
        } catch(s) {
            assert.equal(s, "remodel: not optional and no default at fnaar");
            return;
        }
        assert(false, "Failed");
    });

    it("remodel-toady", function() {
        var remodeled = DataModel.remodel("", toadyProto, toadyModel);
        assert.equal(Utils.dump(remodeled), Utils.dump(toadyProto));
        remodeled.b.croak(1, true);
    });

    it("serialise-simple", function() {
        return DataModel.getSerialisable(simpleProto, simpleModel)
            .then(function(s) {
                assert.equal(Utils.dump(s), Utils.dump(simpleProto));
            });
    });

    it("serialise-builtIns", function() {
        var data = DataModel.remodel("", builtInsProto, builtInsModel);
        return DataModel.getSerialisable(data, builtInsModel)
            .then(function(s) {
                assert.equal(Utils.dump(s), Utils.dump(builtInsProto));
            });
    });

    it("serialise-toady", function() {
        var data = DataModel.remodel("", toadyProto, toadyModel);
        return DataModel.getSerialisable(data, toadyModel)
            .then(function(s) {
                assert.equal(Utils.dump(s), Utils.dump(toadySerial));
            });
    });

    it("saveload-simple", function() {
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
    it("saveload-builtIns", function() {
        return DataModel.saveData(builtInsProto, builtInsModel, mainfile)
            .then(function() {
                return DataModel.loadData(mainfile, builtInsModel);
            })
            .then(function(config) {
                assert.equal(config._readfrom, mainfile);
                delete config._readfrom;
                assert.equal(Utils.dump(config), Utils.dump(builtInsDump));
                return Q(config);
            });
    });

    it("update-simple", function() {
        var remodeled = DataModel.remodel('', simpleProto, simpleModel);
        DataModel.update("/cuthbert/bob", "digger", remodeled, simpleModel);
        assert.equal("digger", remodeled.cuthbert.bob);
        DataModel.update("/array/1", "d", remodeled, simpleModel);
        assert.equal(remodeled.array[1], "d");
    });
    
    it("update-toady", function() {
        var remodeled = DataModel.remodel('', toadyProto, toadyModel);
        DataModel.update("/b", {data:{x:99,y:false}}, remodeled, toadyModel);
        assert.equal(Utils.dump(remodeled), Utils.dump(
            {  "a": "A",
               "b": {
                   "data": {
                       "x": 99,
                       "y": false
                   }
               }
            }));
        remodeled.b.croak(99, false);
    });
    
    it("help", function() {
        assert.equal(DataModel.help(helpModel), helpModelString);
    });
});

