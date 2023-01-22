import { default as jquery } from "jquery/dist/jquery.js";
import { JSDOM } from "jsdom";

/* global DOM */

function jsdom(url, html) {
  if (global.$)
    return Promise.resolve();

  const opts = {
    url: url
  };
  const prom = html
        ? JSDOM.fromFile(html, opts)
        : Promise.resolve(new JSDOM(`<!doctype html><html></html>"`, opts));
  return prom.then(dom => {
    global.DOM = dom;
    global.window = DOM.window;
    global.document = DOM.window.document;
    global.navigator = { userAgent: "node.js" };
    global.$ = global.jQuery = jquery(window);
  });
}

export { jsdom }
  
