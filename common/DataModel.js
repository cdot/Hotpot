/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

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
 *   id: { $type: "string", $doc: "unique id" }
 * }
 * ```
 * names that don't start with $ are field names that are expected to
 * be found in the config data.
 *
 * keywords in the spec define the type of the datum ($type)
 * and a block of documentation ($doc).
 * keywords exist to modify the spec:
 *   $type - type of the datum (as returned by typeof, defaults to "object")
 *   $doc - a documentation string for the datum
 *   $optional - this datum is optional
 *   $default: default value, if not defined and not $optional
 *   $skip - skip deeper checking of this item
 *   $array_of - object is an associative array of elements, each of
 *   which has the given spec. the key type is not specified (it can be
 *   any valid js key type)
 *
 * for example,
 * ```
 *   ids: {
 *     $doc: "set of ids",
 *     $array_of: { id: { $type: "string" } }
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
 *       $type: Location,
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
 * Note that currently $type must be undefined if $array_of is defined.
 * A future extension may be to use $type to template objects that subclass
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
 * Thing.spec = {
 *    $type: Thing,
 *    ...
 * };
 * ```
 * this can then be referred to in another spec e.g
 * ```
 * things: {
 *    $array_of: Thing.spec,
 *    $doc: "list of things"
 * } 
 * ```
 * Note that "undefined" is not regarded as a useful value. If the
 * value of a field is undefined, the key for that field will be dropped.
 */
const Fs = require("fs");
const Q = require("q");

const readFilePromise = Q.denodeify(Fs.readFile);
const writeFilePromise = Q.denodeify(Fs.writeFile);
const tojson = require("serialize-javascript");

const Utils = require("../common/Utils.js");

const tag = "DataModel";

/**
 * functions involved in managing modelled data
 * @namespace
 */
var DataModel = {
};

/**
 * Promise to load data that observes the given data model
 * from a file.
 * @param file the file to load from
 * @param {object} model the data model to check against
 * @return {promise} promise that returns the loaded data
 * @public
 */
DataModel.loadData = function(file, model) {
    return readFilePromise(file)
    .then(function(code) {
        var data = Utils.eval(code, file);
        data = DataModel.remodel("", data, model);
        data._readfrom = file;
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
DataModel.saveData = function(data, model, file) {
    "use strict";

    if (typeof file === "undefined")
        file = this._readfrom;
    
    return DataModel.getSerialisable(data, model).then(function(data) {
        return writeFilePromise(
            Utils.expandEnvVars(file),
            tojson(data, 2), "utf8");
    })

    .catch(function(e) {
        Utils.ERROR(tag, "save failed: ", e.stack);
    });
};

/**
 * Promise to extract a serialisable version of a data structure
 * under guidance of the model as text, such that the data can be
 * reloaded using DataModel.load
 * @param {object} data data to save
 * @param {object{ model data model to follow
 */
DataModel.getSerialisable = function(data, model, context) {
    // context is an internal parameter used for generating
    // meaningful errors
    if (typeof context === "undefined")
        context = "";
    
    if (typeof data === "undefined") {
        if (model.$optional)
            return Q();
        throw "internal error; non-optional at " + context;
    }

    // objects can override getSerialisable
    if (typeof data === "object" &&
        typeof data.getSerialisable === "function") {
        if (typeof model.$type !== "function")
            throw "internal error; model mismatch at " + context;
        return data.getSerialisable(model);
    }

    // If this is a simple object type, just return the data
    var $type = (typeof model.$type === "undefined") ? "object" : model.$type;
    if (typeof data !== $type) {
        throw "Internal error; expected " + $type +
            " but got " + (typeof data) + " at " + context;
        return Q(data);
    }

    var promises = Q();
    var res;
    
    if (typeof model.$array_of !== "undefined") {
        // Serialise all entries in the object, it's an array
        if (data.toString !== Array.prototype.toString)
            throw "Internal error: array expected at " + context;
        res = [];
        Utils.forEach(data, function(entry, index) {
            promises = promises.then(function() {
                return DataModel.getSerialisable(
                    entry, model.$array_of, context + "[" + index + "]");
            })
            .then(function(c) {
                res[index] = c;
            });
        });
        
    } else if ($type === "object") {
        // Only serialise fields described in the model. All other fields
        // in the object are ignored.
        res = {};
        Utils.forEach(model, function(fieldmodel, key) {
            if (key.charAt(0) == '$')
                return;
            promises = promises.then(function() {
                return DataModel.getSerialisable(
                    data[key], fieldmodel, context + "." + key);
            })
            .then(function(c) {
                if (typeof c !== "undefined")
                    res[key] = c;
            });
        });
    } else {
        res = data;
    }

    return promises.then(function() {
        return res;
    });
};

/**
 * @private
 * Test the given model against the given data structure, checking data
 * against the model and constructing objects as required.
 * @param {object} data The data being loaded
 * @param {index} The index of the structure in the parent object. This
 * will be a number for an array entry, or a key for a hash. Only used for error
 * reporting.
 * @param {object} model the model
 * @param {string} context The context of the check, used in messages only
 * @return the data (or the default, if one was applied)
 */
DataModel.remodel = function(index, data, model, context) {
    var i;
    if (index === "_readFrom")
        return data;

    if (typeof context === "undefined")
        context = "";
    
    //Utils.LOG("Process ", data);
    
    if (typeof data === "undefined") {
        if (model.$optional)
            return data;
        if (typeof model.$default === "undefined")
            throw "Bad data: " + context + " not optional and no default";
        else
            data = model.$default;
    }
    
    if (model.$skip)
        return data;

    // Currently cannot have both $array_of and $type
    if (typeof model.$array_of !== "undefined" &&
        typeof model.$type !== "undefined")
        throw "Broken model: cannot have $array_of and $type";

    // Arrays are integer-indexed
    if (typeof model.$array_of !== "undefined") {
        var rebuilt = [];
        for (var i in data) {
            rebuilt[i] = DataModel.remodel(
                i, data[i], model.$array_of, context + "[" + i + "]");
        }
        return rebuilt;
    }

    // Simple type e.g. $type: "number"
    if (typeof model.$type === "string") {
        // Should check validity of data type
        if (typeof data !== model.$type)
            throw "Bad data: " + context + " wanted " + model.$type + " for "
            + index + " but got " + Utils.dump(data);
        if (model.$type === "number") {
            if (typeof model.$min === "number" && data < model.$min) {
                throw "Bad data: " + context +
                    " min " + model.$min + " for " +
                    index + " but got " + data;
            }
            if (typeof model.$max === "number" && data > model.$max) {
                throw "Bad data: " + context + " max " + model.$max + " for "
                    + index + " but got " + data;
            }
        }
        //console.log("Checked "+model.$type+": "+data);
        // Simple data, don;t have to rebuild
        return data;
    }

    var rebuilt;
    if (typeof data === "object") {
        // Rebuild the sub-structure for this object. The rebuilt object
        // will either be placed in the result or passed to a constructor.
        
        // Note that fieds not listed in the model are not copied
        // into rebuilt.
        rebuilt = {};
        for (var i in model) {
            if (i.charAt(0) !== '$') {
                rebuilt[i] = DataModel.remodel(
                    i, data[i], model[i], context + "." + i);
                //Utils.LOG("Rebuilt ",data[i]," to ",rebuilt[i]);
            }
        }
    } else // simple object
        rebuilt = data;
    
    if (typeof model.$type === "function") {
        //Utils.LOG("Instantiate ",index,"  ",rebuilt);
        rebuilt = new model.$type(index, rebuilt, model);
    } else {
        // make sure the data doesn' carry any hidden payload
        for (var i in data) {
            if (!model[i])
                throw "Bad data: " + Utils.dump(data) +
                " unexpected for field '" + i + "' at "
                + context;
        }
    }
    return rebuilt;
};

/**
 * Replace an entire subtree in a path, remodelling the subtree in accordance
 * with a data model.
 * @param {string or array} path the path to the root of the subtree to
 * replace. The path is either a '/'-separated string, or an array of
 * path indices.
 * @param {object} subtree the subtree data to import. The subtree will
 * be remodelled according to the requirements of the model.
 * @param {object} data the modelled data that we are updating.
 * @param model {object} the model that dictates the structure of the data
 */
DataModel.update = function(path, subtree,  data, model) {
    if (typeof path === "string") {
        path = path.split('/');
        if (path.length > 0 && !path[0])
            path.shift();
        return DataModel.update(path, subtree, data, model);
    }
    // March down the data and the model and find the node where
    // the subtree is rooted
    var node = data;
    while (path.length > 0) {
        var index = path.shift();
        so_far += "." + index;
        if (typeof model === "string")
            throw "Bad update at " + so_far + " expected " + model;
        if (typeof model.$array_of !== "undefined") {
            if (typeof data !== "object")
                throw "Bad update at " + so_far + " not an array";
            data = data[index];
            model = model.$array_of;
        } else if (typeof model.$type !== "string") {
            if (typeof data !== "object")
                throw "Bad update at " + so_far + " not an object";
            data = data[index];
            model = model.$type;
        }
    }
};

/**
 * Generate the help string for the given model
 * @param {object} model the data model to generate help for
 */
DataModel.help = function(model, index) {
    // index is used for formatting and is not visible to callers
    function shift_right(s) {
        return s.replace(/\n/g, "\n ");
    }
    
    var docstring = [];

    if (index)
        docstring.push(index + ":");
    if (model.$optional)
        docstring.push("(optional)");
    if (typeof model.$type !== "undefined") {
        if (typeof model.$type === "string")
            docstring.push('{'  + model.$type + '}');
        else if (typeof model.$type === "function")
            docstring.push('{' + model.$type.name + '}');
        else
            docstring.push(model.$type); // wtf?
    }
    
    if (typeof model.$doc === "string")
        docstring.push(model.$doc);

    if (typeof model.$type === "undefined" || model.$type === "object") {
        if (typeof model.$array_of !== "undefined") {
            docstring.push('[\n');
            dosctring.push(shift_right(DataModel.help(model.$array_of)));
            docstring.push("\n]");
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
 * Inner class for handling filenames specified in serialisable data.
 * The constructor uses the $mode (default "r") specified in the
 * model to verify the status of the target file. This supports the
 * following modes:
 * e: the file must exist
 * r: the file must be readable
 * w: the file must be writable
 * x: the file must be executable
 * @param index the name passed to the constructor by DataModel
 * @param filename the file name
 * @param {object} model the model for this file
 */
function File(index, filename, model) {
    this.data = filename;
    if (typeof model !== "undefined") {
        // Got a model to check against. This should always be the case
        // except in tests.
        var fnm = Utils.expandEnvVars(filename);
        var $mode = model.$mode;
        if (typeof $mode === "undefined")
            $mode = "r";
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
                          function(err) {
                              if (err)
                                  throw "Bad " + index + ": " + filename + " " +
                                  + $mode + " mode check failed: "
                                  + err;
                          });
            }
        } else if ($mode.indexOf("w") >= 0) {
            // Just make sure we can write, and clear down the file
            Fs.writeFileSync(fnm, "", { mode: mode });
        }
    }
};

DataModel.File = File;

File.Model = {
    $type: DataModel.File,
    $doc: "Filename"
};

/**
 * Generate a simple string representation of this object suitable
 * for use in debugging and in serialisation
 */
File.prototype.toString = function() {
    return this.data;
};

/**
 * Promise to write a new value to the file
 * @param value new data to write to the file
 */
File.prototype.write = function(value) {
    return writeFilePromise(Utils.expandEnvVars(this.data), value, "utf8");
};

/**
 * Promise to read the file
 */
File.prototype.read = function() {
    return readFilePromise(Utils.expandEnvVars(this.data));
};

File.prototype.getSerialisable = function() {
    return Q(this.data);
};


/**
 * Subclass of DataModel.File representing a datum that can either
 * be a simple text string, or a file name.
 * When the object is constructed, if the string in the data is a
 * valid existing filename, then the object is assumed to refer to a file.
 * Otherwise it is assumed to be raw text data.
 * The $mode of the model is assumed to be at least "er"
 * @param index the name passed to the constructor by DataModel
 * @param data either a file name or raw data
 * @param {object} model the model for the datum
 */
function TextOrFile(index, data, model) {
    DataModel.File.call(this, index, data, model);
    this.is_file = Fs.existsSync(Utils.expandEnvVars(data));
};
TextOrFile.prototype = new DataModel.File();
DataModel.TextOrFile = TextOrFile;

TextOrFile.Model = {
    $type: DataModel.TextOrFile,
    $doc: "Filename or plain text"
};

/**
 * Promise to read the datum
 */
TextOrFile.prototype.read = function() {
    if (this.is_file)
        return DataModel.File.prototype.read.call(this);
    else {
        var data = this.data;
        return Q.fcall(function() { return data; });
    }
};

/**
 * Promise to update the datum
 * @param value new value to store in the datum
 */
TextOrFile.prototype.write = function(value) {
    if (this.is_file)
        return DataModel.File.prototype.write.call(this, value);
    else {
        this.data = value;
        return Q(true);
    }
};

module.exports = DataModel;
