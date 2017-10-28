/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

/**
 * Main module for managing the browser interface to a hotpot server.
 */
(function($) {
    "use strict";

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
     * User clicks a requests field
     * @return {boolean} false to terminate event handling
     */
    function requestState(pin, val) {
        var params = {
            // until: , - no timeout
            source: "Browser",
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

    function duration(value) {
        value = value / 1000;
        var secs = value % 60;
        value = Math.floor(value / 60);
        var mins = value % 60;
        var hours = Math.floor(value / 60);
        var v = (hours > 0 ? hours + "h " : "")
            + (mins > 0 ? mins + "m ": "")
            + (secs > 0 ? secs + "s" : "");
        if (v === "")
            v = "<1s";
        return v;
    }
    
    /**
     * Set the value of a typed field from a data value
     * Only used for non-object data
     * @param $ui the element to updateState
     * @param value the value to updateState it with
     */
    function setValue($ui, value) {
        var t = $ui.data("type"), v;
        if (typeof t === "undefined")
            t = "string";

        if (typeof value !== "undefined" && value !== null) {
            // Only show if they have a value
            $ui .parents("[data-show-if]")
                .filter(function() {
                    return $(this).attr("data-show-if")
                        .includes($ui.attr("data-field"))
                })
                .each(function() {
                    $(this).show();
                });
        }

        // Text / number field
        if (t === "float") {
            if (typeof value === "number")
                v = value.toFixed(2);
            else
                v = typeof value;
        } else if (t === "datime") {
             v = datime(value);
        } else if (t === "duration") {
            v = duration(value);
        } else if (t === "intbool") {
            v = (value + 0 === 0 ? "OFF" : "ON");
        } else if (t === "date") {
            v = new Date(Math.round(value)).toString();
            v = v.replace(/\s\S+\s\(.*$/, "");
        } else
            v = value.toString();
        $ui.text(v);

        // tell the graph
        $ui.trigger("data_change");
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
                if (typeof d !== "undefined")
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
            $(th + "temp").text(Math.round(
                10 * obj.thermostat[service].temperature) / 10);
            if (obj.pin[service].state === 0) {
                $(pin + "state").text("OFF");
                $(pin + "off").css("display", "none");
                $(pin + "on").css("display", "inline");
                $(pin + "boost").css("display", "inline");
            } else {
                $(pin + "state").text("ON");
                $(pin + "off").css("display", "inline");
                $(pin + "on").css("display", "none");
                $(pin + "boost").css("display", "none");
            }
            $(pin + "reason").text(obj.pin[service].reason);
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

    function showDisplay(id) {
        $(".display").hide();
        $("#" + id).show();
        if (id === "graphs")
            $("#graph_canvas").data("graph").render();
    }
    
    /**
     * Add handlers and fire initial events to configure the graphs
     * and start the polling loop.
     */
    function configure() {
        var states = { off: 0, on: 1, boost: 2 };
        
        for (var service in { CH: 1, HW: 1 }) {
            for (var fn in states) {
                $("#pin-" + service + "-"+fn).click({
                    service: service, fn: fn },
                    function(e) {
                        requestState(e.data.service, states[e.data.fn]);
                    });
            }
        }
	$("#refresh_calendars").on("click", refreshCalendars);
	$("#to-controls").on("click", function() {
            showDisplay("data");
        });
	$("#to-graphs").on("click", function() {
            showDisplay("graphs");
        });
        $("#graph_canvas").each(initialiseGraph);
        
        $(document).trigger("poll");
    }

    $(document).ready(configure);
})(jQuery);
