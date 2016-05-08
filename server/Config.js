/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/
const Fs = require("fs");
const serialize = require("serialize-javascript");

Config = {
    load: function(file) {
        "use strict";
        var data = Fs.readFileSync(Config.expanded(file), "utf8");
        var config;
        eval("config=" + data);
        console.log("Configured from " + file);
        return config;
    },

    expanded: function(data) {
        "use strict";
        if (typeof data !== "string")
            throw "Cannot expand " + data;
        return data.replace(
                /(\$[A-Z]+)/g, function(match) {
                    var v = match.substring(1);
                    if (typeof process.env[v] !== "undefined")
                        return process.env[v];
                    return match;
                });
    },

    save: function(data, file) {
        "use strict";
//	Fs.writeFileSync(Config.expanded(file), serialize(data), "utf8");
console.log(serialize(data));
        console.log(file + " updated");
    }
};

module.exports = Config;
