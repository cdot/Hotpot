/*@preserve Copyright (C) 2019 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser */

let suppression = "";
let min = ".min";

if (/debug/.test(window.location.search.substring(1))) {
    suppression = "t=" + Date.now();
    min = "";
}

requirejs.config({
    baseUrl: "../..",
    urlArgs: suppression, // caches suppression
    paths: {
        "jquery": "https://code.jquery.com/jquery-3.4.1" + min,
        "jquery-ui": "https://code.jquery.com/ui/1.12.1/jquery-ui" + min,
        "touch-punch": "https://cdn.jsdelivr.net/npm/jquery-ui-touch-punch@0.2.3/jquery.ui.touch-punch" + min
    }
});

requirejs(["jquery", "jquery-ui"], () => {
    $(() => {
        requirejs(["browser/js/TimelineView"], TimelineView => {
            let params = window.location.search.substring(1).split(/[&;]/);
            let service;
            for (let i = 0; i < params.length; i++) {
                let param = params[i].split('=');
                params[param[0]] = decodeURIComponent(param[1]);
            }
            new TimelineView(params);
        });
    });
});