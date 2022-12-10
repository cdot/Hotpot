/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser */

requirejs.config({
	baseUrl: ".", // paths relative to HTML

	urlArgs: /debug/.test(window.location.search.substring(1))
  ? `t=${Date.now()}` : "",

	text: {
		useXhr: ( /*url, protocol, hostname, port*/ ) => true
	},

	paths: {
		"jquery": `node_modules/jquery/dist/jquery`,
		"jquery-ui": `node_modules/jquery-ui-dist/jquery-ui`,
    "touch-punch": "node_modules/@rwap/jquery-ui-touch-punch/jquery.ui.touch-punch"
	},

  // shim specifies additional dependencies between modules
  shim: {
    "jquery-ui":   [ "jquery" ],
    "touch-punch": [ "jquery-ui" ]
  }
});

requirejs([ "js/browser/Hotpot" ], Hotpot => new Hotpot().begin());
