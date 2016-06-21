/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * @module Apis
 */
var setup = {
    /**
     * @param {Config} config the configuration data
     */
    configure: function(config) {
        "use strict";
        setup.apis = config.data;
    },

    /**
     * Get the given API
     * @param {string} key api information required
     */
    get: function(key) {
        "use strict";
        return setup.apis[key];
    },

    /**
     * Get a serialisable version of the config
     */
    getSerialisableConfig: function() {
        return setup.apis;
    }
};
module.exports = setup;
