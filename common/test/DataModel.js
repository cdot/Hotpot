/*@preserve Copyright (C) 2017 Crawford Currie http://c-dot.co.uk license MIT*/

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
    pugh: { $class: String, $doc: "hugh" },
    barney: { $class: Number },
    cuthbert: {
        $doc: "mcgrew",
        dibble: { $class: String, $doc: "grubb" },
        bob: { $class: String, $doc: "builder", $optional: true }
    },
    array: { $array_of: { $class: String } }
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
    fnaar: { $class: DataModel.File, $doc: "fnarr" },
    phoar: { $class: DataModel.TextOrFile, $doc: "cor", $optional: true }
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
    fnaar: new DataModel.File(builtInsProto.fnaar),
    phoar: new DataModel.TextOrFile(builtInsProto.phoar)
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
    Utils.extend(this, data);
}

Toad.Model = {
    $class: Toad,
    data: {
        x: { $class: Number },
        y: { $class: Boolean }
    }
};

Toad.prototype.getSerialisable = function(data, model) {
    return Q("Smeg");
};

Toad.prototype.croak = function(x, y) {
    assert.equal(x, this.data.x);
    assert.equal(y, this.data.y);
};

var toadyModel = {
    a: { $class: String },
    b: Toad.Model,
    c: { $map_of: Toad.Model }
};

var toadyProto = {
    a: "A",
    b: { data: { x: 1, y: true } },
    c: {one: { data: { x: 2, y: true } }, two: { data: { x: 3, y: true } }}
};

var toadyDump = {
    a: "A",
    b: new Toad({ data: { x: 1, y: true } }),
    c: { one: new Toad({ data: { x: 2, y: true } }),
         two: new Toad({ data: { x: 3, y: true } }) }
};

var toadySerial = {
    a: "A",
    b: "Smeg",
    c: { one: "Smeg", two: "Smeg" }
}

function Amphibian(data, index, model) {
    Utils.extend(this, data);
}

Amphibian.Model = {
    $class: Amphibian,
    toad: { $array_of: Toad.Model }
};

amphibianProto = {
    toad: [{ data: { x: 4, y: false } }]
};

describe('common/DataModel', function() {
    it("remodel-simple", function() {
        var remodeled = DataModel.remodel('', simpleProto, simpleModel);
        assert.equal(Utils.dump(remodeled), Utils.dump(simpleProto));
    });

    it("remodel-bad-simple", function() {
        try {
            DataModel.remodel('', simpleProtoBad, simpleModel);
        } catch(s) {
            assert.equal(s, "DataModel.remodel: not optional and no default at cuthbert.dibble");
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
            assert.equal(s, "DataModel.remodel: not optional and no default at fnaar");
            return;
        }
        assert(false, "Failed");
    });

    it("remodel-toady", function() {
        var remodeled = DataModel.remodel("", toadyProto, toadyModel);
        assert.equal(Utils.dump(remodeled), Utils.dump(toadyDump));
        remodeled.b.croak(1, true);
        remodeled.c.one.croak(2, true);
        remodeled.c.two.croak(3, true);
    });

    it("remodel-amphibian", function() {
        var remodeled = DataModel.remodel("", amphibianProto, Amphibian.Model);
        assert.equal(remodeled.constructor.name, "Amphibian");
        assert.equal(remodeled.toad.constructor.name, "Array");
        assert.equal(remodeled.toad[0].constructor.name, "Toad");
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
                assert.equal(config._readFrom, mainfile);
                delete config._readFrom;
                assert.equal(Utils.dump(config), Utils.dump(builtInsDump));
                return Q(config);
            });
    });

    it("at-simple", function() {
        var remodeled = DataModel.remodel('', simpleProto, simpleModel);
        DataModel.at(
            remodeled, simpleModel, "/cuthbert/bob",
            function(node, model, parent, key) {
                assert(node === remodeled.cuthbert.bob);
                assert(model === simpleModel.cuthbert.bob);
                assert(parent === remodeled.cuthbert);
                assert.equal(key, "bob");
            });
        try {
            DataModel.at(
                remodeled, simpleModel, "cuthbert/array",
                function(node, model, parent, key) {
                    assert(false, "Should never be called");
                });
            assert(false, "Should fail");
        } catch (e) {
        };
        DataModel.at(remodeled, simpleModel, "array/1",
             function(node, model, parent, key) {
                 assert(node === remodeled.array[1]);
                 assert(model === simpleModel.array.$array_of);
                 assert(parent === remodeled.array);
                 assert.equal(key, 1);
             });
        DataModel.at(remodeled, simpleModel, "array",
             function(node, model, parent, key) {
                 assert(node === remodeled.array);
                 assert(model === simpleModel.array);
                 assert(parent === remodeled);
                 assert.equal(key, "array");
             });
    });

    it("help", function() {
        assert.equal(DataModel.help(helpModel), helpModelString);
    });
});
