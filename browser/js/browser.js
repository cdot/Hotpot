/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

/**
 * Main module for managing the browser interface to a hotpot server.
 */
//const Time = require("../../common/Time.js");
const Timeline = require("../../common/Timeline.js");
const DataModel = require("../../common/DataModel.js");

(function($) {
    "use strict";

    var requests = { off: 0, on: 1, boost: 2 };
    var state_name = [ "OFF", "ON", "BOOST" ];

    var update_backoff = 10; // seconds

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

    function updateTraces(data) {
        for (var type in data) { // thermostat
            for (var name in data[type]) { // HW
                var o = data[type][name];
                var d = (typeof o.temperature !== "undefined")
                    ? o.temperature : o.state;
                if (typeof traces[type+"-"+name] === "undefined")
                    traces[type+"-"+name] = [];
                if (typeof d !== "undefined") {
                    traces[type+"-"+name].push({time: data.time, value: d});
                    var te = $("#" + name + "-timeline > .timeline")
                        .data("timeline_editor");
                    if (te && typeof o.temperature !== "undefined")
                        te.setCrosshairs(data.time - Time.midnight(), d);
                }
            }
        }
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
            function buttClick(e) {
                requestState(e.data.service, -1, e.data.source);
                e.$div.remove();
            }
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
                    { service: service, source: req.source, $div: $div },
                    buttClick);
                $(pin + "requests").append($div);
            }
            for (var butt in requests)
                $(pin + butt).css("display", "inline");
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
                updateTraces(data);
                updateState(data);
                var g = $("#graph_canvas").data("graph");
                if (g)
                    g.render();
                setPollTimeout();
            })
            .fail(function(jqXHR, status, err) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server for update: "
                        + err + "</div>");
                setPollTimeout();
            });
    });

    function loadTraces(data) {
        for (var type in data) {
            for (var name in data[type]) {
                var trace = [];
                var tdata = data[type][name];
                var offset = tdata.shift();
                for (var i = 0; i < tdata.length; i += 2) {
                    trace.push({time: offset + tdata[i],
                                value: tdata[i + 1]});
                }
                traces[type + "-" + name] = trace;
            }
        }
    }

    function renderTrace(te, trace, style1, style2, is_binary) {
        if (typeof trace === "undefined")
            return;
        var ctx = te.$main_canvas[0].getContext("2d");
        var base = is_binary ? te.timeline.max / 10 : 0;
        var binary = is_binary ? te.timeline.max / 10 : 1;
        
        // Draw from current time back to 0
        ctx.strokeStyle = style1;
        ctx.beginPath();
        var midnight = Time.midnight();
        var i = trace.length - 1;
        var first = true;
        var now = trace[i].time;
        var lp;

        function nextPoint(tv, last_tv) {
            var tp = { time: tv.time - midnight,
                       value: base + tv.value * binary };
            var xy = te.tv2xy(tp);
            if (!last_tv) {
                ctx.moveTo(xy.x, xy.y);
                first = false;
            } else {
                if (is_binary && tp.value != last_tv.value) {
                    var lxy = te.tv2xy({ time: last_tv.time,
                                         value: tp.value } );
                    ctx.lineTo(lxy.x, lxy.y);
                }
                ctx.lineTo(xy.x, xy.y);
            }
            return tp;
        }
        
        while (i >= 0 && trace[i].time > midnight) {
            lp = nextPoint(trace[i--], lp);
        }
        ctx.stroke();

        // Draw from midnight back to same time yesterday
        ctx.strokeStyle = style2;
        ctx.beginPath();
        first = true;
        var stop = now - 24 * 60 * 60 * 1000;
        midnight -= 24 * 60 * 60 * 1000;
        lp = undefined;
        while (i >= 0 && trace[i].time > stop) {
            lp = nextPoint(trace[i--], lp);
        }
        ctx.stroke();
    }
    
    function renderTraces() {
        var service = $(this).data("service");
        var te = $(this).data("timeline_editor");
        
        renderTrace(te,
            traces["thermostat-" + service], "#00AA00", "#005500", false)
        renderTrace(te,
            traces["pin-" + service], "#eea500", "#665200", true)
    }
    
    function initialiseTimeline() {
        var $timeline = $(this);
        var service = $timeline.data("service");
        var DAY_IN_MS = 24 * 60 * 60 * 1000;
        var timeline = new Timeline({
            period: DAY_IN_MS, min: 0, max: 25
        });
        $timeline.TimelineEditor(timeline);
        var te = $timeline.data("timeline_editor");
        $timeline.on("redraw", renderTraces);

        var $tp = $("#" + service + "-point");
        var $tt = $("#" + service + "-time");
        var $th = $("#" + service + "-temperature");
        
        $tp
            .on("spin_up", function() {
                var now = Number.parseInt($(this).val());
                if (isNaN(now))
                    now = -1;
                if (now < te.timeline.nPoints() - 1) {
                    $(this).val(++now);
                    te.setSelectedPoint(now);
                }
            })
            .on("spin_down", function() {
                var now = Number.parseInt($(this).val());
                if (isNaN(now))
                    now = te.timeline.nPoints();
                if (now > 0) {
                    $(this).val(--now);
                    te.setSelectedPoint(now);
                }
            })
            .on("change", function() {
                var now = Number.parseInt($(this).val());
                if (now >= 0 && now < te.timeline.nPoints()) {
                    te.setSelectedPoint(now);
                }
            });

        $tt.on("change", function() {
            try {
                var now = Time.parse($(this).val());
                te.setSelectedTime(now);
            } catch (e) {
            }
        });
        
        $th.on("change", function() {
            var now = Number.parseFloat($(this).val());
            if (isNaN(now))
                return;
            te.setSelectedValue(now);
        });

        $("#" + service + "-removepoint")
            .on("click", function() {
                te.removeSelectedPoint();
            });
        
        $timeline.on("selection_changed", function() {
            var dp = te.getSelectedPoint();
            $tp.val(dp.index);
            $tt.val(Time.unparse(dp.time));
            $th.val(dp.value.toFixed(1));
        }).trigger("selection_changed");
    }

    function openTimeline(e) {
        var service = e.data;
        var $te = $("#" + service + "-timeline > .timeline");
        var te = $te.data("timeline_editor");
        $("#open-"+service+"-timeline").css("display", "none");
        $.getJSON("/ajax/getconfig/thermostat/"+service+
                  "/timeline", function(tl) {
                      $("#"+service+"-timeline").css("display", "block");
                      te.timeline = DataModel.remodel(
                          service, tl, Timeline.Model);
                      te.changed = false;
                      te.$main_canvas.trigger("redraw");
                  });
    }

    function closeTimeline(e) {
        var service = e.data;
        $("#"+service+"-timeline").css("display", "none");
        $("#open-"+service+"-timeline").css("display", "inline-block");
    };

    function saveTimeline(e) {
        closeTimeline(e);
        var service = e.data;
        var $te = $("#" + service + "-timeline > .timeline");
        var te = $te.data("timeline_editor");
        if (te.changed) {
            var timeline = te.timeline;
            console.log("Send timeline update to server");
            $.post("/ajax/setconfig/thermostat/" + e.data +
                   "/timeline",
                   // Can't use getSerialisable because it uses Q promises
                   JSON.stringify({ value: timeline }),
                   function(/*raw*/) {
                       te.changed = false;
                       $(document).trigger("poll");
                   });
        }
    }

    /**
     * Add handlers and fire initial events to configure the graphs
     * and start the polling loop.
     */
    function configure() {      
        $(".spinnable").Spinner();

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
            $("#save-"+service+"-timeline").click(service, saveTimeline);
            $("#cancel-"+service+"-timeline").click(service, closeTimeline);
        }
        $(".timeline").each(initialiseTimeline);

	$("#refresh_calendars").on("click", refreshCalendars);

	$(".switcher").on("click", function() {
            $(".display").hide();
            $("#" + $(this).data("to")).show();
        });
    
        // Get the last 24 hours of logs
        var params = { since: Date.now() - 24 * 60 * 60 };
        $.getJSON("/ajax/log", JSON.stringify(params), loadTraces)
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.log("Could not contact server  for logs: "
                            + errorThrown);
            });

        $(document).trigger("poll");
    }

    $(document).ready(configure);
})(jQuery);
