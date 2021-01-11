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

    // Test with built-in types String, Number
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

    let simpleData = {
        pugh: "hugh",
        barney: 99,
        cuthbert: {
            dibble: "grubb"
        },
        array: [ "a", "b", "c" ]
    };

    let simpleDataBad = {
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

    let builtInsData = {
        fnaar: "/",
        phoar: "flab a dab\nsnooty\nwhoops a daisy\nclump\nratfink"
    };

    let builtInsDataBad = {
        // fnaar is missing
        phoar: builtInsData.phoar
    };

    let builtInsDump = {
        fnaar: new DataModel.File(builtInsData.fnaar),
        phoar: new DataModel.TextOrFile(builtInsData.phoar),
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

    let toadyData = {
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

    tr.deTest("remodel simple", function() {
        return DataModel.remodel('', simpleData, simpleModel)
		.then((remodeled) => {
			assert.equal(Utils.dump(remodeled), Utils.dump(simpleData));
		});
    });

    tr.deTest("remodel bad simple", function() {
        return DataModel.remodel('', simpleDataBad, simpleModel)
		.then(() => assert.fail())
		.catch((s) => {
			// Unpredictable order from maps
            assert(s.message == "'array' not optional and no default"
				   || s.message == "'cuthbert.dibble' not optional and no default");
        });
    });

    tr.deTest("remodel builtIns", function() {
        return DataModel.remodel("", builtInsData, builtInsModel)
		.then((remodeled) => {
			//Utils.LOG(remodeled, builtInsDump);
			//assert.equal(Utils.dump(remodeled), Utils.dump(builtInsDump));
			assert.equal(Utils.dump(remodeled), Utils.dump(builtInsDump));
		});
    });

    tr.deTest("remodel bad builtIns", function() {
        return DataModel.remodel("", builtInsDataBad, builtInsModel)
		.then(() => assert.fail())
		.catch((s) => {
            assert.equal(s.message, "'fnaar' not optional and no default");
        });
    });

    tr.deTest("remodel toady", function() {
        return DataModel.remodel("", toadyData, toadyModel)
		.then((remodeled) => {
			assert.equal(Utils.dump(remodeled), Utils.dump(toadyDump));
			remodeled.b.croak(1, true);
			remodeled.c.one.croak(2, true);
			remodeled.c.two.croak(3, true);
		});
	});

    tr.deTest("remodel amphibian", function() {
        return DataModel.remodel("", amphibianProto, Amphibian.Model)
		.then((remodeled) => {
			assert.equal(remodeled.constructor.name, "Amphibian");
			assert.equal(remodeled.toad.constructor.name, "Array");
			assert.equal(remodeled.toad[0].constructor.name, "Toad");
		});
    });

    tr.deTest("serialise simple", function() {
        return DataModel.getSerialisable(simpleData, simpleModel)
            .then(function(s) {
                assert.deepEqual(s, simpleData);
            });
    });

    tr.deTest("serialise builtIns", function() {
        return DataModel.remodel("", builtInsData, builtInsModel)
		.then((data) => DataModel.getSerialisable(data, builtInsModel))
        .then((s) => assert.equal(Utils.dump(s), Utils.dump(builtInsData)));
	});

    tr.deTest("serialise toady", function() {
        DataModel.remodel("", toadyData, toadyModel)
        .then((data) => DataModel.getSerialisable(data, toadyModel))
		.then(function(s) {
			assert.equal(Utils.dump(s), Utils.dump(toadySerial));
		});
    });

    tr.deTest("saveload simple", function() {
        return DataModel.saveData(simpleData, simpleModel, mainfile)
        .then(function() {
            return DataModel.loadData(mainfile, simpleModel);
        })
        .then(function(config) {
            assert.equal(config.pugh, "hugh");
            assert.equal(config.barney, 99);
            assert.equal(config.cuthbert.dibble, "grubb");
        });
    });
	
    tr.deTest("saveload builtIns", function() {
        return DataModel.saveData(builtInsData, builtInsModel, mainfile)
        .then(() => DataModel.loadData(mainfile, builtInsModel))
        .then((config) => {
            assert.equal(config._readFrom, mainfile);
            delete config._readFrom;
            assert.equal(Utils.dump(config), Utils.dump(builtInsDump));
            return Promise.resolve(config);
        });
    });

    tr.deTest("simple proto, simple data", function() {
        return DataModel.remodel('', simpleData, simpleModel)
		.then((remodeled) => {
			return DataModel.at(remodeled, simpleModel, "/cuthbert/bob")
			.then((p) => {
				assert.equal(p.node, remodeled.cuthbert.bob);
				assert.equal(p.model, simpleModel.cuthbert.bob);
				assert.equal(p.parent, remodeled.cuthbert);
				assert.equal(p.key, "bob");
			})
			.then(() => {
				return new Promise((resolve) => {
					DataModel.at(remodeled, simpleModel, "cuthbert/array")
					.then(() => {
						assert.fail("Should never be called");
					})
					.catch((e) => {
						resolve();
					});
				});
			})
			.then(() => DataModel.at(remodeled, simpleModel, "array/1"))
			.then((p) => {
				assert(p.node === remodeled.array[1]);
				assert(p.model === simpleModel.array.$array_of);
				assert(p.parent === remodeled.array);
				assert.equal(p.key, 1);
			})
			.then(() => DataModel.at(remodeled, simpleModel, "array"))
			.then((p) => {
				assert(p.node === remodeled.array);
				assert(p.model === simpleModel.array);
				assert(p.parent === remodeled);
				assert.equal(p.key, "array");
			});
		});
    });

    tr.deTest("help", function() {
        assert.equal(DataModel.help(helpModel), helpModelString);
    });

	tr.addTest("require", function() {
		let model = {
			fleem: {
				$instantiable: true,
				data: { $class: String, $doc: "nerf" },
				$doc: "meelf",
			}
		};
		let data = {
			fleem: {
				$instance_of: "common/test/Instantiable",
				data: "Sausages"
			}
		};

		return DataModel.remodel("", data, model)
		.then((d) => DataModel.getSerialisable(d, model))
        .then((s) => {
			assert.equal(Utils.dump(s), Utils.dump(data));
		});
	});

    tr.run();
});
