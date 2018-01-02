/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Simple require() that works for our modules
 * @ignore
 */

if (typeof already_required === "undefined")
    already_required = {};
if (typeof module === "undefined")
    module = {};
if (typeof require_path === "undefined")
    require_path = [];

require_path.unshift(location.href.replace(/\/[^\/]*$/, ""));

function require(ident) {
    "use strict";

    function unrel(s) {
        var ss = s.split(/\//);
        var i = 1;
        while (i < ss.length) {
            if (ss[i] == '.')
                ss.splice(i, 1);
            else if (ss[i] == '..')
                ss.splice(--i, 2);
            else
                i++;
        }
        return ss.join('/');
    }

    // Resolve ident so it is relative to the invoking module
    //console.log("require " + ident);
    var path = ident.split("/");
    ident = path.pop();
    if (!/\.js$/.test(ident))
        ident = ident + ".js";
    if (typeof already_required[ident] === "undefined") {
        //console.log("real-require " + path.join('/') + "/ " +  ident);
        path = require_path.concat(path);
        var url = unrel(path.concat(ident).join('/'));
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
                already_required[ident] = module.exports;
            }
        });
    }
    return already_required[ident];
}