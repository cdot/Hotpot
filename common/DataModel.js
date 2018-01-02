/*@preserve Copyright (C) 2016-2017 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

// Note that Q and Fs are only require()d when they are required, so this
// module can be used in a browser.
const Utils = require("./Utils");

const TAG = "DataModel";

/**
 * This module provides a way to deserialise a datastructure from
 * JSON data which contains only initialisation data for the
 * objects within the data structure, under control of a data model
 * (specification).
 *
 * The data is read from in a JSON file. On load this data is
 * post-processed under the guidance of the spec, to validate the
 * structure and instantiate class members.
 *
 * The data model is a recursive description of the data. The data can
 * contain simple Javascript types (number, string etc), objects, and
 * arrays. Function and SYmbol objects are not supported.
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
 *   $class - type of the datum (as returned by typeof, defaults to "object")
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
var DataModel = {
    private_key: {
        $map_of: true,
        $array_of: true,
        $checked: true,
        $class: true,
        $default: true,
        $doc: true,
        $optional: true,
        $skip: true
    },
    builtin_types: [
        Boolean,
        Number,
        Date,
        String,
        RegExp
    ],
};

/**
 * Check the model for correct construction
 * @param model the model to check
 * @param context undefined or an array
 * @private
 */
DataModel.check = function (model, context) {
    if (model.$checked)
        return;

    if (typeof context === "undefined")
        context = [];

    if (typeof model !== "object")
        throw Utils.report(TAG, ".check: Illegal model type ", model,
            " at ", context.join('.'));

    //Utils.LOG("check <",context.join('.'),"> {");

    var is_base = false;
    if (typeof model.$class === "function") {
        if (DataModel.builtin_types.indexOf(model.$class) >= 0) {
            // Internal fields not supported
            is_base = true;
        }
        // Currently cannot have both $array_of and $class
        if (typeof model.$array_of !== "undefined")
            throw Utils.report(TAG, ".check: cannot have $array_of and $class");
    } else if (typeof model.$class !== "undefined") {
        throw Utils.report(TAG, "/check: $class is ",
            typeof model.$class, " at ", context.join('.'));
    }

    model.$checked = true;

    if (!model.$skip) {
        if (typeof model.$array_of !== "undefined") {
            if (typeof model.$map_of !== "undefined")
                throw Utils.report(
                    TAG, ".check: cannot have $array_of and $map_of");
            DataModel.check(model.$array_of, context.concat("[]"));
        } else if (typeof model.$map_of !== "undefined")
            DataModel.check(model.$map_of, context.concat("{}"));
        else {
            for (var i in model) {
                if (i.charAt(0) !== '$') {
                    if (is_base)
                        throw Utils.report(
                            TAG, ".check: $class ",
                            model.$class.name, " has field ", i, " at ",
                            context.join('.'));
                    DataModel.check(model[i], context.concat(i));
                }
            }
        }
    }
    //Utils.LOG("} <",context.join('.'),">");
};

/**
 * Test the given model against the given data structure, checking data
 * against the model and constructing objects as required.
 * @param {object} data The data being loaded
 * @param {index} The index of the structure in the parent object. This
 * will be a number for an array entry, or a key for a hash, and is used
 * to pass to constructors for named objects.
 * @param {object} model the model
 * @param {string} context The context of the check, used in messages only
 * @return the data (or the default, if one was applied)
 */
