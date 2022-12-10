/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env node */
/* global exports, assert */

/**
 * Unit test support
 */
requirejs = require("requirejs");

requirejs.config({
  baseUrl: `${__dirname}/..`,
  nodeRequire: require
});

// Set to console.debug to trace module load/unload
exports.debug = () => {};

requirejs.onResourceLoad = (context, map, depArray) => {
  exports.debug("Loaded", map.name);
  loaded.push(map.name);
};

assert = require("assert");

exports.sparseEqual = (actual, expected, path) => {
  if (!path) path = "";
  for (let f in expected) {
    const spath = `${path}->${f}`;
    if (typeof expected[f] === "object") {
      assert(typeof actual[f] === "object", `actual ${spath} missing`);
      exports.sparseEqual(actual[f], expected[f], spath);
    } else
      assert.equal(actual[f], expected[f], spath);
  }
};

exports.assert = assert;

const loaded = [];

exports.before = (deps, required) => {
  if (requirejs.isBrowser) {
    // node.js
    const { JSDOM } = require('jsdom');
    /* eslint-disable no-global-assign */
    document = new JSDOM('<!doctype html><html><body id="working"></body></html>');
    /* eslint-enable no-global-assign */
    const { window } = document;
    global.window = window;
    global.document = window.document;
    global.navigator = { userAgent: "node.js" };
    const jQuery = require('jquery');
    global.jQuery = jQuery;
    global.$ = jQuery;
  }
  const modnames = Object.keys(deps);
  exports.debug("Loading", deps);
  const modules = modnames.map(m => new Promise(
    resolve => requirejs([ deps[m] ], mod => {
      exports.debug("Loaded", deps[m]);
      loaded.push(deps[m]);
      resolve(mod);
    })));
  Promise.all(modules)
  .then(mods => {
    let i = 0;
    for (let name of modnames) {
      eval(`${name}=mods[${i++}]`);
    }
    exports.debug("Modules loaded");
    if (requirejs.isBrowser) {
      // Why? No idea, except without it, it won't work in npm run
      global.document = window.document;
    }
    required();
  });
};

exports.after = () => {
  // Unload loaded modules so we get the right mixins when performing
  // browser tests
  while (loaded.length > 0) {
    const mod = loaded.pop();
    exports.debug("Unloaded", mod);
    requirejs.undef(mod);
  }
  requirejs.isBrowser = false;
};

exports.tracePrototypeChain = object => {
  let proto = object.constructor.prototype;
  const chain = [];

  while (proto) {
    chain.push(proto.constructor.name);
    proto = Object.getPrototypeOf(proto);
  }
  return chain.join("->");
};
