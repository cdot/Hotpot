/*@preserve Copyright (C) 2017-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

let requirejs = require('requirejs');
requirejs.config({
	baseUrl: "../.."
});

requirejs(["test/TestRunner", "common/js/DataModel", "common/js/Utils", "common/test/Instantiable", "common/js/Timeline"], function(TestRunner, DataModel, Utils, Instantiable, Timeline) {

	const tr = new TestRunner("DataModel");
	const assert = tr.assert;
	let fs, Fs;

	function _loadFs() {
		if (typeof fs === "undefined") {
			fs = require("fs");
			Fs = fs.promises;
		}
	}
	////////////////////////////////////////////////////////////////

	const simpleModel = {
		pugh: { $class: String, $doc: "hugh" },
		barney: { $class: Number },
		cuthbert: {
			$doc: "mcgrew",
			dibble: { $class: String, $doc: "grubb" },
			bob: { $class: String, $doc: "builder", $optional: true }
		},
		array: { $array_of: { $class: String } }
	};

	const simpleData = {
		pugh: "hugh",
		barney: 99,
		cuthbert: {
			dibble: "grubb"
		},
		array: [ "a", "b", "c" ]
	};

	const simpleDataBad = {
		pugh: "hugh",
		barney: 7,
		cuthbert: {
			// dibble is missing
		} // array is missing
	};

	const simpleHelpString = [ "{",
		" pugh: <String> hugh",
		" barney: <Number>",
		" cuthbert: mcgrew {",
		"  dibble: <String> grubb",
		"  bob: (optional) <String> builder",
		" }",
		" array: [",
		"  <String>",
		" ]",
	"}" ].join("\n");;
	
	tr.addTest("good simple", () => {
		return DataModel.remodel('', simpleData, simpleModel)
		.then(remodeled => {
			assert.equal(Utils.dump(remodeled), Utils.dump(simpleData));
			assert.equal(simpleHelpString, DataModel.help(simpleModel));
		});
	});

	tr.addTest("bad simple", () => {
		return DataModel.remodel('', simpleDataBad, simpleModel)
		.then(() => assert.fail())
		.catch(s => {
			// Unpredictable order from maps, so use regex
			assert.match(s.message, /field not optional and no default at/);
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("$class", () => {
		const model = {
			thing: {
				$class: Instantiable
			}
		};
		const data = {
			thing: { data: "Beans" }
		};

		return DataModel.remodel("", data, model)
		.then(d => {
			assert(d.thing instanceof Instantiable);
			assert.equal("Beans", d.thing.data);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("$instantiable", () => {
		const model = {
			thing: {
				$instantiable: true,
				data: { $class: String, $doc: "nerf" },
				$doc: "meelf",
			}
		};
		const data = {
			thing: {
				// $instantiable expects data to contain $instance_of
				$instance_of: "common/test/Instantiable",
				data: "Sausages"
			}
		};
		return DataModel.remodel("", data, model)
		.then(d => {
			assert(d.thing instanceof Instantiable);
			assert.equal(d.thing.data, "Sausages");
			assert.equal(d.thing.$instance_of, data.thing.$instance_of);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("$instantiable requires $instance_of", () => {
		const model = {
			thing: {
				$instantiable: true,
				data: { $class: String, $doc: "nerf" },
				$doc: "meelf",
			}
		};
		const data = {
			thing: {
				// $instance_of missing! Can't do this!
				data: "Sausages"
			}
		};
		//Utils.TRACEfilter("all");
		return DataModel.remodel("", data, model)
		.then(d => assert.fail())
		.catch(e => {
			assert.equal(e.message,
						 "DataModel.remodel: Expected $instance_of at 'thing'");
		});
	});
	
	////////////////////////////////////////////////////////////////

	tr.addTest("$array_of $instantiable", () => {
		const model = {
			thing: {
				$array_of: {
					$instantiable: true,
					data: { $class: String, $doc: "nerf" },
					$doc: "meelf",
				}
			}
		};
		const data = {
			thing: [
				{
					$instance_of: "common/test/Instantiable",
					data: "Sausages"
				},
				{
					$instance_of: "common/test/Instantiable",
					data: "Beans"
				}
			]
		};

		return DataModel.remodel("", data, model)
		.then(d => {
			assert(d.thing instanceof Array);
			assert.equal(d.thing[0].data, "Sausages");
			assert.equal(d.thing[1].data, "Beans");
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("$unchecked", () => {
		const model = {
			thing: {
				$unchecked: true,
			}
		};
		const data = {
			thing: {
				data: "Sausages"
			}
		};

		return DataModel.remodel("", data, model)
		.then(d => {
			assert.equal(d.thing.data, "Sausages");
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("$unchecked with String $default", () => {
		const model = {
			thing: {
				$unchecked: true,
				$default: "Cheese"
			}
		};
		const data = {
		};
		const serial_data = {
			thing: 'Cheese'
		};

		return DataModel.remodel("", data, model)
		.then(d => {
			assert.equal("Cheese", d.thing);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(serial_data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("$unchecked with Object $default", () => {
		const model = {
			thing: {
				$unchecked: true,
				$default: { sun: "shine" }
			}
		};
		const data = {
		};
		const serial_data = {
			thing: { sun: "shine" }
		};

		return DataModel.remodel("", data, model)
		.then(d => {
			assert.equal("shine", d.thing.sun);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(serial_data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("get $fileable String from string", () => {
		const model = {
			thing: {
				$fileable: true,
				$class: String,
			}
		};
		const data = {
			thing: "Sausages"
		};

		return DataModel.remodel("", data, model)
		.then(d => {
			assert.equal(d.thing, "Sausages");
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("get $fileable String from file", () => {
		const model = {
			thing: {
				$fileable: true,
				$class: String,
			}
		};
		const data = {
			thing: "oneInstantiable.txt"
		};
		const serial_data = {
			thing: '{ data: "Beans" }\n'
		};

		return DataModel.remodel("", data, model)
		.then(d => {
			assert.equal('{ data: "Beans" }\n', d.thing);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(serial_data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("get one $fileable Instantiable from file", () => {
		const model = {
			thing: {
				$fileable: true,
				$class: Instantiable
			}
		};
		const filename = "oneInstantiable.txt";
		const data = {
			thing: filename
		};
		const serial_data = {
			thing: {
				data: "Beans",
				$read_from: filename
			}
		};

		return DataModel.remodel("", data, model)
		.then(d => {
			assert(d.thing instanceof Instantiable);
			assert.equal("Beans", d.thing.data);
			assert.equal(filename, d.thing.$read_from);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(serial_data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("get $fileable array of Instantiable from file", () => {
		const model = {
			thing: {
				$fileable: true,
				$array_of: { $class: Instantiable }
			}
		};
		const data = {
			thing: "arrayOfInstantiable.txt"
		};
		const serial_data = {
			thing: [
				{ data: "Beans" },
				{ data: "Cheese" },
				{ data: "Sausages" }
			]
		};
		
		return DataModel.remodel("", data, model)
		.then(d => {
			assert(d.thing instanceof Array);
			assert(d.thing[0] instanceof Instantiable);
			assert.equal("Beans", d.thing[0].data);
			assert(d.thing[1] instanceof Instantiable);
			assert.equal("Cheese", d.thing[1].data);
			assert(d.thing[2] instanceof Instantiable);
			assert.equal("Sausages", d.thing[2].data);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(serial_data));
		});
	});

	////////////////////////////////////////////////////////////////

	tr.addTest("get $fileable map of Instantiable from file", () => {
		const model = {
			thing: {
				$fileable: true,
				$map_of: { $class: Instantiable }
			}
		};
		const filename = "mapOfInstantiable.txt";
		const data = {
			thing: filename
		};
		const serial_data = {
			thing: {
				a: { data: "Beans" },
				b: { data: "Cheese" },
				c: { data: "Sausages" },
				$read_from: filename
			}
		};
		
		return DataModel.remodel("", data, model)
		.then(d => {
			assert(d.thing instanceof Object);
			assert(d.thing.a instanceof Instantiable);
			assert.equal("Beans", d.thing.a.data);
			assert(d.thing.b instanceof Instantiable);
			assert.equal("Cheese", d.thing.b.data);
			assert(d.thing.c instanceof Instantiable);
			assert.equal("Sausages", d.thing.c.data);
			assert.equal(filename, d.thing.$read_from);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(Utils.dump(s), Utils.dump(serial_data));
		});
	});

	////////////////////////////////////////////////////////////////

	const saveModel = {
		$fileable: true,
		time: { $class: Number },
		thing: {
			thing_string: { $class: String }
		},
		array: {
			$array_of: {
				$instantiable: true,
				data: { $class: String }
			}
		},
		map: {
			$map_of: {
				$class: Instantiable
			}
		}
	};

	const savedFile = "testsave.dat";
	const now = Date.now();
		
	const saveData = {
		$read_from: savedFile,
		time: now,
		thing: {
			thing_string: "thong"
		},
		array: [ {data: "a"}, {data: "b"}, {data: "c"} ],
		map:  { a: {data: "a"}, b: {data: "b"}, c: {data: "c"} }
	};

	tr.addTest("saveData on root", () => {
		_loadFs();
		
		return new Promise(resolve => {
			Fs.unlink(savedFile)
			.catch(e => resolve())
			.then(() => resolve());
		})
		.then(() => DataModel.saveData(saveData, saveModel, "/"))
		.then(state => {
			assert(state instanceof Array);
			assert.equal(0, state.length);
		})
		.then(() => Fs.readFile(savedFile))
		.then(rootData => {
			let reread = Utils.eval(rootData.toString());
			assert.equal(Utils.dump(saveData), Utils.dump(reread));
		});
	});

	tr.addTest("saveData on leaf", () => {
		_loadFs();
		
		return new Promise(resolve => {
			Fs.unlink(savedFile)
			.catch(e => resolve())
			.then(() => resolve());
		})
		.then(() => DataModel.saveData(saveData, saveModel, "array"))
		.then(state => {
			assert(state instanceof Array);
			assert.equal(0, state.length);
		})
		.then(() => Fs.readFile(savedFile))
		.then(rootData => {
			let reread = Utils.eval(rootData.toString());
			assert.equal(Utils.dump(saveData), Utils.dump(reread));
		});
	});

	tr.addTest("saveData on $fileable map", () => {
		_loadFs();

		const annotatedModel = Utils.extend({},	saveModel);
		annotatedModel.map.$fileable = true;

		const annotatedData = Utils.extend({}, saveData);
		annotatedData.map.$read_from = savedFile;
		delete annotatedData.$read_from;

		return new Promise(resolve => {
			Fs.unlink(savedFile)
			.catch(e => resolve())
			.then(() => resolve());
		})
		.then(() => DataModel.saveData(annotatedData, annotatedModel, "map"))
		.then(state => {
			assert(state instanceof Object);
			assert.equal(1, state.length);
			assert.equal("map", state[0]);
		})
		.then(() => Fs.readFile(savedFile))
		.then(rootData => {
			let reread = Utils.eval(rootData.toString());
			assert.equal(Utils.dump(annotatedData.map), Utils.dump(reread));
		});
	});

	tr.run();
});
