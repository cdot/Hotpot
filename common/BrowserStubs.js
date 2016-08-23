/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Global stubs that allow node.js modules to be used in the browser
 * @ignore
 */
function require(m) {
    "use strict";
    jQuery.getScript(m);
}
