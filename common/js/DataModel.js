/*@preserve Copyright (C) 2016-2017 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

define("common/js/DataModel", ["common/js/Utils"], function(Utils) {

	const TAG = "DataModel";

	var fs, Fs;

	function _loadFs() {
		if (typeof fs === "undefined") {
			fs = require("fs");
			Fs = fs.promises;
		}
	}
	
    /**
     * Provides a way to deserialise a datastructure from JSON data
     * such that the resultant deserialised data obeys a specific data
     * model.
     *
     * The data is read from JSON. On load this data is post-processed
     * under the guidance of the spec, to validate the structure, and
     * instantiate any required class members.
     *
     * The data model is a recursive description of the data. The data can
     * contain simple Javascript types (number, string etc), objects, and
     * arrays. Function and Symbol objects are not supported.
     *
     * Keywords in the model, starting with $, are used to control the
     * checking and expansion, while other simple names are used for fields
     * in the modelled data.
     *
     * For example, we might want to load a simple data structure which
     * can have a single field, "id:", which must have a string value.
     * ```
     * {
     *   id: "28-0316027f81ff",
     * }
     * ```
     * this is modelled as follows:
     * ```
     * {
     *   id: { $class: String, $doc: "unique id" }
     * }
     * ```
     * Names that don't start with $ (such as `id` in the example) are
     * keys that are expected to be found in the data. The model maps these
     * to the epected type of the data.
     *
     * $keywords in the example define the type of the datum ($class)
     * and a block of documentation ($doc).
     *
     * Keywords include:
     *   $class - type of the datum (as returned by typeof, defaults
     *   to "object")
     *   $doc - a documentation string for the datum
     *   $optional - this datum is optional
     *   $default: default value, if not defined and not $optional
     *   $skip - skip deeper checking of this item
     *   $map_of - object is an associative array of elements, each of
     *   which has this model.
     *   $array_of - true if object is an integer-index list of elements, each
     *   of which has this model.
     *
     * for example,
     * ```
     *   ids: {
     *     $doc: "set of ids",
     *     $map_of: { id: { $class: String } }
     *   }
     * ```
     * specifies an array an array of simple objects, e.g.
     * ```
     * ids: { a: { id: "sam" }, b: { id: "joe" } }
     * ```
     * or using json shorthand for an integer key,
     * ```
     * ids: [ { id: "sam" }, { id: "joe" } ]
     * ```
     * you can also instantiate classes. For example,
     * ```
     * {
     *    location: {
     *       $class: Location,
     *       $doc: "Location of the event"
     *    }
     * }
     * ```
     * specifies data that might look like this:
     * { location: { latitude: 53.2856, longitude: -2.5678 } }
     * when this is loaded, the Location constructor is called, thus
     * ```
     * Location({string} key, {object} data, {object} spec)
     * ```
     * and the key value in the final structure is replaced with the created
     * object.
     *
     * Note that currently $class must be undefined if $array_of is defined.
     * A future extension may be to use $class to template objects that subclass
     * array - this is left open.
     *
     * Classes may want to decorate the spec with other $keys.
     * for example, the DataModel.File class uses the $mode key to specify
     * the modes that will be used with a file (see DataModel.File below)
     *
     * Models could be declared flat, but the convention is adopted
     * to break them down so that the model associated with a given
     * object is given alongside in class, using the key "spec". for example,
     * ```
     * function Thing(key, model, spec) { ... }
     *
     * Thing.Model = {
     *    $class: Thing,
     *    ...
     * };
     * ```
     * this can then be referred to in another model e.g
     * ```
     * things: {
     *    $array_of: Thing.Model,
     *    $doc: "list of things"
     * }
     * ```
     * Note that "undefined" is not regarded as a useful value. If the
     * value of a field is undefined, the key for that field will be dropped.
     * @namespace
     */
    let DataModel = {
		// meta keys valid in the model
        modelMetaKeys: {
            $array_of: true,
            $checked: true,
            $class: true,
            $default: true,
            $doc: true,
			$instantiable: true,
            $map_of: true,
            $optional: true,
            $skip: true
        },
		// meta keys valid in data
		dataMetaKeys: {
			$instance_of: true
		},
		// basic types
        builtin_types: [
            Boolean,
            Number,
            Date,
            String,
            RegExp
        ],
    };

    /**
     * Check the model for correct construction. Not recursive.
     * @param model the model to check
     * @param context undefined or an array
     * @private
     */
    DataModel.check = (model, context) => {
        if (model.$checked)
            return;

        if (typeof context === "undefined")
            context = [];

        if (typeof model !== "object")
            throw new Error(
				`typeof=="${typeof model}" at '${context.join('.')}'`);

        //Utils.TRACE(TAG, "check <",context.join('.'),"> {");

		if (model.$instantiable && typeof model.$class !== "undefined")
            throw new Error(`$instantiable and $class are mutually exclusive at '${context.join('.')}'`);

        let is_base = false;
        if (typeof model.$class === "function") {
				
            if (DataModel.builtin_types.indexOf(model.$class) >= 0) {
                // Internal fields not supported
                is_base = true;
            }
            // Currently cannot have both $array_of and $class
            if (typeof model.$array_of !== "undefined")
                throw new Error(
					"Cannot have both $array_of and $class");

        } else if (typeof model.$class !== "undefined") {
            throw new Error(
				`$class is ${typeof model.$class} at '${context.join('.')}'`);
        }

        model.$checked = true;

        if (!model.$skip) {
            if (typeof model.$array_of !== "undefined") {
                if (typeof model.$map_of !== "undefined")
                    throw new Error(
						`Cannot have $array_of and $map_of at '${context.join('.')}'`);
                DataModel.check(model.$array_of, context.concat("[]"));
            } else if (typeof model.$map_of !== "undefined")
                DataModel.check(model.$map_of, context.concat("{}"));
            else {
                for (let i in model) {
                    if (i.charAt(0) !== '$') {
                        if (is_base)
                            throw new Error(
								`Bad model: ${model.$class.name} has field ${i} at '${context.join('.')}'`);
                        DataModel.check(model[i], context.concat(i));
                    }
                }
            }
        }
        //Utils.TRACE(TAG, "} <",context.join('.'),">");
    };

    /**
     * Return a promise to test the given model against the given
	 * data structure, checking data against the model and constructing
	 * objects as required.
     * @param {object} data The data being loaded
     * @param {index} The index of the structure in the parent object. This
     * will be a number for an array entry, or a key for a hash, and is used
     * to pass to constructors for named objects.
     * @param {object} model the model
     * @param {string[]} context The context of the check, used in messages only
     * @return a promise that resolves to the data (or the default, if one
	 * was applied)
     */
    DataModel.remodel = (index, data, model, context) => {

        DataModel.check(model);

        if (index === "_readFrom")
            return Promise.resolve(data);

        if (typeof context === "undefined")
            context = [];

        Utils.TRACE(`${TAG}Details`, `Remodel '${context.join('.')}' `, data);

        // Got a data definition
        if (typeof data === "undefined") {
            if (model.$optional)
				return Promise.resolve(data);

            if (typeof model.$default === "undefined")
                return Promise.reject(new Error(
					`'${context.join(".")}' not optional and no default`));
            else
                data = model.$default;
        }

        if (model.$skip) {
			Utils.TRACE(`${TAG}Details`, `\t$skip '${context.join('.')}'`);
            return Promise.resolve(data);
		}
        
        if (typeof model.$map_of !== "undefined") {
			Utils.TRACE(`${TAG}Details`, `\t$map_of ${model.$map_of}`);
			
            // Object with keys that don't have to match the model,
            // and values that can be undefined
			let promises = [];
			let keys = [];
            for (let key in data) {
				promises.push(DataModel.remodel(
					key, data[key], model.$map_of, context.concat(key)));
				keys.push(key);
            }
			return Promise.all(promises)
			.then((result) => {
				let rebuilt = {};
				for (let i in result)
					rebuilt[keys[i]] = result[i];
				return rebuilt;
			});

        }

		if (typeof model.$array_of !== "undefined") {
			Utils.TRACE(`${TAG}Details`, `\t$array_of ${model.$array_of}`);
			let promises = [];
            for (let i in data) {
                // undefined is allowed in array data
                promises.push(DataModel.remodel(
                    i, data[i], model.$array_of, context.concat(i)));
            }
			// Promise.all will rebuild to an array, exactly what we want
            return Promise.all(promises);
        }

        if (DataModel.builtin_types.indexOf(model.$class) >= 0)
            return Promise.resolve(data);
        
        // Not a base type, so the model describes what has to be passed
        // to the constructor (if there is one)
		let promise;
		
        if (typeof data === "object") {
			
			let promises = [];
            // Keep data meta-keys, and make sure the data doesn't
			// carry any hidden payload
            for (let i in data) {
                if (model[i])
					continue;
				// If $instance_of is set we have no way of validating the
				// fields yet, so preserve them all. Also preserve all
				// meta-keys. Anything else is regarded as hidden payload.
				if (data.$instance_of || DataModel.dataMetaKeys[i])
					promises.push({ key: i, data: data[i]});
				else
					return Promise.reject(
						new Error(
							`Hidden payload '${i}' in ` + Utils.dump(data) + ` at ${context.join('.')}`));
            }

			// Promise to rebuild each data field
            for (let key in model) {
                if (!DataModel.modelMetaKeys[key]) {
                    promises.push(
						DataModel.remodel(
							key, data[key], model[key], context.concat(key))
						.then((rebuilt) => {
							return { key: key, data: rebuilt }
						}));
                }
            }
			
			promise = Promise.all(promises)
			.then((result) => {
				let rebuilt = {};
				for (let i in result) {
					let res = result[i];
					
                    if (typeof res.data !== "undefined") {
                        // undefined is skipped in objects
                        rebuilt[res.key] = res.data;
						Utils.TRACE(`${TAG}Details`, `Rebuilt ${res.key}`);
					}
					else Utils.TRACE(`${TAG}Details`, `Filtered ${res.key}`);
				}
				return rebuilt;
			});
        } else
			promise = Promise.resolve(data);

		return promise
		.then((rebuilt) => {

			if (model.$instantiable) {
				let t = rebuilt.$instance_of;
				if (typeof t !== "string")
					throw new Error(`Expected $instance_of at '${context.join(".")}'`);
				
				Utils.TRACE(`${TAG}Details`,
							`Instantiate a ${rebuilt.$instance_of}`, rebuilt);
				
				// Building a type defined in the data. When we serialise,
				// it will record the type loaded, not the type in the
				// original data
				return new Promise((resolve, reject) => {
					requirejs([rebuilt.$instance_of], (module) => {
						let promise;
						if (typeof module.Model !== "undefined")
							promise = DataModel.remodel(
								index, rebuilt, module.Model, context);
						else
							promise = Promise.resolve(rebuilt);
						
						return promise
						.then((rebuilt) => {
							let sub = new module(rebuilt, index, module.Model);
							// Hack in where it came from
							sub.$instantiated_from = rebuilt.$instance_of;
							resolve(sub);
						});
					});
				});
			}
			
			if (typeof model.$class === "undefined")
				return Promise.resolve(rebuilt);

			Utils.TRACE(`${TAG}Details`,
						`Instantiate ${model.$class.name} ${index}`);

			// Have to pass index for building native types such
			// as String, Number, Date
			// Could call remodel, this is fractionally quicker
			return Promise.resolve(new model.$class(rebuilt, index, model));
		});
    };

    /**
     * Promise to extract a serialisable version of a data structure
     * under guidance of the model as text, such that the data can be
     * reloaded using DataModel.load
     * @param {object} data data to get a serialisable version of
     * @param {object{ model data model to follow
	 * @return a promise that resolves to the serialisable data structure
     */
    DataModel.getSerialisable = (data, model, context) => {
        DataModel.check(model);

        // context is an internal parameter used for generating
        // meaningful errors
        if (typeof context === "undefined")
            context = [];

        if (typeof data === "undefined") {
            if (typeof model !== "undefined" && model.$optional) {
                return Promise.resolve();
            }
            throw new Error(
				`${context.join('.')} is not optional`);
        }

        if (model.$skip) {
            if (typeof data === "object" &&
                typeof data.getSerialisable === "function") {
                // objects can override getSerialisable
                // Could also use model.prototype.getSerialisable
                return data.getSerialisable(context);
            }
            return Promise.resolve(data);
        }

        if (typeof data !== "object")
            return Promise.resolve(data);

        if (typeof model.$array_of !== "undefined") {
            // Serialise all entries in the object, it's an array
            if (typeof data[Symbol.iterator] !== 'function')
                throw new Error(
					`Iterable expected at ${context.join('.')}=${data}`);
            let promises = [];
            for (let index in data) {
                promises.push(
                    DataModel.getSerialisable(
                        data[index], model.$array_of,
                        context.concat(index)));
            }
            return Promise.all(promises);

        } else if (typeof model.$map_of !== "undefined") {
            if (typeof data !== "object")
                throw new Error(
					`Map expected at ${context.join('.')}=${data}`);
            let promises = [];
            for (let key in data) {
                promises.push(
					DataModel.getSerialisable(
						data[index], model.$map_of,
						context.concat(index))
					.then((ser) => { return { key: key, serialised: ser }; }));
            }
			return Promise.all(promises).then((s) => {
				let res = {};
				for (let i in s)
					res[s[i].key] = s[i].serialised;
				return res;
			});
 
		} else if (typeof model.$class === "function" &&
                   typeof data.getSerialisable === "function") {
            // objects can override getSerialisable
            // Could also use model.prototype.getSerialisable
            return data.getSerialisable(model);
        } else if (DataModel.builtin_types.indexOf(model.$class) >= 0) {
            return Promise.resolve(data);
        }

		let promises = [];
		if (model.$instantiable)
			promises.push(Promise.resolve({
				key: "$instance_of", serialised: data.$instantiated_from}));
        // Only serialise fields described in the model. All other fields
        // in the object (except $instance_of) are ignored.
        for (let key in model) {
            if (DataModel.modelMetaKeys[key])
                continue;
            promises.push(
                DataModel.getSerialisable(
                    data[key], model[key],
                    context.concat(key))
				.then((ser) => { return { key: key, serialised: ser };}));
		}

		return Promise.all(promises)
		.then((s) => {
			let res = {};
			for (let i in s)
				if (typeof s[i].serialised !== "undefined")
					res[s[i].key] = s[i].serialised;
			return res;
		});
    };

    /**
     * Follow the path from the root to the node at the end of the path,
     * and call a function on the the root of the subtree there, and the
     * model that describes it. Will throw if the path does not describe a
     * node with a corresponding model.
     * @param {object} root the root of the tree
     * @param {object} model the root of the model that describes the tree
     * @param path either a path expresses as a /-separated
     * string or an already-split array of path components.
     * @param {function} fn (node, subtreemodel, parentnode, key)
     * where node is the root of the subtree, nodemodel is the model for the
     * subtree, parentnode is the node that contains the subtree and key is
     * the key for the subtree in the parent. parentnode and key will be
     * undefined if the path is empty.
     * @return a promise with the result of the call to fn
     */
    DataModel.at = (root, model, path, fn) => {
        if (typeof path === "string") {
            // Convert string path to array of path components
            path = path.split(/\/+/);
            while (path.length > 0 && path[0].length == 0)
                path.shift();
        }

        DataModel.check(model);

        let node = root;
        let node_model = model;
        let parent;
        let key;

        // Walk down the node and model trees
        let i = 0;
        while (i < path.length) {
            if (typeof node === "undefined")
                throw new Error(`No node at ${path.join('.')}[${i}]`);
            if (typeof node_model === "undefined")
                throw new Error(`No model at ${path.join('.')}[${i}]`);
            parent = node;
            key = path[i++];
            node = node[key];
            if (typeof node_model.$array_of !== "undefined")
                node_model = node_model.$array_of;
            else if (typeof node_model.$map_of !== "undefined")
                node_model = node_model.$map_of;
            else
                node_model = node_model[key];
        }
        if (i < path.length)
            throw new Error(`Could not find '${path.join('.')}'`);
        return Promise.resolve({node: node, model: node_model, parent: parent, key: key});
    };

    /**
     * Promise to load data that observes the given data model
     * from a file.
     * @param file the file to load from
     * @param {object} model the data model to check against
     * @return {promise} promise that returns the loaded data
     * @public
     */
    DataModel.loadData = (file, model) => {
        DataModel.check(model);
		_loadFs();
		Utils.TRACE(TAG, `Loading ${file}`);
        return Fs.readFile(file)
        .then((code) => DataModel.remodel("", Utils.eval(code, file), model))
		.then((rebuilt) => {
			rebuilt._readFrom = file;
			return rebuilt;
        });
    };

    /**
     * Promise to save that part of the data as is specified by the model
     * to a file
     * @param {object} data the data to save
     * @param {object} model the data model
     * @param file file to write to, or undefined to rewrite the
     * file the data was read from.
     * @return {promise} promise that returns after saving
     */
    DataModel.saveData = (data, model, file) => {
        "use strict";

		_loadFs();

        DataModel.check(model);

        if (typeof file === "undefined")
            file = this._readFrom;

        return DataModel.getSerialisable(data, model)
        .then((remod) => Fs.writeFile(
            Utils.expandEnvVars(file),
            JSON.stringify(remod, null, 2), "utf8"));      
    }

    /**
     * Generate the help string for the given model
     * @param {object} model the data model to generate help for
     */
    DataModel.help = (model, index) => {
        DataModel.check(model);
		
        // index is used for formatting and is not visible to callers
        function indent(s) {
            return s.replace(/\n/g, "\n ");
        }

        let docstring = [];

        if (index)
            docstring.push(index + ":");

        if (typeof model === "function")
            return `<${model.name}>`;

        if (model.$optional)
            docstring.push("(optional)");
		let recurse = true;
        if (typeof model.$class !== "undefined") {
            if (typeof model.$class === "string")
                docstring.push('<' + model.$class + '>');
            else if (typeof model.$class === "function")
                docstring.push('<' + model.$class.name + '>');
            else
                docstring.push(model.$class); // wtf?

			recurse = (DataModel.builtin_types.indexOf(model.$class) < 0);
        }

		if (model.$instantiable)
			docstring.push('(instantiable)');
		
        if (typeof model.$doc === "string")
            docstring.push(model.$doc);

		if (recurse) {
			if (typeof model.$array_of !== "undefined") {
				docstring.push('[\n');
				docstring.push(indent(DataModel.help(model.$array_of)));
				docstring.push("\n]");
			} else if (typeof model.$map_of !== "undefined") {
				let sub = DataModel.help(model.$map_of);
				if (sub.length > 0) {
					docstring.push('{\n');
					docstring.push(indent(sub));
					docstring.push("}\n");
				}
			} else {
				let sub = [];
				for (let i in model) {
					if (i.charAt(0) !== '$')
						sub.push(DataModel.help(model[i], i));
				}
				if (sub.length > 0) {
					docstring.push("{\n");
					docstring.push(indent(sub.join('\n')));
					docstring.push("\n}");
				}
			}
		}
        return docstring.join(' ').replace(/ +\n/g, "\n");
    }

    /* Inner classes, helpers for file operations */

    /**
     * DataModel inner class for handling filenames specified in serialisable
	 * data.
	 * 
     * The constructor uses the $mode (default "r") specified in the
     * model to verify the status of the target file. This supports the
     * following modes:
     * e: the file must exist
     * r: the file must be readable
     * w: the file must be writable
     * x: the file must be executable
     * @param filename the file name
     * @param index the name passed to the constructor by DataModel
     * @param {object} model the model for this file
     * @class
     */
    class File {

        constructor(filename, index, model) {
            this.data = filename;

			_loadFs();
			
            if (typeof model === "undefined")
				return;
			
            // Got a model to check against. This should always be the case
            // except in tests.
            let fnm = Utils.expandEnvVars(filename);
			this.path = fnm;
			
            let $mode = model.$mode;
            if (typeof $mode === "undefined")
                $mode = "r";
            
            let mode = fs.constants.F_OK;

            if ($mode.indexOf("r") >= 0)
                mode = mode | fs.constants.R_OK;

            if ($mode.indexOf("x") >= 0)
                mode = mode | fs.constants.X_OK;

            if ($mode.indexOf("e") >= 0 && !fs.existsSync(fnm)) {
                throw new Error(`Bad ${index}: '${filename}' does not exist`);
            }

            if ($mode.indexOf("w") >= 0) {
                mode = mode | fs.constants.W_OK;

                if (fs.existsSync(fnm)) {
                    fs.access(
						fnm, mode,
                        (err) => {
                            if (err)
                                throw new Error(
                                    `Bad ${index}: '${filename}' '$mode' mode check failed: ${err}`);
                        });
                }
            } else if ($mode.indexOf("w") >= 0) {
                // Just make sure we can write, and clear down the file
                fs.writeFileSync(fnm, "", {
                    mode: mode
                });
            }
        }

        /**
         * Generate a simple string representation of this object suitable
         * for use in debugging and in serialisation
         */
        toString() {
            return this.data;
        }

        /**
         * Promise to write a new value to the file
         * @param value new data to write to the file
         */
        write(value) {
			_loadFs();
            return Fs.writeFile(this.path, value, "utf8");
        }

        /**
         * Promise to read the file
         */
        read() {
			_loadFs();
            return Fs.readFile(this.path);
        };

		/**
		 * Get the expanded pathname to the file
		 */
		getPath() {
			return this.path;
		}
		
        getSerialisable() {
            return Promise.resolve(this.data);
        }
    }

    File.Model = {
        $class: File,
        $doc: "Filename"
    };

    DataModel.File = File;

    /**
     * Subclass of DataModel.File representing a datum that can either
     * be a simple text string, or a file name.
     * When the object is constructed, if the string in the data is a
     * valid existing filename, then the object is assumed to refer to a file.
     * Otherwise it is assumed to be raw text data.
     * The $mode of the model is assumed to be at least "er"
     * @param data either a file name or raw data
     * @param index the name passed to the constructor by DataModel
     * @param {object} model the model for the datum
     * @class
     */
    class TextOrFile extends File {
        
        constructor(textOrFile, index, model) {
            super(textOrFile, index, model);
            this.is_file = fs.existsSync(Utils.expandEnvVars(textOrFile));
        }

        /**
         * Promise to read the datum
         */
        read() {
            if (this.is_file)
                return super.read();
            else {
                return Promise.resolve(this.data);
            }
        }

        /**
         * Promise to update the datum
         * @param value new value to store in the datum
         */
        write(value) {
            if (this.is_file)
                return super.write(value);
            else {
                this.data = value;
                return Promise.resolve(true);
            }
        }
    }

    TextOrFile.Model = {
        $class: TextOrFile,
        $doc: "Filename or plain text"
    };

    DataModel.TextOrFile = TextOrFile;

    return DataModel;
});
