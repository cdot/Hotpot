/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

/**
 * Main module for managing the browser interface to a hotpot server.
 */
const Utils = require("common/Utils.js");
//const Time = require("common/Time.js");
const Timeline = require("common/Timeline.js");
const DataModel = require("common/DataModel.js");

(function($) {
    "use strict";

    var requests = { off: 0, on: 1, boost: 2 };
    var state_name = [ "OFF", "ON", "BOOST" ];

    var update_backoff = 10; // seconds

    var graph_width = 24 * 60 * 60 * 1000; // milliseconds

    var trace_options = {
        "pin:HW": { type: "binary", colour: "yellow" },
        "pin:CH": { type: "binary", colour: "cyan" },
        "thermostat:HW": { type: "continuous", colour: "orange" },
        "thermostat:CH": { type: "continuous", colour: "red" },
        "weather:MetOffice": { type: "continuous", colour: "green" }
    };

    var poller;

    var traces = {};

    function refreshCalendars() {
        $("#refresh_calendars").attr("disabled", "disabled");
        $.get("/ajax/refresh_calendars",
	function() {
            $("#refresh_calendars").removeAttr("disabled");
            $(document).trigger("poll");
        });
    }

    /**
     * User clicks a request button
     * @return {boolean} false to terminate event handling
     */
    function requestState(pin, val, source) {
        if (typeof source === "undefined") source = "Browser";
        var params = {
            // until: , - no timeout
            source: source,
            pin: pin,
            state: val
        };

        // Away from home, set up to report after interval
        $.post("/ajax/request",
               JSON.stringify(params),
               function(/*raw*/) {
                   $(document).trigger("poll");
               });
        return false; // prevent repeated calls
    }

    function zeroExtend(num, len) {
        var str = "" + num;
        while (str.length < len)
            str = '0' + str;
        return str;
    }

    function datime(value) {
        var date = new Date(Math.round(value));
        var day = date.getDate();
        var month = date.getMonth() + 1;
        var year = date.getFullYear();
        var hours = date.getHours();
        var mins = date.getMinutes();
        return day + "/" + month + "/" + year + " "
            + hours + ":" + zeroExtend(mins, 2);
    }

    function updateGraph(data) {
        var g = $("#graph_canvas").data("graph");
        if (!g)
            return; // not ready yet
        for (var type in data) {
            for (var name in data[type]) {
                var o = data[type][name];
                var d = (typeof o.temperature !== "undefined")
                    ? o.temperature : o.state;
                if (typeof d !== "undefined" &&
                    typeof traces[type+":"+name] !== "undefined")
                    traces[type+":"+name].addPoint(Time.now(), d);
            }
        }
        g.render();
    }

    /**
     * Update the UI with state information from the structure
     * passed in.
     * @param {object} obj the structure containing the state (as
     * received from /ajax/state)
     */
    function updateState(obj) {
        for (var service in { CH: 1, HW: 1 }) {
            var th = "#thermostat-" + service + "-";
            var pin = "#pin-" + service + "-";
            var tcur = Math.round(
                10 * obj.thermostat[service].temperature) / 10;
            var ttgt = Math.round(
                10 * obj.thermostat[service].target) / 10;
            if (tcur > ttgt)
                $(th + "diff").text(">=");
            else if (tcur < ttgt)
                $(th + "diff").text("<");
            else
                $(th + "diff").text("=");
            $(th + "temp").text(tcur);
            $(th + "target").text(ttgt);
            var ptext = (obj.pin[service].state === 0) ? "OFF" : "ON";
            $(pin + "state").text(ptext);
            $(pin + "reason").text(obj.pin[service].reason);
            $(pin + "requests").empty();
            var browser_requesting;
            for (var i = 0; i < obj.pin[service].requests.length; i++) {
                var req = obj.pin[service].requests[i];
                if (req.source === "Browser")
                    browser_requesting = req;
                var $div = $("<div></div>");
                $div.append("<span>" + req.source + " is requesting " +
                            state_name[req.state] + " </span>");
                var $butt = $("<button>Clear</button>")
                $div.append($butt);
                $butt.click(
                    { service: service, source: req.source },
                    function (e) {
                        requestState(e.data.service, -1, e.data.source);
                        $div.remove();
                    });
                $(pin + "requests").append($div);
            }
            for (var butt in requests)
                $(pin + butt).css("display", "inline");
            var reqstate;
            if (typeof browser_requesting !== "undefined") {
                if (browser_requesting.state == 0)
                    $(pin + "off").css("display", "none");
                else if (browser_requesting.state == 1)
                    $(pin + "on").css("display", "none");
                else if (browser_requesting.state == 2)
                    $(pin + "boost").css("display", "none");
            }
        }
    }

    /**
     * Wake up on schedule and refresh the state
     */
    $(document).on("poll", function() {
        function setPollTimeout() {
            poller = setTimeout(function() {
                $(document).trigger("poll");
            }, update_backoff * 1000)
        }

        if (poller) {
            clearTimeout(poller);
            poller = undefined;
        }
        $.getJSON(
            "/ajax/state",
            function(data) {
                $("#comms_error").html("");
                $(".showif").hide(); // hide optional content
                updateState(data);
                updateGraph(data);
                setPollTimeout();
            })
            .fail(function(jqXHR, status, err) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server for update: "
                        + err + "</div>");
                setPollTimeout();
            });
    });

    function initialiseTimeline() {
        var $canvas = $(this);
        var DAY_IN_MS = 24 * 60 * 60 * 1000;
        var timeline = new Timeline({
            period: DAY_IN_MS, min: 0, max: 25
        });
        $canvas.TimelineEditor(timeline);
        $canvas.on("change", function() {
            // Really don't want to send an update to the server until we're
            // finished moving.
            $(this).data("timeline").changed = true;
        });
    }

    // Initialise the graph canvas by requesting
    function initialiseGraph() {
        var $canvas = $(this);
        var params = { since: Date.now() - graph_width };

        function createTrace(g, da, na) {
            var basetime = da[0];
            var options = {
                legend: na,
                min: {
                    t: Date.now() - graph_width
                },
                max: {
                    t: Date.now()
                },
                colour: trace_options[na].colour
            };

            var trace;
            if (trace_options[na].type == "binary")
                trace = new BinaryTrace(options);
            else
                trace = new Trace(options);
            for (var j = 1; j < da.length; j += 2) {
                trace.addPoint(basetime + da[j], da[j + 1]);
            }
            traces[na] = trace;
            g.addTrace(trace);
            // Closing point at same level as last measurement,
            // just in case it was a long time ago
            if (da.length > 1)
                trace.addPoint(Time.now(), da[da.length - 1]);
        }

        function fillGraph(data) {
            $canvas.autoscale_graph({
                render_tip_t: function(trd) {
                    return datime(trd);
                },
                render_tip_s: function(trd) {
                    return (Math.round(trd * 10) / 10).toString();
                }
            });

            var g = $canvas.data("graph");

            for (var type in data)
                for (var name in data[type])
                    createTrace(g, data[type][name], type + ":" + name);

            g.render();
        }

        $.getJSON("/ajax/log", JSON.stringify(params), fillGraph)
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.log("Could not contact server  for logs: "
                            + errorThrown);
            });
    }

    function openTimeline(e) {
        var service = e.data;
        var te = $("#"+service+"-timeline-canvas").data("timeline");
        $("#open-"+service+"-timeline").css("display", "none");
        $.getJSON("/ajax/getconfig/thermostat/"+service+
                  "/timeline", function(tl) {
                      $("#"+service+"-timeline").css("display", "block");
                      te.timeline = DataModel.remodel(
                          service, tl, Timeline.Model);
                      te.changed = false;
                      te.render();
                  });
    }

    function closeTimeline(e) {
        var service = e.data;
        $("#"+service+"-timeline").css("display", "none");
        $("#open-"+service+"-timeline").css("display", "inline-block");
        // Update the timeline on the server here if it
        // has changed
        var te = $("#"+service+"-timeline-canvas").data("timeline");
        if (te.changed) {
            var timeline = te.timeline;
            console.log("Send timeline update to server");
            $.post("/ajax/setconfig/thermostat/" + service +
                   "/timeline",
                   // Can't use getSerialisable because it uses Q promises
                   JSON.stringify({ value: timeline }),
                   function(/*raw*/) {
                       $(document).trigger("poll");
                   });
        }
    }

    /**
     * Add handlers and fire initial events to configure the graphs
     * and start the polling loop.
     */
    function configure() {
        for (var service in { CH: 1, HW: 1 }) {
            for (var fn in requests) {
                $("#pin-" + service + "-"+fn).click(
                    { service: service, fn: fn },
                    function(e) {
                        requestState(e.data.service, requests[e.data.fn]);
                    });
                $("#"+service+"-timeline").css("display", "none");
            }
            $("#open-"+service+"-timeline").click(service, openTimeline);
            $("#close-"+service+"-timeline").click(service, closeTimeline);
        }
        $(".timeline_canvas").each(initialiseTimeline);

	$("#refresh_calendars").on("click", refreshCalendars);

	$(".switcher").on("click", function() {
            $(".display").hide();
            $("#" + $(this).data("to")).show();
            $("#graph_canvas").data("graph").render();
        });
        $("#graph_canvas").each(initialiseGraph);

        $(document).trigger("poll");
    }

    $(document).ready(configure);
})(jQuery);
