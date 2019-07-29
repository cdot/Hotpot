/*@preserve Copyright (C) 2017-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["test/TestRunner", "common/js/DataModel", "common/js/Utils"], function(TestRunner, DataModel, Utils) {

    let tr = new TestRunner("DataModel");
    let assert = tr.assert;

    const mainfile = "/tmp/blah";

    // Test with built-in types
    let simpleModel = {
        pugh: { $class: String, $doc: "hugh" },
        barney: { $class: Number },
        cuthbert: {
            $doc: "mcgrew",
            dibble: { $class: String, $doc: "grubb" },
            bob: { $class: String, $doc: "builder", $optional: true }
        },
        array: { $array_of: { $class: String } }
    };

    let simpleProto = {
        pugh: "hugh",
        barney: 99,
        cuthbert: {
            dibble: "grubb"
        },
        array: [ "a", "b", "c" ]
    };

    let simpleProtoBad = {
        pugh: "hugh",
        barney: 7,
        cuthbert: {
            // dibble is missing
        } // array is missing
    };

    // A model containing builtIns objects
    let builtInsModel = {
        fnaar: { $class: DataModel.File, $doc: "fnarr" },
        phoar: { $class: DataModel.TextOrFile, $doc: "cor", $optional: true }
    };

    let builtInsProto = {
        fnaar: "/",
        phoar: "flab a dab\nsnooty\nwhoops a daisy\nclump\nratfink"
    };

    let builtInsProtoBad = {
        // fnaar is missing
        phoar: builtInsProto.phoar
    };

    let builtInsDump = {
        fnaar: new DataModel.File(builtInsProto.fnaar),
        phoar: new DataModel.TextOrFile(builtInsProto.phoar)
    };

    let helpModel = {
        simple: simpleModel,
        builtIns: builtInsModel
    };

    let helpModelString = [
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

    class Toad {

        constructor(data, index, model) {
            Utils.extend(this, data);
        }

        getSerialisable(data, model) {
            return Promise.resolve("Smeg");
        };

        croak(x, y) {
            assert.equal(x, this.data.x);
            assert.equal(y, this.data.y);
        };
    }
    
    Toad.Model = {
        $class: Toad,
        data: {
            x: { $class: Number },
            y: { $class: Boolean }
        }
    };

    let toadyModel = {
        a: { $class: String },
        b: Toad.Model,
        c: { $map_of: Toad.Model }
    };

    let toadyProto = {
        a: "A",
        b: { data: { x: 1, y: true } },
        c: {one: { data: { x: 2, y: true } }, two: { data: { x: 3, y: true } }}
    };

    let toadyDump = {
        a: "A",
        b: new Toad({ data: { x: 1, y: true } }),
        c: { one: new Toad({ data: { x: 2, y: true } }),
             two: new Toad({ data: { x: 3, y: true } }) }
    };

    let toadySerial = {
        a: "A",
        b: "Smeg",
        c: { one: "Smeg", two: "Smeg" }
    }

    class Amphibian {
        constructor(data, index, model) {
            Utils.extend(this, data);
        }
    }
    
    Amphibian.Model = {
        $class: Amphibian,
        toad: { $array_of: Toad.Model }
    };

    amphibianProto = {
        toad: [{ data: { x: 4, y: false } }]
    };

    tr.addTest("remodel-simple", function() {
        let remodeled = DataModel.remodel('', simpleProto, simpleModel);
        assert.equal(Utils.dump(remodeled), Utils.dump(simpleProto));
    });

    tr.addTest("remodel-bad-simple", function() {
        try {
            DataModel.remodel('', simpleProtoBad, simpleModel);
        } catch(s) {
            assert(s.name == "DataModel");
            assert.equal(s.message, ".remodel: not optional and no default at cuthbert.dibble");
            return;
        }
        assert(false, "Failed");
    });

    tr.addTest("remodel-builtIns", function() {
        let remodeled = DataModel.remodel("", builtInsProto, builtInsModel);
        //Utils.LOG(remodeled, builtInsDump);
        //assert.equal(Utils.dump(remodeled), Utils.dump(builtInsDump));
        assert.equal(Utils.dump(remodeled), Utils.dump(builtInsDump));
    });

    tr.addTest("remodel-bad-builtIns", function() {
        try {
            DataModel.remodel("", builtInsProtoBad, builtInsModel);
        } catch(s) {
            assert.equal(s.name, "DataModel");
            assert.equal(s.message, ".remodel: not optional and no default at fnaar");
            return;
        }
        assert(false, "Failed");
    });

    tr.addTest("remodel-toady", function() {
        let remodeled = DataModel.remodel("", toadyProto, toadyModel);
        assert.equal(Utils.dump(remodeled), Utils.dump(toadyDump));
        remodeled.b.croak(1, true);
        remodeled.c.one.croak(2, true);
        remodeled.c.two.croak(3, true);
    });

    tr.addTest("remodel-amphibian", function() {
        let remodeled = DataModel.remodel("", amphibianProto, Amphibian.Model);
        assert.equal(remodeled.constructor.name, "Amphibian");
        assert.equal(remodeled.toad.constructor.name, "Array");
        assert.equal(remodeled.toad[0].constructor.name, "Toad");
    });

    tr.addTest("serialise-simple", function() {
        return DataModel.getSerialisable(simpleProto, simpleModel)
            .then(function(s) {
                assert.equal(Utils.dump(s), Utils.dump(simpleProto));
            });
    });

    tr.addTest("serialise-builtIns", function() {
        let data = DataModel.remodel("", builtInsProto, builtInsModel);
        return DataModel.getSerialisable(data, builtInsModel)
            .then(function(s) {
                assert.equal(Utils.dump(s), Utils.dump(builtInsProto));
            });
    });

    tr.addTest("serialise-toady", function() {
        let data = DataModel.remodel("", toadyProto, toadyModel);
        return DataModel.getSerialisable(data, toadyModel)
            .then(function(s) {
                assert.equal(Utils.dump(s), Utils.dump(toadySerial));
            });
    });

    tr.addTest("saveload-simple", function() {
        return DataModel.saveData(simpleProto, simpleModel, mainfile)
        .then(function() {
            return DataModel.loadData(mainfile, simpleModel);
        })
        .then(function(config) {
            assert.equal(config.pugh, "hugh");
            assert.equal(config.barney, 99);
            assert.equal(config.cuthbert.dibble, "grubb");
        });
    });
    tr.addTest("saveload-builtIns", function() {
        return DataModel.saveData(builtInsProto, builtInsModel, mainfile)
            .then(function() {
                return DataModel.loadData(mainfile, builtInsModel);
            })
            .then(function(config) {
                assert.equal(config._readFrom, mainfile);
                delete config._readFrom;
                assert.equal(Utils.dump(config), Utils.dump(builtInsDump));
                return Promise.resolve(config);
            });
    });

    tr.addTest("at-simple", function() {
        let remodeled = DataModel.remodel('', simpleProto, simpleModel);
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

    tr.addTest("help", function() {
        assert.equal(DataModel.help(helpModel), helpModelString);
    });

    tr.run();
});
