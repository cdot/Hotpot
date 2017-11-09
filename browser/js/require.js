/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Simple require() that works for our modules
 * @ignore
 */

var GRequired = {};
var module;

RELATIVE_TO = [];

function require(m) {
    "use strict";
    // Resolve m so it is relative to the invoking module
    //console.log("require " + m);
    var path = m.split("/");
    m = path.pop();
    if (!/\.js$/.test(m))
        m = m + ".js";
    if (typeof GRequired[m] === "undefined") {
        //console.log("real-require " + path.join('/') + "/ " +  m);
        path = RELATIVE_TO.concat(path);
        path.push(m);
        var url = path.join('/');
        //console.log("get " + url);
        $.ajax({
            async: false, // deprecated!
            url: url,
            dataType: 'text',
            'success': function (data) {
                var saved = RELATIVE_TO;
                RELATIVE_TO = path;
                //console.log("eval in " + path.join('/'));
                var module = {};
                var fn = eval("'use strict';" + data);
                RELATIVE_TO = saved;
                GRequired[m] = module.exports;
            }
        });
    }
    return GRequired[m];
}