DataModel.remodel = function (index, data, model, context) {
    var i;

    DataModel.check(model);

    if (index === "_readFrom")
        return data;

    if (typeof context === "undefined")
        context = [];

    //Utils.LOG("Remodel ", context.join('.'));

    // Got a data definition
    if (typeof data === "undefined") {
        if (model.$optional)
            return data;
        if (typeof model.$default === "undefined")
            throw Utils.report(TAG, ".remodel: not optional and no default at ",
                context.join('.'));
        else
            data = model.$default;
    }

    if (model.$skip)
        return data;

    if (typeof model.$map_of !== "undefined") {
        // Object with keys that don't have to match the model,
        // and values that can be undefined
        var rebuilt = {};
        for (var i in data) {
            rebuilt[i] = DataModel.remodel(
                i, data[i], model.$map_of, context.concat(i));
        }
        return rebuilt;
    } else if (typeof model.$array_of !== "undefined") {
        var rebuilt = [];

        for (var i in data) {
            // undefined is allowed in array data
            rebuilt[i] = DataModel.remodel(
                i, data[i], model.$array_of, context.concat(i));
        }
        return rebuilt;
    }

    if (DataModel.builtin_types.indexOf(model.$class) >= 0)
        return data;

    // Not a base type, so the model describes what has to be passed
    // to the constructor (if there is one)
    var rebuilt = data;

    if (typeof data === "object") {
        // Rebuild the sub-structure for this object. The rebuilt object
        // will either be placed in the result or passed to a constructor.

        // Note that fieds not listed in the model are not copied
        // into rebuilt.
        rebuilt = {};
        for (var i in model) {
            if (!DataModel.private_key[i]) {
                var datum = DataModel.remodel(
                    i, data[i], model[i],
                    context.concat(i));
                if (typeof datum !== "undefined")
                    // undefined is skipped in objects
                    rebuilt[i] = datum;
                //Utils.LOG("Rebuilt ",data[i]," to ",rebuilt[i]);
            }
        }
        // Make sure the data doesn't carry any hidden payload
        for (var i in data) {
            if (!model[i])
                throw Utils.report(
                    TAG, ".remodel: Hidden payload ", i, " in ", data,
                    " at ", context.join('.'));
        }
    }

    if (typeof model.$class === "function") {
        //Utils.LOG("Instantiate ", model.$class.name, " ", index," on ", rebuilt);
        // Have to pass index first for building native types such
        // as String, Number, Date
        // Could call remodel, this is fractionally quicker
        rebuilt = new model.$class(rebuilt, index, model);
        //Utils.LOG("Gives ",res);
    }

    return rebuilt;
};

/**
 * Promise to extract a serialisable version of a data structure
 * under guidance of the model as text, such that the data can be
 * reloaded using DataModel.load
 * @param {object} data data to save
 * @param {object{ model data model to follow
 */
DataModel.getSerialisable = function (data, model, context) {
    DataModel.check(model);

    var Q = require("q");

    // context is an internal parameter used for generating
    // meaningful errors
    if (typeof context === "undefined")
        context = [];

    if (typeof data === "undefined") {
        if (typeof model !== "undefined" && model.$optional) {
            return Q();
        }
        throw Utils.report(TAG, ".getSerialisable: non-optional at ",
            context.join('.'));
    }

    //Utils.LOG("Serialise ", data, " using ",model);

    if (model.$skip) {
        if (typeof data === "object" &&
            typeof data.getSerialisable === "function") {
            // objects can override getSerialisable
            // Could also use model.prototype.getSerialisable
            return data.getSerialisable(context);
        }
        return Q(data);
    }

    if (typeof data !== "object")
        return Q(data);

    var promises = Q();
    var serialisable;

    if (typeof model.$array_of !== "undefined") {
        // Serialise all entries in the object, it's an array
        if (typeof data !== "object")
            throw Utils.report(TAG, ".getSerialisable: array expected at ",
                context.join('.'), data);
        serialisable = [];
        Utils.forEach(data, function (entry, index) {
            promises = promises.then(function () {
                    return DataModel.getSerialisable(
                        entry, model.$array_of,
                        context.concat(index));
                })
                .then(function (c) {
                    serialisable[index] = c;
                });
        });
        return promises.then(function () {
            return serialisable;
        });

    } else if (typeof model.$map_of !== "undefined") {
        if (typeof data !== "object")
            throw Utils.report(TAG, ".getSerialisable: map expected at ",
                context.join('.'), data);
        serialisable = {};
        Utils.forEach(data, function (entry, index) {
            promises = promises.then(function () {
                    return DataModel.getSerialisable(
                        entry, model.$map_of,
                        context.concat(index));
                })
                .then(function (c) {
                    serialisable[index] = c;
                });
        });
        return promises.then(function () {
            return serialisable;
        });

    } else if (typeof model.$class === "function" &&
        typeof data.getSerialisable === "function") {
        // objects can override getSerialisable
        // Could also use model.prototype.getSerialisable
        return data.getSerialisable(model);
    } else if (DataModel.builtin_types.indexOf(model.$class) >= 0) {
        return Q(data);
    }

    serialisable = {};
    // Only serialise fields described in the model. All other fields
    // in the object are ignored.
    Utils.forEach(model, function (fieldmodel, key) {
        if (DataModel.private_key[key])
            return;
        promises = promises
            .then(function () {
                var promise = DataModel.getSerialisable(
                    data[key], fieldmodel,
                    context.concat(key));
                return promise
            })
            .then(function (c) {
                if (typeof c !== "undefined") {
                    serialisable[key] = c;
                }
            });
    });

    return promises.then(function () {
        return serialisable;
    });
};

