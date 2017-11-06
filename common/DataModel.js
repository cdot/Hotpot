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
 *   id: { $class: "string", $doc: "unique id" }
 * }
 * ```
 * names that don't start with $ are field names that are expected to
 * be found in the config data.
 *
 * keywords in the spec define the type of the datum ($class)
 * and a block of documentation ($doc).
 * keywords exist to modify the spec:
 *   $class - type of the datum (as returned by typeof, defaults to "object")
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
 *     $array_of: { id: { $class: "string" } }
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
 * Thing.spec = {
 *    $class: Thing,
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
        context = [];

    if (typeof data === "undefined") {
        if (typeof model !== "undefined" && model.$optional)
            return Q();
        throw Utils.report("getSerialisable: non-optional at ",
                           context.join('.'));
    }

    //Utils.LOG("Serialise ", data, " using ",model);
    if (typeof model === "function") {
        if (typeof data === "object") {
            if (typeof data.getSerialisable === "function") {
                // objects can override getSerialisable
                // Could also use model.prototype.getSerialisable
                return data.getSerialisable(model);
            }
        }
    }

    if (typeof data !== "object")
        return Q(data);

    // Model defines data as an object or array
    if (typeof model !== "object")
       throw Utils.report("getSerialisable: Illegal model type ",
                          model, " at ", context.join('.'));
    
    var promises = Q();
    var serialisable;
    
    if (typeof model.$array_of !== "undefined") {
        // Serialise all entries in the object, it's an array
        if (typeof data !== "object")
            throw Utils.report("getSerialisable: array expected at ",
                               context.join('.'), data);
        serialisable = [];
        Utils.forEach(data, function(entry, index) {
            promises = promises.then(function() {
                return DataModel.getSerialisable(
                    entry, model.$array_of,
                    context.concat(index));
            })
            .then(function(c) {
                serialisable[index] = c;
            });
        });
        return promises.then(function() {
            return serialisable;
        });

    } else if (typeof model.$class === "function" &&
               typeof data.getSerialisable === "function") {
        // objects can override getSerialisable
        // Could also use model.prototype.getSerialisable
        return data.getSerialisable(model);
    } else if (model.$class === Number ||
               model.$class === String ||
               model.$class === Boolean) {
        return Q(data);
    }

    // Only serialise fields described in the model. All other fields
    // in the object are ignored.
    serialisable = {};
    Utils.forEach(model, function(fieldmodel, key) {
        if (key.charAt(0) == '$')
            return;
        promises = promises.then(function() {
            var promise = DataModel.getSerialisable(
                data[key], fieldmodel,
                context.concat(key));
            return promise
        })
            .then(function(c) {
                if (typeof c !== "undefined") {
                    serialisable[key] = c;
                }
            });
    });

    return promises.then(function() {
        return serialisable;
    });
};

/**
 * @private
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
DataModel.remodel = function(index, data, model, context) {
    var i;
    if (index === "_readFrom")
        return data;

    if (typeof context === "undefined")
        context = [];

    //Utils.LOG("Remodel ", context.join('.'));

    if (typeof model === "function")
        return new model(data, index, model);

    var rebuilt = data;
    if (typeof model !== "object")
        throw Utils.report("remodel: Illegal model type ", model,
                           " at ", context.join('.'));
    
    // Got a data definition
    if (typeof data === "undefined") {
        if (model.$optional)
            return data;
        if (typeof model.$default === "undefined")
            throw Utils.report("remodel: not optional and no default at ",
                               context.join('.'));
        else
            data = model.$default;
    }
    
    if (model.$skip)
        return data;

    if (typeof model.$array_of !== "undefined") {
        // Currently cannot have both $array_of and $class
        if (typeof model.$class !== "undefined")
            throw "remodel: Broken model, cannot have $array_of and $class";

        // Arrays are integer-indexed
        var rebuilt = [];
        for (var i in data) {
            // undefined is allowed in array data
            rebuilt[i] = DataModel.remodel(
                i, data[i], model.$array_of,
                context.concat(i));
        }
        return rebuilt;
    }
 
    if (typeof data === "object") {
        // Rebuild the sub-structure for this object. The rebuilt object
        // will either be placed in the result or passed to a constructor.

        // Note that fieds not listed in the model are not copied
        // into rebuilt.
        rebuilt = {};
        for (var i in model) {
            if (i.charAt(0) !== '$') {
                var datum = DataModel.remodel(
                    i, data[i], model[i],
                    context.concat(i));
                if (typeof datum !== "undefined")
                    // undefined is skipped in objects
                    rebuilt[i] = datum;
                //Utils.LOG("Rebuilt ",data[i]," to ",rebuilt[i]);
            }
        }
    }
    
    if (typeof model.$class === "function") {
        //Utils.LOG("Instantiate ", model.$class.name, " ", index," on ", rebuilt);
        // Have to pass index first for building native types such
        // as String, Number, Date
        // Could call remodel, this is fractionally quicker
        var res = new model.$class(rebuilt, index, model);
        //Utils.LOG("Gives ",res);
        return res;
    }

    // Should never get here for an array
    // Test: make sure the data doesn't carry any hidden payload
    if (typeof data === "object") {
        for (var i in data) {
            if (!model[i])
                throw Utils.report(
                    "remodel: Hidden payload ", i, " in ", data,
                    " at ", context.join('.'));
        }
    }

    return rebuilt;
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

    if (typeof model === "function")
        return "<" + model.name + ">";
    
    if (model.$optional)
        docstring.push("(optional)");
    if (typeof model.$class !== "undefined") {
        if (typeof model.$class === "string")
            docstring.push('<'  + model.$class + '>');
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
 * @param filename the file name
 * @param index the name passed to the constructor by DataModel
 * @param {object} model the model for this file
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
    $class: DataModel.File,
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
 * @param data either a file name or raw data
 * @param index the name passed to the constructor by DataModel
 * @param {object} model the model for the datum
 */
function TextOrFile(data, index, model) {
    DataModel.File.call(this, data, index, model);
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
