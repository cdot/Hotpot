/*@preserve Copyright (C) 2019 Crawford Currie http://c-dot.co.uk license MIT*/
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
		useXhr: (/*url, protocol, hostname, port*/) => true
	},
	paths: {
		// text! plugin, used for importing css
		//"text" : "https://cdnjs.cloudflare.com/ajax/libs/require-text/2.0.12/text" + min,

		"jquery" :"https://code.jquery.com/jquery-3.4.1" + min,
		"jquery-ui" : "https://code.jquery.com/ui/1.12.1/jquery-ui" + min,
		"js-cookie" : "https://cdnjs.cloudflare.com/ajax/libs/js-cookie/2.2.0/js.cookie" + min,
		"jquery-validate" : "https://cdnjs.cloudflare.com/ajax/libs/jquery-validate/1.19.1/jquery.validate" + min,
		"additional-methods" : "https://cdnjs.cloudflare.com/ajax/libs/jquery-validate/1.19.1/additional-methods" + min,
		"jquery-csv" : "https://cdnjs.cloudflare.com/ajax/libs/jquery-csv/1.0.5/jquery.csv" + min,
		"touch-punch" : "https://cdn.jsdelivr.net/npm/jquery-ui-touch-punch@0.2.3/jquery.ui.touch-punch" + min,
		"jquery-confirm" : "https://cdnjs.cloudflare.com/ajax/libs/jquery-confirm/3.3.4/jquery-confirm.min", // only min available
		"tablesorter" : "https://cdnjs.cloudflare.com/ajax/libs/jquery.tablesorter/2.31.1/js/jquery.tablesorter.combined" + min
	}
});

requirejs(["jquery", "jquery-ui"], () => {
	$(() => {
		requirejs(["browser/js/Hotpot"], Hotpot => {
			new Hotpot().begin();
		});
	});
});