/**
 * Follow the path from the root to the node at the end of the path,
 * and call a function on the the root of the subtree there and the
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
 * @return the result of the call to fn
 */
DataModel.at = function (root, model, path, fn) {
    if (typeof path === "string") {
        // Convert string path to array of path components
        path = path.split(/\/+/);
        while (path.length > 0 && path[0].length == 0)
            path.shift();
    }

    DataModel.check(model);

    var node = root;
    var node_model = model;
    var parent;
    var key;

    // Walk down the node and model trees
    var i = 0;
    while (i < path.length) {
        if (typeof node === "undefined")
            throw Utils.report(
                TAG, ".at: no node at ", path, "[", i, "]");
        if (typeof node_model === "undefined")
            throw Utils.report(
                TAG, ".at: no model at ", path, "[", i, "]");
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
        throw Utils.report(TAG, ".at: could not find ", path);
    return fn(node, node_model, parent, key);
};

/**
 * Promise to load data that observes the given data model
 * from a file.
 * @param file the file to load from
 * @param {object} model the data model to check against
 * @return {promise} promise that returns the loaded data
 * @public
 */
DataModel.loadData = function (file, model) {
    "use strict";

    DataModel.check(model);

    var Q = require("q");
    var Fs = require("fs");
    var readFilePromise = Q.denodeify(Fs.readFile);

    return readFilePromise(file)
        .then(function (code) {
            var data = Utils.eval(code, file);
            data = DataModel.remodel("", data, model);
            data._readFrom = file;
            return data;
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
DataModel.saveData = function (data, model, file) {
    "use strict";

    DataModel.check(model);

    if (typeof file === "undefined")
        file = this._readFrom;

    var Q = require("q");
    var Fs = require("fs");
    var writeFilePromise = Q.denodeify(Fs.writeFile);

    return DataModel.getSerialisable(data, model).then(function (remod) {
        return writeFilePromise(
            Utils.expandEnvVars(file),
            JSON.stringify(remod, null, 2), "utf8");
    });
};

/**
 * Generate the help string for the given model
 * @param {object} model the data model to generate help for
 */
DataModel.help = function (model, index) {
    DataModel.check(model);

    // index is used for formatting and is not visible to callers
    function shift_right(s) {
        return s.replace(/\n/g, "\n ");
    }

    var docstring = [];

    if (index)
        docstring.push(index + ":");

    if (typeof model === "function")
        return "<" + model.name + ">";

    if (model.$optional)
        docstring.push("(optional)");
    if (typeof model.$class !== "undefined") {
        if (typeof model.$class === "string")
            docstring.push('<' + model.$class + '>');
        else if (typeof model.$class === "function")
            docstring.push('<' + model.$class.name + '>');
        else
            docstring.push(model.$class); // wtf?
    }

    if (typeof model.$doc === "string")
        docstring.push(model.$doc);

    if (typeof model.$class === "undefined" || model.$class === "object") {
        if (typeof model.$array_of !== "undefined") {
            docstring.push('[\n');
            docstring.push(shift_right(DataModel.help(model.$array_of)));
            docstring.push("\n]");
        } else if (typeof model.$map_of !== "undefined") {
            docstring.push('{*\n');
            docstring.push(shift_right(DataModel.help(model.$map_of)));
            docstring.push("\n*}");
        } else {
            docstring.push("{\n");
            var sub = [];
            for (var i in model) {
                if (i.charAt(0) !== '$')
                    sub.push(DataModel.help(model[i], i));
            }
            docstring.push(shift_right(sub.join('\n')));
            docstring.push("\n}");
        }
    }
    return docstring.join(' ').replace(/ +\n/g, "\n");
}

/* Inner classes, helpers for file operations */

/**
 * DataModel inner class for handling filenames specified in serialisable data.
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
function File(filename, index, model) {
    this.data = filename;
    if (typeof model !== "undefined") {
        // Got a model to check against. This should always be the case
        // except in tests.
        var fnm = Utils.expandEnvVars(filename);
        var $mode = model.$mode;
        if (typeof $mode === "undefined")
            $mode = "r";
        var Fs = require("fs");
        var mode = Fs.constants.F_OK;

        if ($mode.indexOf("r") >= 0)
            mode = mode | Fs.constants.R_OK;

        if ($mode.indexOf("x") >= 0)
            mode = mode | Fs.constants.X_OK;

        if ($mode.indexOf("e") >= 0 && !Fs.existsSync(fnm)) {
            throw "Bad " + index + ": " + filename + " does not exist";
        }

        if ($mode.indexOf("w") >= 0) {
            mode = mode | Fs.constants.W_OK;

            if (Fs.existsSync(fnm)) {
                Fs.access(fnm, mode,
                    function (err) {
                        if (err)
                            throw "Bad " + index + ": " + filename + " " +
                                +$mode + " mode check failed: " +
                                err;
                    });
            }
        } else if ($mode.indexOf("w") >= 0) {
            // Just make sure we can write, and clear down the file
            Fs.writeFileSync(fnm, "", {
                mode: mode
            });
        }
    }
};

DataModel.File = File;

File.Model = {
    $class: DataModel.File,
    $doc: "Filename"
};

/**
 * Generate a simple string representation of this object suitable
 * for use in debugging and in serialisation
 */
File.prototype.toString = function () {
    return this.data;
};

/**
 * Promise to write a new value to the file
 * @param value new data to write to the file
 */
File.prototype.write = function (value) {
    var Q = require("q");
    var Fs = require("fs");
    var writeFilePromise = Q.denodeify(Fs.writeFile);
    return writeFilePromise(Utils.expandEnvVars(this.data), value, "utf8");
};

/**
 * Promise to read the file
 */
File.prototype.read = function () {
    var Q = require("q");
    var Fs = require("fs");
    var readFilePromise = Q.denodeify(Fs.readFile);
    return readFilePromise(Utils.expandEnvVars(this.data));
};

File.prototype.getSerialisable = function () {
    var Q = require("q");
    return Q(this.data);
};

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
function TextOrFile(data, index, model) {
    DataModel.File.call(this, data, index, model);
    var Fs = require("fs");
    this.is_file = Fs.existsSync(Utils.expandEnvVars(data));
};
TextOrFile.prototype = new DataModel.File();
DataModel.TextOrFile = TextOrFile;

TextOrFile.Model = {
    $class: DataModel.TextOrFile,
    $doc: "Filename or plain text"
};

/**
 * Promise to read the datum
 */
TextOrFile.prototype.read = function () {
    if (this.is_file)
        return DataModel.File.prototype.read.call(this);
    else {
        var data = this.data;
        var Q = require("q");
        return Q.fcall(function () {
            return data;
        });
    }
};

/**
 * Promise to update the datum
 * @param value new value to store in the datum
 */
TextOrFile.prototype.write = function (value) {
    if (this.is_file)
        return DataModel.File.prototype.write.call(this, value);
    else {
        this.data = value;
        var Q = require("q");
        return Q(true);
    }
};

module.exports = DataModel;