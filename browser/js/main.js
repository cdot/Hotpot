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
        "jquery": `https://code.jquery.com/jquery-3.4.1${min}`,
        "jquery-ui": `https://code.jquery.com/ui/1.12.1/jquery-ui${min}`,
        "js-cookie": `https://cdnjs.cloudflare.com/ajax/libs/js-cookie/2.2.0/js.cookie${min}`,
        "additional-methods": `https://cdnjs.cloudflare.com/ajax/libs/jquery-validate/1.19.1/additional-methods${min}`,
        "jquery-csv": "https://cdnjs.cloudflare.com/ajax/libs/jquery-csv/1.0.5/jquery.csv" + min,
		"jquery-touch-events": `//cdnjs.cloudflare.com/ajax/libs/jquery-touch-events/2.0.3/jquery.mobile-events${min}`
    }
});

requirejs(["jquery", "jquery-ui"], (jq, jqui) => {
	requirejs(["browser/js/Hotpot"], Hotpot => new Hotpot().begin());
});
