/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser */

let suppression = "";
let min = ".min";

if (/debug/.test(window.location.search.substring(1))) {
    suppression = "t=" + Date.now();
	min = "";
}

requirejs.config({
	baseUrl: ".",
	urlArgs: suppression, // caches suppression
	text: {
		useXhr: ( /*url, protocol, hostname, port*/ ) => true
	},
	paths: {
		"jquery": `node_modules/jquery/dist/jquery${min}`,
		"jquery-ui": `node_modules/jquery-ui-dist/jquery-ui${min}`,
    "touch": "node_modules/jquery-touch-events/index"
	}
});

requirejs(["jquery", "jquery-ui"], () => {
	requirejs(["browser/js/Hotpot", "touch"], Hotpot => new Hotpot().begin());
});
