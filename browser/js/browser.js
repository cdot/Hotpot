/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Main module for managing the browser interface to a hotpot server.
 */
(function($) {
    "use strict";

    var server;
    var setup_backoff = 5; // seconds
    var update_backoff = 5; // seconds
    var update_rate = 5; // seconds
    var apis;

    var poller;
    var stopPolling = function () {
        if (poller) {
            clearTimeout(poller);
            poller = null;
        }
    };

    /**
     * Get the path of an element, as used in AJAX requests to
     * the server. The path corresponds to the hierarchical structure
     * of the config.json used by the server.
     * @param $node the element to get the path of
     * @return {string} /-separated path
     */
    var getPath = function($node) {
        var path = [];
        $node.parents("[data-field]").each(function() {
            path.unshift($(this).data("field"));
        });
        path.push($node.data("field"));
        return path.join("/");
    };

    /**
     * User clicks edit text of a value field
     */
    var editField = function() {
        stopPolling();
        $(this).edit_in_place({
            changed: function(s) {
                var $self = $(this);
                var params = {
                    value: s
                };
                $.post(server + "/set/" + getPath($self),
                       JSON.stringify(params))
                    .success(function() {
                        $self.text(s);
                    })
                    .always(function() {
                        poll();
                    });
            },
            cancel: function() {
                poll();
            }
        });
        return false; // prevent repeated calls
    };

    /**
     * User toggles a checkbox field
     * @return {boolean} false to terminate event handling
     */
    var toggleField = function() {
        var $self = $(this);
        var params = {
            value: $self.prop("checked") ? 1 : 0
        };
        $.post(server + "/set/" + getPath($self),
               JSON.stringify(params))
            .always(function() {
                poll();
            });
        return false; // prevent repeated calls
    };

    /**
     * Rule has been moved, need to renumber
     * @param $rules the rule list element
     */
    var renumberRules = function($rules) {
        var index = 0;
        $rules.find(".rule").each(function() {
            $(this).attr("data-field", index);
            index++;
        });
    };

    /**
     * User clicks add rule
     * @return {boolean} false to terminate event handling
     */
    var addRule = function() {
        var $self = $(this);
        stopPolling();
        var $rules = $self.closest("[data-field='rule']");
        var data = {
            name: "new rule",
            test: "function() { }"
        };
        $.post(server + "/insert_rule/" + getPath($self),
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
                poll();
            });
        return false; // prevent repeated calls
    };

    /**
     * User clicks remove rule
     * @return {boolean} false to terminate event handling
     */
    var removeRule = function() {
        var $self = $(this);
        var $rules = $self.closest("[data-field='rule']");
        var $rule = $self.closest(".rule");
        stopPolling();
        $.post(server + "/removeRule/" + getPath($self))
            .done(function() {
                // Remove it from the DOM
                $rule.remove();
                renumberRules($rules);
            })
            .always(function() {
                poll();
            });
        return false; // prevent repeated calls
    };

    /**
     * Support for user clicks that move rules
     * @param {int} dir the direction to move, -1 = up, 1 = down
     * @return {boolean} false to terminate event handling
     */
    var moveRule = function(dir) {
        var $self = $(this);
        var $rule = $self.closest(".rule");
        var $rules = $self.closest("[data-field='rule']");
        var $rel = (dir === "down") ? $rule.next() : $rule.prev();
        if ($rel.length === 0)
            return false;
        stopPolling();
        $.post(server + "/move_" + dir + "/" + getPath($self))
            .done(function() {
                if (dir === "down")
                    $rel.after($rule.remove());
                else
                    $rel.before($rule.remove());
                renumberRules($rules);
            })
            .always(function() {
                poll();
            });
        return false; // prevent repeated calls
    };

    /**
     * User clicks move rule down
     * @return {boolean} false to terminate event handling
     */
    var moveDown = function() {
        return moveRule.call(this, "down");
    };

    /**
     * User clicks move rule up
     * @return {boolean} false to terminate event handling
     */
    var moveUp = function() {
        return moveRule.call(this, "up");
    };

    /**
     * Set the value of a typed field from a data value
     * Only used for non-object data
     * @param $ui the element to populate
     * @param value the value to populate it with
     */
    var setValue = function($ui, value) {
        var t = $ui.data("type"), v;
        if (typeof t === "undefined")
            t = "string";
        if (t === "boolean") {
            // Binary checkbox
            if (typeof value === "string")
                $ui.prop("checked", parseInt(value) === 1);
            else
                $ui.prop("checked", value);
        } else if (t === "location") {
            var lat = value.latitude, lon = value.longitude;
            $ui.data("map").panTo({lat: lat, lng: lon});
        } else {
            // Text / number field
            if (t === "float") {
                if (typeof value === "number")
                    v = value.toPrecision(5);
                else
                    v = typeof value;
            } else
                v = value.toString();
            $ui.text(v);
        }
        $ui.trigger("data_change");
    };

    /**
     * Populate UI from structure
     * @param $ui the element to populate
     * @param {string} name the identifier for the datum
     * @param {object} data the content of the datum
     */
    var populate = function($ui, name, data) {
        if (typeof $ui.data("type") === "undefined"
            && typeof data === "object") {
            for (var subname in data) {
                $ui
                    .find("[data-field='" + subname + "']")
                    .first()
                    .each(function() {
                        populate($(this),
                                 subname,
                                 data[subname]);
                    });
            }
        } else // leaf
            setValue($ui, data);
    };

    /**
     * Wake up on schedule and refresh the state
     */
    var poll = function() {
        $.get(
            server + "/state",
            function(raw) {
                var data;
                eval("data=" + raw);
                $("#comms_error").html("");
                populate($("body"), "", data);
                poller = setTimeout(poll, update_rate * 1000);
            })
            .error(function(jqXHR, status, err) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server "
                        + server + " for update: " + err + "</div>");
                poller = setTimeout(poll, update_backoff * 1000);
            });
    };

    /**
     * Add a trace to the temperature graph canvas
     * @param $df the field that carries the temperature
     */
    function addTrace(name, $df) {
        var $tc = $("#temperature_canvas");

        $df.on("data_change", function() {
            // addpoint(trace, x, y)
            $tc.trigger("addpoint",
                        {
                            trace: name,
                            point: {
                                x: Date.now(),
                                y: parseFloat($df.text())
                            }
                        });
        });
    }

    function initialiseTemperatureGraph() {
        var $tc = $("#temperature_canvas");
        $tc.autoscale_graph({
            render_label: function(axis, data) {
                if (axis === "minx" || axis === "maxx")
                    return new Date(data).toString();
                return data.toPrecision(4).toString();
            },
            min: {
                x: Date.now() - 8 * 60 * 60 * 1000,
                y: 5
            },
            max: {
                x: Date.now(),
                y: 40
            }
        });
        $.get(
            server + "/log",
            function(raw) {
                var data;
                eval("data=" + raw);
                for (var i in data.thermostat) {
                    var th = data.thermostat[i];
                    for (var j = 0; j < th.data.length; j += 2)
                        $tc.trigger("addpoint",
                                    {
                                        trace: i,
                                        point: {
                                            x: th.basetime + th.data[j],
                                            y: th.data[j + 1]
                                        }
                                    });
                }
            })
            .error(function(jqXHR, textStatus, errorThrown) {
                console.log("Could not contact server "
                        + server + " for logs: " + errorThrown);
            });

    }

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
    var attachHandlers = function($root) {
        $(".editable", $root).on("click", editField);
        $("input:checkbox", $root).on("click", toggleField);

        $("[data-field='temperature']").each(
            function() {
                var $div = $(this).closest(".templated");
                if ($div.length === 0)
                    return; // in a template
                addTrace($div.attr("data-field"), $(this));
            });
        $("[data-field='env_temp']").each(
            function() {
                addTrace("Outside", $(this));
            });

        // Rule handlers
        $(".removeRule", $root).on("click", removeRule);
        $(".move.up", $root).on("click", moveUp);
        $(".move.down", $root).on("click", moveDown);

        // Disable the first move-up and the last move-down in
        // any group of rules
        $(".move_rule.up", $root).first().addClass("disabled");
        $(".move_rule.down", $root).last().addClass("disabled");
        $(".add_rule", $root).on("click", addRule);
    };

    /**
     * Populate the document by getting the configuration from
     * the server.
     */
    var configure = function() {

        $("#server_url").text(server);

        $("body").append("<script src='https://maps.googleapis.com/maps/api/js"
                         + "?key=" + apis.google_maps.browser_key
                         + "&callback=initialiseMap' async defer></script>");

        // Can't use getJSON because of the rule functions
        $.get(
            server + "/config",
            function(raw) {
                var data;
                eval("data=" + raw);
                $("#comms_error").html("");
                // data is a map containing thermostat, pin, mobile
                for (var type in data) {
                    fillContainer(
                        $("[data-field='" + type + "']").first(),
                        type, data[type]);
                }
                initialiseTemperatureGraph();
                attachHandlers();

                // immediately refresh to get the state
                setTimeout(poll, 1);
            })
            .error(function(jqXHR, textStatus, errorThrown) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server "
                        + server + " for setup: " + errorThrown
                        + " Will try again in " + setup_backoff
                        + " seconds</div>");
                setTimeout(configure, setup_backoff * 1000);
            });
    };

    var get_apis = function() {
        var urps = window.location.search.substring(1).split(/[&;]/);
        for (var i = 0; i < urps.length; i++) {
            var urp = urps[i].split("=");
            if (urp[0] === "ip")
                hotpot_ip = urp[1];
        }

        server = "http://" + hotpot_ip + ":" + hotpot_port;

        $("#server_url").text(server);

        $.get(
            server + "/apis",
            function(raw) {
                eval("apis=" + raw);
                configure();
            })
            .error(function(jqXHR, textStatus, errorThrown) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server "
                        + server + " for setup: " + errorThrown
                        + " Will try again in " + setup_backoff
                        + " seconds</div>");
                setTimeout(get_apis, setup_backoff * 1000);
            });
    };

    $(document).ready(get_apis);
})(jQuery);

// Global callback invoked when google maps API is ready
// Attach a map to each data-type=location
function initialiseMap() {
    (function($) {
        $(".map").each(function() {
            var $div = $(this).closest(".templated");
            if ($div.length === 0)
                return; // in a template
            var m = new google.maps.Map(
                this,
                { zoom: 12 });
            $(this).data("map", m);
        });
    })(jQuery);
}
