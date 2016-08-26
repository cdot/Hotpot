/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

/**
 * Main module for managing the browser interface to a hotpot server.
 */
(function($) {
    "use strict";

    var ajax;
    var setup_backoff = 10; // seconds
    var update_backoff = 10; // seconds
    var update_rate = 10; // seconds

    var config;
    var apis;

    var trace_options = {
        "pin:HW": { type: "binary", colour: "yellow" },
        "pin:CH": { type: "binary", colour: "cyan" },
        "thermostat:HW" : { colour: "orange" },
        "thermostat:CH" : { colour: "red" },
        "weather:MetOffice": {colour: "green" }
    };

    var poller;
    function stopPolling() {
        if (poller) {
            clearTimeout(poller);
            poller = null;
        }
    }

    /**
     * Get the path of an element, as used in AJAX requests to
     * the server. The path corresponds to the hierarchical structure
     * of the config.json used by the server.
     * @param $node the element to get the path of
     * @return {string} /-separated path
     */
    function getPath($node) {
        var path = [];
        $node.parents("[data-field]").each(function() {
            path.unshift($(this).data("field"));
        });
        path.push($node.data("field"));
        return path.join("/");
    }

    /**
     * User clicks edit text of a value field
     */
    function editField() {
        stopPolling();
        $(this).edit_in_place({
            changed: function(s) {
                var $self = $(this);
                var params = {
                    value: s
                };
                $.post(ajax + "/set/" + getPath($self),
                       JSON.stringify(params))
                    .success(function() {
                        $self.text(s);
                    })
                    .always(function() {
                        $(document).trigger("poll");
                    });
            },
            cancel: function() {
                $(document).trigger("poll");
            }
        });
        return false; // prevent repeated calls
    }

    /**
     * User clicks a requests field
     * @return {boolean} false to terminate event handling
     */
    function changeRequest() {
        var val = parseInt($(this).val());
        $(this).parents(".templated[data-field]").each(function() {
            var pin = ($(this).data("field"));

            var params = {
                // until: , - no timeout
                source: "debug",
                pin: pin,
                state: val
            };
         
            // Away from home, set up to report after interval
            $.post(ajax + "/request",
                   JSON.stringify(params),
                   function(/*raw*/) {
                   });
            return false; // prevent repeated calls
        });
    }

    /**
     * Rule has been moved, need to renumber
     * @param $rules the rule list element
     */
    function renumberRules($rules) {
        var index = 0;
        $rules.find(".rule").each(function() {
            $(this).attr("data-field", index);
            index++;
        });
    }

    /**
     * User clicks add rule
     * @return {boolean} false to terminate event handling
     */
    function addRule() {
        var $self = $(this);
        stopPolling();
        var $rules = $self.closest("[data-field='rule']");
        var data = {
            name: "new rule",
            test: "function() { }"
        };
        $.post(ajax + "/insert_rule/" + getPath($self),
               JSON.stringify(data))
            .done(function() {
                // Add it to the DOM
                fillContainer(
                    $rules,
                    "rule",
                    data);
                attachHandlers($rules.find(".rule").last());
                renumberRules($self.closest("[data-field='rule']"));
            })
            .always(function() {
                $(document).trigger("poll");
            });
        return false; // prevent repeated calls
    }

    /**
     * User clicks remove rule
     * @return {boolean} false to terminate event handling
     */
    function removeRule() {
        var $self = $(this);
        var $rules = $self.closest("[data-field='rule']");
        var $rule = $self.closest(".rule");
        stopPolling();
        $.post(ajax + "/removeRule/" + getPath($self))
            .done(function() {
                // Remove it from the DOM
                $rule.remove();
                renumberRules($rules);
            })
            .always(function() {
                $(document).trigger("poll");
            });
        return false; // prevent repeated calls
    }

    /**
     * Support for user clicks that move rules
     * @param {int} dir the direction to move, -1 = up, 1 = down
     * @return {boolean} false to terminate event handling
     */
    function moveRule(dir) {
        var $self = $(this);
        var $rule = $self.closest(".rule");
        var $rules = $self.closest("[data-field='rule']");
        var $rel = (dir === "down") ? $rule.next() : $rule.prev();
        if ($rel.length === 0)
            return false;
        stopPolling();
        $.post(ajax + "/move_" + dir + "/" + getPath($self))
            .done(function() {
                if (dir === "down")
                    $rel.after($rule.remove());
                else
                    $rel.before($rule.remove());
                renumberRules($rules);
            })
            .always(function() {
                $(document).trigger("poll");
            });
        return false; // prevent repeated calls
    }

    /**
     * User clicks move rule down
     * @return {boolean} false to terminate event handling
     */
    function moveDown() {
        return moveRule.call(this, "down");
    }

    /**
     * User clicks move rule up
     * @return {boolean} false to terminate event handling
     */
    function moveUp() {
        return moveRule.call(this, "up");
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
            $ui .parents(".showif")
                .filter("." + $ui.data("field"))
                .each(function() {
                    $(this).show();
                });
        }

        if (t === "location") {
            var m = $ui.data("marker");
            if (typeof m !== "undefined") {
                m.setPosition({
                    lat: parseFloat(value.lat),
                    lng: parseFloat(value.lng)
                });
            }
            v = value.lat + "," + value.lng;
        } else {
            // Text / number field
            if (t === "float") {
                if (typeof value === "number")
                    v = value.toPrecision(5);
                else
                    v = typeof value;
            } if (t === "date") {
                v = new Date(Math.round(value)).toString();
            } else
                v = value.toString();
            $ui.text(v);
        }
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
                    g.addPoint(type + ":" + name, Time.nowSeconds(), d);
            }
        }
        g.update();
    }

    /**
     * Populate UI from structure
     * @param $ui the element to populate
     * @param {string} name the identifier for the datum
     * @param {object} data the content of the datum
     */
    function populate($ui, name, data) {
        function subpop() {
            populate($(this),
                     subname,
                     data[subname]);
        }
        if (typeof $ui.data("type") === "undefined"
            && typeof data === "object") {
            // Hierarchical sub-structure
            for (var subname in data) {
                $ui
                    .find("[data-field='" + subname + "']")
                    .first()
                    .each(subpop);
            }
        } else // leaf
            setValue($ui, data);
    }

    /**
     * Wake up on schedule and refresh the state
     */
    $(document).on("poll", function() {
        $.get(
            ajax + "/state",
            function(raw) {
                var data;
                eval("data=" + raw);
                $("#comms_error").html("");
                $(".showif").hide(); // hide optional content
                populate($("body"), "", data);
                updateGraph(data);
                poller = setTimeout(function() {
                    $(document).trigger("poll");
                }, update_rate * 1000);
            })
            .error(function(jqXHR, status, err) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server for update: "
                        + err + "</div>");
                poller = setTimeout(function() {
                    $(document).trigger("poll");
                }, update_backoff * 1000);
            });
    });

    $(document).on("initialise_graph", function() {
        var $tc = $("#graph_canvas");
        $.get(
            ajax + "/log",
            function(raw) {
                var data;
                eval("data=" + raw);
                $tc.autoscale_graph({
                    render_label: function(axis, trd) {
                        if (axis === "x")
                            return new Date(trd * 1000).toISOString();
                        return (Math.round(trd * 10) / 10).toString();
                    }
                });
                var g = $tc.data("graph");
                function createTrace(da, na) {
                    var basetime = da[0];
                    var options = trace_options[na];
                    options.min =
                        {
                            x: Date.now() / 1000 - 24 * 60 * 60, // 24 hours ago
                            y: options.type === "binary" ? 0 : 5
                        };
                    options.max = {
                        x: Date.now() / 1000,
                        y: options.type === "binary" ? 1 : 40
                    };
                    var trace = g.addTrace(na, options);
                    for (var j = 1; j < da.length; j += 2) {
                        trace.addPoint(basetime + da[j], da[j + 1]);
                    }
                    // Closing point at same level as last measurement,
                    // just in case it was a long time ago
                    if (da.length > 1)
                        trace.addPoint(Time.nowSeconds(), da[da.length - 1]);
                }
                for (var type in data)
                    for (var name in data[type])
                        createTrace(data[type][name], type + ":" + name);
                
                g.update();
            })
            .error(function(jqXHR, textStatus, errorThrown) {
                console.log("Could not contact server  for logs: "
                            + errorThrown);
            });

    });

    /**
     * Expand the given template string
     * @param {string} tmpl the template
     * @param {string} name the name of the datum
     * @param {object} data the data for the datum
     */
    var expandTemplate = function(tmpl, name, data) {
        // Create a new data block from the template
        var $expansion = $(tmpl);
        $expansion.addClass("templated");
        $expansion.attr("data-field", name);
        // May be overwritten during field expansion, below
        $expansion
            .find("[data-field='name']")
            .first()
            .text(name);
        for (var subname in data) {
            if (typeof data[subname] === "object") {
                fillContainer($expansion.find(
                    "[data-field='" + subname + "']").first(),
                              subname, data[subname]);
            } else
                setValue($expansion.find(
                    "[data-field='" + subname + "']").first(), data[subname]);
        }
        // Name radio group unique to this template
        $expansion
            .find("input[type='radio']")
            .each(function() {
                $(this)
                    .attr("name", "radio_" + name)
                    .addClass("pin_radio");
            });
        return $expansion;
    };

    /**
     * Fill a container with items created from a template.
     * @param $container the container
     * @param {string} type the type of object in the container
     * e.g. "thermostat"
     * @param {object} data an array or hash of items that are
     * used to configure the items in the container
     */
    var fillContainer = function($container, type, data) {
        if (typeof data !== "object")
            throw "Can't template a non-container" + JSON.stringify(data);

        var tmpl = $("[data-template='" + type + "']").html();
        if (!tmpl)
            return;

        // Each item in a type is named
        for (var name in data) {
            // name might be a hash key or an array index
            var $item = expandTemplate(tmpl, name, data[name]);
            $container.append($item);
        }
    };

    /**
     * Attach handlers to everything under the root
     * @param $root the root below which to attach handlers. undef
     * will attach to eveything in the document.
     */
    function attachHandlers($root) {
        $(".editable", $root).on("click", editField);

        // Rule handlers
        $(".removeRule", $root).on("click", removeRule);
        $(".move_rule.up", $root).on("click", moveUp);
        $(".move_rule.down", $root).on("click", moveDown);

        // Disable the first move-up and the last move-down in
        // any group of rules
        $(".move_rule.up", $root).first().addClass("disabled");
        $(".move_rule.down", $root).last().addClass("disabled");
        $(".add_rule", $root).on("click", addRule);

        $(".pin_radio").on("change", changeRequest);
    }

    /**
     * Populate the document by getting the configuration from
     * the server.
     */
    $(document).on("configure", function() {

        // Can't use getJSON because of the rule functions
        $.get(
            ajax + "/config",
            function(raw) {
                eval("config=" + raw);
                $("#comms_error").html("");
                // data is a map containing thermostat, pin, mobile
                for (var type in config) {
                    fillContainer(
                        $("[data-field='" + type + "']").first(),
                        type, config[type]);
                }
                // Templates all expanded
                attachHandlers();

                // immediately refresh to get the state ASAP
                $(document).trigger("poll");

                $(document).trigger("initialise_graph");
            })
            .error(function(jqXHR, textStatus, errorThrown) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server "
                        + " for setup: " + errorThrown
                        + " Will try again in " + setup_backoff
                        + " seconds</div>");
                setTimeout(function() {
                    $(document).trigger("configure");
                }, setup_backoff * 1000);
            });
    });

    function get_apis() {
        var urps = window.location.search.substring(1).split(/[&;]/);
        for (var i = 0; i < urps.length; i++) {
            var urp = urps[i].split("=");
            if (urp[0] === "ip")
                hotpot_ip = urp[1];
        }
        ajax = "/ajax";

        $.get(
            ajax + "/apis",
            function(raw) {
                apis = Utils.eval(raw, "browser");
                $(document).trigger("configure");
            })
            .error(function(jqXHR, textStatus, errorThrown) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server "
                        + " for setup: " + errorThrown
                        + " Will try again in " + setup_backoff
                        + " seconds</div>");
                setTimeout(get_apis, setup_backoff * 1000);
            });
    }

    $(document).ready(get_apis);
})(jQuery);
