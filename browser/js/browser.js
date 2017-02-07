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
        "thermostat:HW": { colour: "orange" },
        "thermostat:CH": { colour: "red" },
        "weather:MetOffice": {colour: "green" }
    };

    var poller;

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
    function requestState() {
        var val = parseInt($(this).data("value"));
        $(this).parents(".templated[data-field]").each(function() {
            var pin = ($(this).data("field"));

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
        });
    }

    function zeroExtend(num, len) {
        var str = "" + num;
        while (str.length < len)
            str = '0' + str;
        return str;
    }
    
    /**
     * Set the value of a typed field from a data value
     * Only used for non-object data
     * @param $ui the element to populate
     * @param value the value to populate it with
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
            var date = new Date(Math.round(value));
            var day = date.getDate();
            var month = date.getMonth() + 1;
            var year = date.getFullYear();
            var hours = date.getHours();
            var mins = date.getMinutes();
            v = day + "/" + month + "/" + year + " "
                + hours + ":" + zeroExtend(mins, 2);
        } else if (t === "duration") {
            value = value / 1000;
            var secs = value % 60;
            value = Math.floor(value / 60);
            var mins = value % 60;
            var hours = Math.floor(value / 60);
            v = (hours > 0 ? hours + "h " : "")
                + (mins > 0 ? mins + "m ": "")
                + (secs > 0 ? secs + "s" : "");
            if (v === "")
                v = "<1s";
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
                    g.addPoint(type + ":" + name, Time.now(), d);
            }
        }
        g.update();
    }

    /**
     * Populate UI. The structure of the UI is used to query
     * the data in the state report.
     * @param $obj the element to populate
     * @param {object} data the content of the datum
     */
    function populate($obj, container) {

        function subpopSubname($ui, path, subname, data) {
            var abspath = path + "/" + subname;
            var $child = $ui
                .find("[data-path='" + abspath + "']");
            if ($child.length === 0) {
                // The path doesn't exist, create it from template
                var tmpl = $ui.attr('data-use-template');
                if (tmpl) {
                    var tmpl = $("[data-define-template='" + tmpl
                                 + "']").html();
                    var $instance = $(tmpl);
                    // In case the template doesn't have a top level
                    if ($instance.length > 1)
                        $instance = $("<div></div>").append($instance);
                    $instance.addClass("templated");
                    // Make sure data has an index if it's an object
                    if (typeof data[subname] === "object")
                        data[subname].$index = subname;
                    // Make paths absolute in the template instance
                    $instance.find("[data-field]").each(
                        function() {
                            var field = $(this).attr("data-field");
                            var newpath = abspath + "/" + field;
                            // SMELL: setting data isn't enough for
                            // .find(), have to explicitly set the
                            // attr too.
                            $(this)
                                .attr("data-path", newpath);
                        });
                    $instance
                        .attr("data-path", abspath)
                        .attr("data-field", subname)
                        .find(".state_button")
                        .on("click", requestState);
                    $ui.append($instance);
                    $child = $instance;
                } else
                    console.log("Data has no element or template at "
                                + abspath);

            } else if ($child.length !== 1)
                throw "Same path found on " + $child.length
                + " elements: " + abspath;
            
            $child.each(function() {
                subpop($(this), data[subname], abspath);
            });
        }
        
        function subpop($thing, data, path) {
            $thing.find('.suspect').each(function() {
                $(this).removeClass("suspect");
            });
            if (typeof data === "object") {
                // There's sub-structure under here. Either find an element
                // with corresponding path or, failing that, create a new
                // one using the template named on the container
                var names = Object.keys(data).sort();
                for (var i in names) {
                    subpopSubname($thing, path, names[i], data);
                }
            } else { // leaf
                setValue($thing, data);
            }
        }
        
        $obj.find("[data-path]").each(function() {
            $(this).addClass("suspect");
        });
        $obj.find("[data-show-if]").hide();
        subpop($obj, container, "");
        $obj.find(".suspect").remove();
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
        $.get(
            "/ajax/state",
            function(raw) {
                var data;
                eval("data=" + raw);
                $("#comms_error").html("");
                $(".showif").hide(); // hide optional content
                populate($("#data"), data);
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
            var options = trace_options[na];
            options.min =
                {
                    x: Date.now() - graph_width
                };
            options.max = {
                x: Date.now()
            };
            
            var trace = g.addTrace(na, options);
            for (var j = 1; j < da.length; j += 2) {
                trace.addPoint(basetime + da[j], da[j + 1]);
            }
            // Closing point at same level as last measurement,
            // just in case it was a long time ago
            if (da.length > 1)
                trace.addPoint(Time.now(), da[da.length - 1]);
        }

        function fillGraph(data) {
            $canvas.autoscale_graph({
                render_label: function(axis, trd) {
                    if (axis === "x")
                        return new Date(trd).toString();
                    return (Math.round(trd * 10) / 10).toString();
                }
            });
            
            var g = $canvas.data("graph");
            
            for (var type in data)
                for (var name in data[type])
                    createTrace(g, data[type][name], type + ":" + name);
            
            g.update();
        }

        $.post(
            "/ajax/log",
            JSON.stringify(params),
            function(raw) {
                var data;
                eval("data=" + raw);
                fillGraph(data);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.log("Could not contact server  for logs: "
                            + errorThrown);
            });
    }

    function showDisplay(id) {
        $(".display").hide();
        $("#" + id).show();
        if (id === "graphs")
            $("#graph_canvas").data("graph").update();
    }
    
    /**
     * Add handlers and fire initial events to configure the graphs
     * and start the polling loop.
     */
    function configure() {

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
