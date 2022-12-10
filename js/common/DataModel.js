/*@preserve Copyright (C) 2016-2022 Crawford Currie http://c-dot.co.uk license MIT */

/*eslint-env node */

define([ "js/common/Utils" ], Utils => {

  const TAG = "DataModel";

  // Demand-load Fs, node.js only
  let Fs, Path;
  function _loadFs() {
    if (!Fs) {
      Fs = require("fs").promises;
      Path = require("path");
    }
  }

  // meta keys valid in the model
  const MODEL_META_KEYS = {
    $array_of: true,
    $$checked: true, // internal use only
    $class: true,
    $default: true,
    $doc: true,
    $fileable: true,
    $instantiable: true,
    $map_of: true,
    $optional: true,
    $unchecked: true
  };

  // meta keys valid in data
  const DATA_META_KEYS = {
    $instance_of: true,
    $read_from: true
  };

  // basic types
  const BUILTIN_TYPES = [
		Boolean,
		Number,
		Date,
		String,
		RegExp
	];

  /**
	 * Support for complex loadable/savable data structures. The
	 * goal is to support loading of complex JSON configuration
	 * data with minimum coding in the configured classes.
	 *
	 * Supports distributing the configuration data across
	 * several external files, for both load and save.

	 * A configuration data tree is read using `loadData`. This data
	 * is processed under the guidance of the spec, to validate the
	 * structure, and instantiate any required class members. The data
	 * is optionally instrumented with meta-data allowing
	 * reconstruction of objects not defined in the spec, and ensure
	 * the data is saved back to the file it came from.
	 *
	 * The data can contain simple Javascript types (number, string
	 * etc), Javascript objects, and arrays. Function and Symbol
	 * objects are not supported.
	 *
	 * The data model is described in an object using keys that start
	 * with $. These are used to control checking and expansion, and
	 * reading from/writing to files. Any field name not recognised as
	 * metadata is treated as the description of a field in the
	 * modelled data.
	 *
	 * ##### Built-in types and `$doc`
	 * For example, we might want to load a simple
	 * configuration which can have a single field, "id:", which must have
	 * a string value:
	 * ```
	 * {
	 *   id: "28-0316027f81ff",
	 * }
	 * ```
	 * this can described in the model object as follows:
	 * ```
	 * {
	 *   id: { $class: String, $doc: "unique id" }
	 * }
	 * ```
	 * Names that don't start with $ (such as `id` in the example) are
	 * keys that must be to be found in the data.
	 *
	 * The $keywords in the example define the type of the datum (`$class`)
	 * and a block of documentation (`$doc`). In this case the `$class` is
	 * the Javascript built-in class `String`.
	 *
	 * ##### `$class`
	 * You can also instantiate your own classes. For example, the model:
	 * ```
	 * {
	 *    location: {
	 *       $class: Location,
	 *       $doc: "Location of the event"
	 *    }
	 * }
	 * ```
	 * specifies data that might look like this:
	 * ```
	 * { location: { latitude: 53.2856, longitude: -2.5678 } }
	 * ```
	 * when this is loaded, the `Location` constructor is called with the
	 * signature:
	 * ```
	 * Location({string} key, {object} data, {object} model)
	 * ```
	 * and the value in the processed structure is replaced with the
	 * created object.
	 *
	 * ##### `$array_of` and `$map_of`
	 * Array and Map structures are described using the keywords
	 * `$array_of` and `$map_of` respectively. For example:
	 * ```
	 *   ids: {
	 *     $doc: "set of ids",
	 *     $array_of: { $class: String }
	 *   }
	 * ```
	 * describes an array of Strings:
	 * ```
	 * [ "jane", "sam", "joe", "marion" ]
	 * ```
	 * Maps are similar. Only String keys are supported.
	 * ```
	 *   auth: {
	 *     $doc: "Authentication information",
	 *     $map_of: { $class: String }
	 *   }
	 * ```
	 * describes a map of Strings:
	 * ```
	 * auth: { user: "cusack", pass: "joanie", "first school": "rock" }
	 * ```
	 * ##### `$fileable`
	 * File saving/loading is controlled by the `$fileable` key. Where
	 * the model has `$fileable: true` it signals that the value of the
	 * described field can be replaced by a string with the name of
	 * a file that the datum can be read from. For example,
	 * ```
	 * {
	 *   locations: {
	 *     $doc: "array of locations",
	 *     $map_of: Location,
	 *     $fileable: true 
	 * }
	 * ```
	 * The configuration data can contain:
	 * ```
	 * {
	 *    locations: "$HOME/my/locations.dat"
   * }
   * ```
	 * * field, and a matching file exists, then the map will be read
	 * from that file. The data read is then annotated with the source file
	 * using the `$read_from` metadata giving the filename. Filenames
	 * can include environment variables, such as `$PWD` and `$HOME`.
	 *
	 * Note that while it is possible to *load* an array this way, it is
	 * *not* possible to *save* it again, as arrays do not carry the
	 * `$read_from` meta-data. If you want to save an array this way, you
	 * should wrap it with an object.
   *
	 * Data saving works by writing serialised data back to
	 * files. Saving can be triggered at any point in the data
	 * hierarchy. When `DataModel.saveData` is called on the path to a
	 * field, it will inspect the the data for that field for a
	 * `$read_from` metadatum. If it is not found, then the parent
	 * node in the spec will be recursively inspected until a
	 * `$read_from` annotation is found. If the root is reached
	 * without a `$read_from` being found, the save will fail. Note
	 * that while it is possible to builtin type value (String, Number
	 * etc) and arrays, saving these types is not supported; only
	 * Javascript objects (including user class objects) are annotated
	 * with `$read_from`.
	 *
	 * ##### `$default` and `$optional`
	 * Fields in the data can be given default values in the model
	 * using `$default: value`, and can be specified as optional using
	 * `$optional: true`.
	 *
	 * ##### `$instantiable`
	 * In the case where the exact type of an object is not known to
	 * the model, then `$instantiable: true` can be used. In this
	 * case, the data must be decorated with a `$instance_of`
	 * annotation that tells the code how to instantiate this
	 * object. `$instance_of` should be the name of a Javascript
	 * class, as required by `requirejs`. For example, given the model
	 * ```
	 * {
	 *   thing: {
   *     $instantiable: true,
   *     data: { $class: String }
	 *   }
	 * }
	 * ```
	 * and the data
	 * ```
	 * {
	 *   thing: {
   *     $instance_of: "my/js/example",
   *     data: "Some data"
	 *   }
	 * }
	 * ```
	 * when this data is read, it will use `requirejs` to load the
	 * `my/js/example` class, and instantiate it, using the same
	 * constructor arguments as described for `$class`, above.
	 *
	 * ##### `$unchecked`
	 * Finally if you need to load an object that has no known class,
	 * you can use `$unchecked`. For example, to load a simple
	 * structure such as:
	 * ```
	 * {
	 *   auth: {
	 *     user: "brian", pass: "eno"
	 *   }
	 * }
	 * ```
	 * we can use the model
	 * ```
	 * {
	 *   auth: {
	 *     $unchecked: true
   *   }
   * }
	 * ```
	 *
	 * ##### Models in code
	 * Note that a sensible convention is to associate the model with
	 * the class definition. For example,
	 * ```
	 * class Thing {
	 *   constructor(key, model, spec) { ... }
	 *   ...
	 * }
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
	 * Note that "undefined" is not regarded as a useful value in
	 * data. If the value of a field is undefined, the key for that
	 * field will be dropped.
	 *
	 * @namespace
	 */
  class DataModel {

    /**
     * Check the model for correct construction.
     * @param {DataModel} model the model to check
     * @param {Array} context path to node being checked (may be undefined)
     * @private
     */
    static check(model, context) {

      if (model.$$checked)
        return;

      function fail(mess) {
        throw new Error(`${TAG}.check: ${mess} at '${context.join('.')}'`);
      }

      if (typeof context === "undefined")
        context = [];

      if (typeof model !== "object")
        fail(`typeof=="${typeof model}"`);

      if (model.$instantiable && typeof model.$class !== "undefined")
        fail("$instantiable and $class are mutually exclusive");

      if (typeof model.$array_of !== "undefined" &&
          typeof model.$map_of !== "undefined")
        fail("$array_of and $map_of are mutually exclusive");

      if (typeof model.$array_of !== "undefined" &&
          typeof $class !== "undefined")
        fail("Cannot have both $array_of and $class");

      let is_builtin = false;
      if (typeof model.$class === "function") {
        // The datum being described has a class
        if (BUILTIN_TYPES.indexOf(model.$class) >= 0) {
          // It's a built-in type e.g. String, RegExp, Date etc.
          // Internal fields are not supported
          is_builtin = true;
        }
      } else if (typeof model.$class !== "undefined")
        fail(`$class is ${typeof model.$class}`);

      model.$$checked = true; // model has been checked

      if (model.$unchecked)
        // model specifies that content can't be checked
        return;

      // Contents are required to be modeled
      if (typeof model.$array_of !== "undefined") {
        // Check the model for the array contents
        DataModel.check(model.$array_of, context.concat("[]"));
      } else if (typeof model.$map_of !== "undefined")
        // Check the model for the map values. The keys
        // are not modeled.
        DataModel.check(model.$map_of, context.concat("{}"));
      else {
        // Examine fields in the object
        for (let i in model) {
          if (i.match(/^\$/))
            continue;
          // Not a metadata key
          if (is_builtin)
            // Builtin types e.g. String may not have
            // internal fields
            fail(`builtin type ${model.$class.name} has field ${i}`);
          DataModel.check(model[i], context.concat(i));
        }
      }
    }

    /**
     * Promise to process the given data structure, checking data
     * against the model, constructing objects, and loading
     * referenced files, as required.
     * @param {object} args arguments
     * @param {object} args.data The data being loaded
     * @param {index} args.index index of the structure in the parent
     * object. This will be a number for an array entry, or a key
     * for a hash, and is used to pass to constructors for named
     * objects.
     * @param {object} args.model the model
     * @param {string[]} args.context The context of the check, used in
     * messages only
     * @param {function?} args.loadFileable function used to resolve
     * $fileable paths. Takes the path and returns a promise that 
     * resolves to the text of the file.
     * @return {Promise} a promise that resolves to the data (or the
     * default, if one was applied)
     */
    static remodel(args) {

      const model = args.model;
      let data = args.data;
      const context = args.context || [];
      const index = args.index ? args.index : "";
      const loadFileable = args.loadFileable
      ? args.loadFileable : f => Promise.resolve(f);

      DataModel.check(model);

      function fail(mess) {
        return Promise.reject(
          new Error(
            `${TAG}.remodel: ${mess} at '${context.join('.')}'`));
      }

      // Load from a file name if the model allows it
      if (model.$fileable && typeof data === "string") {
        
        Utils.TRACE(TAG, `Loading ${index} from file ${data}`);
        return loadFileable(data)
        .catch(e => data)
        .then(content => {
          if (BUILTIN_TYPES.indexOf(model.$class) >= 0)
            return Promise.resolve(content);
          if (typeof content === "undefined")
            return undefined;
          content = Utils.eval(content.toString(), data);
          return DataModel.remodel({
            index: index,
            data: content,
            model: model,
            loadFileable: loadFileable
          })
          .then(rebuilt => {
            if (rebuilt instanceof Object &&
                !(rebuilt instanceof Array))
              rebuilt.$read_from = data;
            return rebuilt;
          });
        });
      }

      if (index === "$read_from")
        return Promise.resolve(data);

      Utils.TRACE(
        `${TAG}Details`, `Remodel '${context.join('.')}' `, data);

      // Got a data definition
      if (typeof data === "undefined") {
        if (model.$optional)
          return Promise.resolve(data);

        if (typeof model.$default === "undefined")
          return fail("field not optional and no default");
        else
          data = model.$default;
      }

      if (model.$unchecked) {
        // Don't remodel data under this node
        Utils.TRACE(`${TAG}Details`, `\t$unchecked '${context.join('.')}'`);
        return Promise.resolve(data);
      }

      if (typeof model.$map_of !== "undefined") {
        Utils.TRACE(`${TAG}Details`,
                    `\tbuild $map_of ${model.$map_of}`);

        // Object with keys that don't have to match the model,
        // and values that can be undefined
        const promises = [];
        const keys = [];
        for (let key in data) {
          promises.push(DataModel.remodel({
            index: key,
            data: data[key],
            model: model.$map_of,
            context: context.concat(key),
            loadFileable: loadFileable
          }));
          keys.push(key);
        }
        return Promise.all(promises)
        .then(result => {
          const rebuilt = {};
          for (let i in result)
            rebuilt[keys[i]] = result[i];
          return rebuilt;
        });
      }

      if (typeof model.$array_of !== "undefined") {
        Utils.TRACE(`${TAG}Details`, `\t$array_of ${model.$array_of}`);
        const promises = [];
        for (let i in data) {
          // undefined is allowed in array data
          promises.push(DataModel.remodel({
            index: i,
            data: data[i],
            model: model.$array_of,
            context: context.concat(i),
            loadFileable: loadFileable
          }));
        }
        // Promise.all will rebuild to an array, exactly what we want
        return Promise.all(promises);
      }

      if (BUILTIN_TYPES.indexOf(model.$class) >= 0)
        return Promise.resolve(data);

      // Not a base type, so the model describes what has to be passed
      // to the constructor (if there is one)
      let promise;

      if (typeof data === "object") {

        const promises = [];

        // Keep data meta-keys, and make sure the data doesn't
        // carry any hidden payload
        for (let i in data) {
          if (model[i])
            continue;
          if (data.$instance_of || DATA_META_KEYS[i])
            // If $instance_of is set we have no way of
            // validating the fields yet, so preserve them
            // all. Also preserve all meta-keys.
            promises.push({
              key: i,
              data: data[i]
            });
          else if (typeof model.$class !== "undefined" &&
                   typeof model.$class.Model !== "undefined" &&
                   typeof model.$class.Model[i] !== "undefined") {
            // We could validate the fields now, but we
            // just leave it till later
            promises.push({
              key: i,
              data: data[i]
            });
          } else {
            // Anything else is regarded as hidden payload.
            return fail(`Hidden payload '${i}' in ` +
                        Utils.dump(data));
          }
        }

        // Promise to rebuild each data field
        for (let key in model) {
          if (!MODEL_META_KEYS[key]) {
            promises.push(
              DataModel.remodel({
                index: key,
                data: data[key],
                model: model[key],
                context: context.concat(key),
                loadFileable: loadFileable
              })
              .then(rebuilt => {
                return {
                  key: key,
                  data: rebuilt
                };
              }));
          }
        }

        promise = Promise.all(promises)
        .then(result => {
          const rebuilt = {};
          for (let i in result) {
            const res = result[i];

            if (typeof res.data !== "undefined") {
              // undefined is skipped in objects
              rebuilt[res.key] = res.data;
              Utils.TRACE(`${TAG}Details`, `Rebuilt ${res.key}`);
            } else
              Utils.TRACE(`${TAG}Details`, `Filtered ${res.key}`);
          }
          return rebuilt;
        });
      } else
        promise = Promise.resolve(data);

      return promise
      .then(rebuilt => {

        if (model.$instantiable) {
          const t = rebuilt.$instance_of;
          if (typeof t !== "string")
            return fail("Expected $instance_of");

          Utils.TRACE(`${TAG}Details`,
                      `Instantiate a ${rebuilt.$instance_of}`, rebuilt);

          // Building a type defined in the data. When we serialise,
          // it will record the type loaded, not the type in the
          // original data
          return new Promise(resolve => {
            requirejs([rebuilt.$instance_of], module => {
              let promise;
              if (typeof module.Model !== "undefined")
                promise = DataModel.remodel({
                  index: index,
                  data: rebuilt,
                  model: module.Model,
                  context: context,
                  loadFileable: loadFileable
                });
              else
                promise = Promise.resolve(rebuilt);

              return promise
              .then(rebuilt => {
                const sub = new module(rebuilt, index, module.Model);
                // Hack in where it came from, so it can be
                // deserialised
                if (typeof rebuilt.$instance_of !== "undefined")
                  sub.$instance_of = rebuilt.$instance_of;

                resolve(sub);
              });
            });
          });
        }

        if (typeof model.$class === "undefined")
          return Promise.resolve(rebuilt);

        // Have to pass index for building native types such
        // as String, Number, Date
        // Could call remodel, this is fractionally quicker
        const clss = model.$class;
        Utils.TRACE(`${TAG}Details`,
								    `Instantiate ${clss.name} ${index}`);
        return Promise.resolve(new clss(rebuilt, index, model));
      });
    };

    /**
     * Promise to extract a serialisable version of a data
     * structure under the direction of the model. The
     * serialisable version will be a simple structure (without
     * class information or types that can't be serialised).
     * @param {object} data data to get a serialisable version of
     * @param {object} model data model to follow
     * @return {Promise} a promise that resolves to the serialisable data structure
     */
    static getSerialisable(data, model, context) {
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

      if (model.$unchecked) {
        // Model not specified, just have to do our best
        if (typeof data === "object" &&
            typeof data.getSerialisable === "function") {
          // objects can define getSerialisable
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
        const promises = [];
        for (let index in data) {
          promises.push(
            DataModel.getSerialisable(
              data[index], model.$array_of,
              context.concat(index)));
        }
        return Promise.all(promises)
        .then(p => {
          Utils.TRACE(`${TAG}Details`, "Array loaded");
          return p;
        });

      } else if (typeof model.$map_of !== "undefined") {
        if (typeof data !== "object")
          throw new Error(
            `Map expected at ${context.join('.')}=${data}`);
        const promises = [];
        for (let key in data) {
          promises.push(
            DataModel.getSerialisable(
              data[key], model.$map_of,
              context.concat(key))
            .then(ser => {
              return {
                key: key,
                serialised: ser
              };
            }));
        }
        return Promise.all(promises).then(s => {
          const res = {};
          for (let i in s)
            res[s[i].key] = s[i].serialised;
          return res;
        });

      } else if (typeof model.$class === "function" &&
                 typeof data.getSerialisable === "function") {
        // objects can override getSerialisable
        // Could also use model.prototype.getSerialisable
        return data.getSerialisable(model);
      } else if (typeof model.$class === "function" &&
                 typeof model.$class.Model === "object") {
        // in the case where a datum was loaded from a file, we
        // end up with a field in the data that doesn't correspond
        // to the model (which simply shows the File model)
        model = model.$class.Model;
      } else if (BUILTIN_TYPES.indexOf(model.$class) >= 0) {
        return Promise.resolve(data);
      }

      const promises = [];

      // Retain $instance_of and $read_from in serialised data
      for (let mk in DATA_META_KEYS)
        if (typeof data[mk] !== "undefined")
          promises.push(Promise.resolve({
            key: mk,
            serialised: data[mk]
          }));

      // Default is to only serialise fields described in
      // the model, and metadata injected by this module.
      for (let key in model) {
        if (MODEL_META_KEYS[key])
          continue;
        Utils.TRACE(`${TAG}Details`, `Expand ${key}`);
        promises.push(
          DataModel.getSerialisable(
            data[key], model[key],
            context.concat(key))
          .then(ser => {
            return {
              key: key,
              serialised: ser
            };
          }));
      }

      if (model.$instantiable) {
        // An $instantiable is known to be an object, but we
        // may not know what type it is. We may be able to recover
        // the type from the data.
        for (let key in data) {
          if (MODEL_META_KEYS[key] || model[key])
            continue;
          promises.push(
            Promise.resolve({
              key: key,
              serialised: data[key]
            }));
        }
      }

      return Promise.all(promises)
      .then(s => {
        const res = {};
        for (let i in s)
          if (typeof s[i].serialised !== "undefined")
            res[s[i].key] = s[i].serialised;
        return res;
      });
    }

    /**
     * Follow the path from the root to the node at the end of the
     * path, kee[ping track of the position in the data and the
     * model. Will throw if the path does not describe a node with
     * a corresponding model.
     * @param {object} root the root of the data
     * @param {object} model the root of the model that describes the data
     * @param {string|string[]} path a path relative to the root, either a path
     * expressed as a `/` -separated string or an already-split array
     * of path components.
     * @return {object} The end of the path, as:
     * ```
     * {
     *   node: // the data node
     *   model: // the correspoding position in the model
     *   parent: // the node that is the parent of the data node
     *   key: // the key indexing the data node in the parent
     * }
     * ```
     */
    static at(root, model, path) {
      if (typeof path === "string") {
        // Convert string path to array of path components
        path = path.split(/\/+/);
        while (path.length > 0 && path[0].length == 0)
          path.shift();
      }

      // Don't bother to DataModel.check(model);
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
      return {
        node: node,
        model: node_model,
        parent: parent,
        key: key
      };
    }

    /**
     * Promise to load data that is expected to observe the given
     * data model from a file.
     * @param {string} file the file to load from
     * @param {object} model the data model to check against
     * @return {promise} promise that returns the loaded data. The
     * object will be annotated with `$read_from` to indicate where
     * it was read from (does not work for arrays or builtin types)
     */
    static loadData(file, model) {
      DataModel.check(model);
      _loadFs();
      Utils.TRACE(TAG, `Loading ${file}`);
      return Fs.readFile(file)
      .then(code => DataModel.remodel({
        data: Utils.eval(code, file),
        model: model,
        context: [ file ],
        loadFileable: f => {
          if (!Path.isAbsolute(f))
            f = Path.join(Path.dirname(file), f);
          return Fs.readFile(f);
        }
      }))
      .then(rebuilt => {
        if (typeof rebuilt === "object" &&
            !(rebuilt instanceof Array))
          rebuilt.$read_from = file;
        return rebuilt;
      });
    }

    /**
     * Promise to save that part of the data as is specified by the model
     * to a file. Will recursively track back up the path until a node
     * with `$read_from` is found, and will save to that file.
     * @param {object} root the root of the data
     * @param {object} model the root of the model that describes the data
     * @param {string|string[]} path a path relative to the root, either a path
     * expressed as a /-separated string or an already-split array
     * of path components.
     * @return {promise} promise that resolves to the saved path
     * (array of components) after saving
     */
    static saveData(root, model, path) {
      if (typeof path === "string") {
        // Convert string path to array of path components
        path = path.split(/\/+/);
        while (path.length > 0 && path[0].length == 0)
          path.shift();
      }

      // Note that we don't bother to DataModel.check. The data will
      // have been through DataModel.remodel, which does that job.

      // Walk up the node and model trees until we find a node
      // with $read_from
      let p = DataModel.at(root, model, path);
      while (path.length > 0 &&
             typeof p.node.$read_from === "undefined") {
        path.pop();
        p = DataModel.at(root, model, path);
      }
      if (!p.node.$read_from)
        return Promise.reject(new Error("DataModel.saveData: Cannot determine file to save to"));

      Utils.TRACE(TAG, `Saving ${path.join('.')} to ${p.node.$read_from}`);

      _loadFs();
      return DataModel.getSerialisable(p.node, p.model)
      .then(serial => Fs.writeFile(
        Utils.expandEnvVars(p.node.$read_from),
        JSON.stringify(serial, null, 2), "utf8"))
      .then(() => {
        return path;
      });
    }

    /**
     * Generate the help string for the given model, using the `$doc`
     * keys.
     * @param {object} model the data model to generate help for
     * @return {string} the help information 
     */
    static help(model, index) {
      DataModel.check(model);

      // index is used for formatting and is not visible to callers
      function indent(s) {
        return s.replace(/\n/g, "\n ");
      }

      const docstring = [];

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

        recurse = (BUILTIN_TYPES.indexOf(model.$class) < 0);
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
          const sub = DataModel.help(model.$map_of);
          if (sub.length > 0) {
            docstring.push('{\n');
            docstring.push(indent(sub));
            docstring.push("}\n");
          }
        } else {
          const sub = [];
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
  }

  return DataModel;
});
