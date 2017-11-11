/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Simple require() that works for our modules
 * @ignore
 */

var GRequired = {};
module = {};
var require_path = [];

function require(ident) {
    "use strict";
    // Resolve ident so it is relative to the invoking module
    //console.log("require " + ident);
    var path = ident.split("/");
    ident = path.pop();
    if (!/\.js$/.test(ident))
        ident = ident + ".js";
    if (typeof GRequired[ident] === "undefined") {
        //console.log("real-require " + path.join('/') + "/ " +  ident);
        path = require_path.concat(path);
        var url = path.concat(ident).join('/');
        //console.log("get " + url);
        $.ajax({
            async: false, // deprecated!
            url: url,
            dataType: 'text',
            'success': function (data) {
                var saved = require_path;
                require_path = path;
                //console.log("eval in " + path.join('/'));
                var module = {};
                var __filename = url;
                var fn = eval("'use strict';" + data);
                require_path = saved;
                GRequired[ident] = module.exports;
            }
        });
    }
    return GRequired[ident];
}
