/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Simple require() that works for our modules
 * @ignore
 */

var GRequired = {};
var module;

function require(m) {
    "use strict";
    if (typeof GRequired[m] === "undefined") {
        $.ajax({
            async: false, // deprecated!
            url: m,
            dataType: 'text',
            'success': function (data) {
                var module = {};
                var fn = eval("'iuse strict';" + data);
                GRequired[m] = module.exports;
            }
        });
    }
    return GRequired[m];
}
