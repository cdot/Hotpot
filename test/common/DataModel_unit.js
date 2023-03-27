/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node, mocha */

import { assert } from "chai";
import { promises as Fs } from "fs";
import { extend } from "../../src/common/extend.js";
import { DataModel } from "../../src/common/DataModel.js";
import { Instantiable } from "./Instantiable.js";
import { Timeline } from "../../src/common/Timeline.js";
import Path from "path";
import { fileURLToPath } from "url";
const __dirname = Path.dirname(fileURLToPath(import.meta.url));

describe("DataModel", () => {

	const simpleModel = {
		string: { $class: String, $doc: "base type: string" },
		number: { $class: Number, $doc: "base type: number" },
    boolean: { $class: Boolean, $doc: "base type: boolean" },
    date: { $class: Date, $doc: "base type: date" },
    regexp: { $class: RegExp, $doc: "base type: regexp" },
		object: {
			$doc: "complex type: object",
			string: { $class: String, $doc: "optional string", $optional: true }
		},
		array_of_string: { $array_of: { $class: String } },
		map_of_number: { $map_of: { $class: Number } }
	};

	const simpleDataGood = {
		string: "a string",
		number: 99,
    boolean: true,
    date: new Date("Mon Mar 27 2023"),
    regexp: /^regexp$/,
		object: {
			string: "string in object"
		},
		array_of_string: [ "a", "b", "c" ],
    map_of_number: { a: 1, b: 2 }
	};

	const simpleHelpString = [
    "{",
		" string: <String> base type: string",
		" number: <Number> base type: number",
    " boolean: <Boolean> base type: boolean",
    " date: <Date> base type: date",
    " regexp: <RegExp> base type: regexp",
		" object: complex type: object {",
		"  string: (optional) <String> optional string",
		" }",
		" array_of_string: [",
		"  <String>",
		" ]",
    " map_of_number: {",
    "  <Number>",
    " }",
	  "}" ].join("\n");

	function UNit() {}

	it("good simple", () => {
		return DataModel.remodel({
      data: simpleDataGood,
      model: simpleModel
    })
		.then(remodeled => {
      assert.equal(typeof remodeled.string, "string");
      assert.equal(typeof remodeled.number, "number");
      assert.equal(typeof remodeled.object, "object");
      assert.equal(typeof remodeled.boolean, "boolean");
      assert(remodeled.date instanceof Date);
      assert(remodeled.regexp instanceof RegExp);
			assert.deepEqual(remodeled, simpleDataGood);
			assert.equal(simpleHelpString, DataModel.help(simpleModel));
		});
	});

	it("convert to model base type", () => {
		return DataModel.remodel({
      data: {
		    string: -99,
		    number: "7",
        boolean: 1,
        regexp: "^regexp$",
        date: "2023-03-26",
		    object: { },
		    array_of_string: [ 101 ],
        map_of_number: { one: "1" }
	    },
      model: simpleModel
    })
		.then(remodeled => {
			assert.deepEqual(remodeled, {
		    string: "-99",
		    number: 7,
        boolean: true,
        date: new Date("2023-03-26"),
        regexp: /^regexp$/,
		    object: {},
		    array_of_string: [ "101" ],
        map_of_number: { one: 1 }
      });
		});
	});

	it("bad string", () => {
		return DataModel.remodel({
      data: {
		    string: undefined,
        number: 1,
        boolean: false,
        date: new Date(),
        regexp: 0,
        object: {},
        array_of_string: [],
        map_of_number: {}
	    }, model: simpleModel
    })
		.then(() => assert.fail())
		.catch(s => {
			assert.equal(s.message, "DataModel.remodel: field not optional and no default at 'string'");
		});
	});

	it("bad number", () => {
		return DataModel.remodel({
      data: {
		    string: "",
        number: {},
        boolean: false,
        date: new Date(),
        regexp: 0,
        object: {},
        array_of_string: [],
        map_of_number: { a: NaN, b: "not a number" }
	    }, model: simpleModel
    })
		.then(d => {
      assert.isNaN(d.number);
      assert.isNaN(d.map_of_number.a);
      assert.isNaN(d.map_of_number.b);
    });
	});

	it("bad date", () => {
		return DataModel.remodel({
      data: {
		    string: "",
        number: 99,
        boolean: false,
        date: "99-99-99",
        regexp: 0,
        object: {},
        array_of_string: [],
        map_of_number: { a: NaN, b: "not a number" }
	    }, model: simpleModel
    })
		.then(d => {
      assert.isNaN(d.date.getTime());
    });
	});

  it("serialises", () => {
    // Simple stuff only, complex objects tested in load/save, below
    DataModel.getSerialisable(
      simpleDataGood, simpleModel, "")
    .then(serial => {
      assert.equal(serial.string, "a string");
      assert.equal(typeof serial.string, "string");
      assert.equal(serial.number, 99);
      assert.equal(typeof serial.number, "number");
      assert.equal(serial.boolean, true);
      assert.equal(typeof serial.boolean, "boolean");
      assert.equal(serial.date, new Date("2023-03-26"));
      assert(serial.date instanceof Date);
      assert.equal(serial.date, /^regexp$/);
      assert(serial.date instanceof RegExp);
      assert.equal(typeof serial.object, "object");
      assert.equal(serial.object.string, "string in object");
      assert.deepEqual(serial.array_of_string, [ "a", "b", "c" ]);
      assert.deepEqual(serial.map_of_number, { a: 1, b: 2 });
    });
  });

	////////////////////////////////////////////////////////////////

	it("$class", () => {
		const model = {
			thing: {
				$class: Instantiable
			}
		};
		const data = {
			thing: { data: "Beans" }
		};

		return DataModel.remodel({ data: data, model: model })
		.then(d => {
			assert(d.thing instanceof Instantiable);
			assert.equal("Beans", d.thing.data);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.deepEqual(s, data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("$instantiable", () => {
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
				$instance_of: "test/common/Instantiable",
				data: "Sausages"
			}
		};
		return DataModel.remodel({data: data, model: model})
		.then(d => {
			assert(d.thing instanceof Instantiable);
			assert.equal(d.thing.data, "Sausages");
			assert.equal(d.thing.$instance_of, data.thing.$instance_of);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.deepEqual(s, data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("$instantiable requires $instance_of", () => {
		const model = {
			thing: {
				$instantiable: true,
				data: { $class: String, $doc: "nerf" },
				$doc: "meelf"
			}
		};
		const data = {
			thing: {
				// $instance_of missing! Can't do this!
				data: "Sausages"
			}
		};
		return DataModel.remodel({ data: data, model: model})
		.then(d => assert.fail())
		.catch(e => {
			assert.equal(e.message,
						 "DataModel.remodel: Expected $instance_of at 'thing'");
		});
	});
	
	////////////////////////////////////////////////////////////////

	it("$array_of $instantiable", () => {
		const model = {
			thing: {
				$array_of: {
					$instantiable: true,
					data: { $class: String, $doc: "nerf" },
					$doc: "meelf"
				}
			}
		};
		const data = {
			thing: [
				{
					$instance_of: "test/common/Instantiable",
					data: "Sausages"
				},
				{
					$instance_of: "test/common/Instantiable",
					data: "Beans"
				}
			]
		};

		return DataModel.remodel({data: data, model: model})
		.then(d => {
			assert(d.thing instanceof Array);
			assert.equal(d.thing[0].data, "Sausages");
			assert.equal(d.thing[1].data, "Beans");
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.deepEqual(s, data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("$unchecked", () => {
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

		return DataModel.remodel({data: data, model: model})
		.then(d => {
			assert.equal(d.thing.data, "Sausages");
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.deepEqual(s, data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("$unchecked with String $default", () => {
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

		return DataModel.remodel({data: data, model: model})
		.then(d => {
			assert.equal("Cheese", d.thing);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.deepEqual(s, serial_data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("$unchecked with Object $default", () => {
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

		return DataModel.remodel({data: data, model: model})
		.then(d => {
			assert.equal("shine", d.thing.sun);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.deepEqual(s, serial_data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("get $fileable String from string", () => {
		const model = {
			thing: {
				$fileable: true,
				$class: String
			}
		};
		const data = {
			thing: "Sausages"
		};

		return DataModel.remodel({
      data: data,
      model: model,
      loadFileable: f => Promise.reject()
    })
		.then(d => {
			assert.equal(d.thing, "Sausages");
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.deepEqual(s, data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("get $fileable String from file", () => {
		const model = {
			thing: {
				$fileable: true,
				$class: String
			}
		};
		const data = {
			thing: "oneInstantiable.txt"
		};
		const serial_data = 'Thy foonting turlingdromes\n';

		return DataModel.remodel({
      data: data,
      model: model,
      loadFileable: f => {
        assert.equal(f, data.thing);
        return Promise.resolve(serial_data);
      }
    })
		.then(d => {
			assert.equal(serial_data, d.thing);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.equal(s.thing, serial_data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("get one $fileable Instantiable from file", () => {
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

		return DataModel.remodel({
      data: data,
      model: model,
      loadFileable: f => {
        assert.equal(f, filename);
        return Promise.resolve(`{ data: "Beans" }`);
      }
    })
		.then(d => {
			assert(d.thing instanceof Instantiable);
			assert.equal("Beans", d.thing.data);
			assert.equal(filename, d.thing.$read_from);
			return DataModel.getSerialisable(d, model);
		})
		.then(s => {
			assert.deepEqual(s, serial_data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("get $fileable array of Instantiable from file", () => {
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
		
		return DataModel.remodel({
      data: data, model: model,
      loadFileable: f => {
        assert.equal(f,"arrayOfInstantiable.txt");
        return Promise.resolve(`[{data:"Beans"},{data:"Cheese"},{data:"Sausages"}]`);
      }
    })
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
			assert.deepEqual(s, serial_data);
		});
	});

	////////////////////////////////////////////////////////////////

	it("get $fileable map of Instantiable from file", () => {
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
        '$read_from': 'mapOfInstantiable.txt'
 			}
		};
		
		return DataModel.remodel({
      data: data,
      model: model,
      loadFileable: f => {
        assert.equal(f, filename);
        return Promise.resolve(JSON.stringify(serial_data.thing));
      }
    })
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
			assert.deepEqual(s, serial_data);
		});
	});

	////////////////////////////////////////////////////////////////

	const saveModel = () => {
    return {
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

	it("saveData on root", () => {
		return new Promise(resolve => {
			Fs.unlink(savedFile)
			.catch(e => resolve())
			.then(() => resolve());
		})
		.then(() => DataModel.saveData(saveData, saveModel(), "/"))
		.then(state => {
			assert(state instanceof Array);
			assert.equal(0, state.length);
		})
		.then(() => Fs.readFile(savedFile))
		.then(rootData => {
			let reread;
      eval(`reread=${rootData.toString()}`);
			assert.deepEqual(saveData, reread);
		});
	});

	it("saveData on leaf", () => {
		return new Promise(resolve => {
			Fs.unlink(savedFile)
			.catch(e => resolve())
			.then(() => resolve());
		})
		.then(() => DataModel.saveData(saveData, saveModel(), "array"))
		.then(state => {
			assert(state instanceof Array);
			assert.equal(0, state.length);
		})
		.then(() => Fs.readFile(savedFile))
		.then(rootData => {
			let reread;
      eval(`reread=${rootData.toString()}`);
			assert.deepEqual(saveData, reread);
		});
	});

	it("saveData on $fileable map", () => {
		const annotatedModel = extend({},	saveModel());
		annotatedModel.map.$fileable = true;

		const annotatedData = extend({}, saveData);
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
			let reread;
      eval(`reread=${rootData.toString()}`);
			assert.deepEqual(annotatedData.map, reread);
		});
	});

  it("loadData", () => {
		const model = {
			$map_of: {
        $fileable: true,
				data: {
          $class: String,
          $doc: "nerf"
        },
				$doc: "meelf"
			}
		};
    const expect = {
      a: { data: 'Beans' },
      b: { data: 'Cheese' },
      c: { data: 'Beans', '$read_from': 'oneInstantiable.txt' },
      '$read_from': `${__dirname}/mapOfInstantiable.txt`
    };

    const filename = `${__dirname}/mapOfInstantiable.txt`;
    return DataModel.loadData(filename, model)
    .then(data => assert.deepEqual(data, expect));
  });
});
