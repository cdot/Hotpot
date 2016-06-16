(function($) {
    "use strict";

    var server;
    var setup_backoff = 5; // seconds
    var update_backoff = 5; // seconds
    var update_rate = 5; // seconds

    var poller;
    var stop_polling = function () {
        if (poller) {
            clearTimeout(poller);
            poller = null;
        }
    };

    var getPath = function($node) {
        var path =[];
        $node.parents("[data-field]").each(function() {
            path.unshift($(this).data("field"));
        });
        path.push($node.data("field"));
        return path.join("/");
    };

    // User clicks edit text of a value field
    var edit_field = function() {
        stop_polling();
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

    // User toggles a checkbox field
    var toggle_field = function() {
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

    var renumberRules = function($rules) {
        var index = 0;
        $rules.find(".rule").each(function() {
            $(this).attr("data-field", index);
            index++;
        });
    };

    // User clicks add rule
    var add_rule = function() {
        var $self = $(this);
        stop_polling();
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

    // User clicks remove rule
    var remove_rule = function() {
        var $self = $(this);
        var $rules = $self.closest("[data-field='rule']");
        var $rule = $self.closest(".rule");
        stop_polling();
        $.post(server + "/remove_rule/" + getPath($self))
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

    // Support for user clicks that move rules
    var move_rule = function(dir) {
        var $self = $(this), $rel;
        var $rule = $self.closest(".rule");
        var $rules = $self.closest("[data-field='rule']");
        var $rel = (dir === "down") ? $rule.next() : $rule.prev();
        if ($rel.length === 0)
            return;
        stop_polling();
        $.post(server + "/move_rule_" + dir + "/" + getPath($self))
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

    // User clicks move rule down
    var move_down = function() {
        move_rule.call(this, "down");
        return false; // prevent repeated calls
    };

    // User clicks move rule up
    var move_up = function() {
        move_rule.call(this, "up");
        return false; // prevent repeated calls
    };

    var setValue = function($ui, value) {
        if ($ui.is(":checkbox")) {
            // Binary checkbox
            if (typeof value === "string")
                $ui.prop("checked", parseInt(value) === 1);
            else
                $ui.prop("checked", value);
        } else {
            // Text / number field
            $ui.text(value.toString());
        }
        $ui.trigger("data_change");
    };

    // Populate UI from structure
    var populate_field = function($ui, type, name, data) {
        if ($ui.is(":checkbox")) {
            // Binary checkbox
            if (typeof data[k] === "string")
                $ui.prop("checked", parseInt(data[k]) === 1);
            else
                $ui.prop("checked", data[k]);
        } else {
            // Text / number field
            $ui.text(data[k].toString());
        }
        $ui.trigger("data_change");
    };

    var populate = function($ui, name, data) {
        if (typeof data === "object") {
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

            if (typeof data.temperature !== "undefined") {
            }


            if (typeof data.active_rule !== "undefined") {
                $ui
                    .find(".rule")
                    .removeClass("active_rule")
                    .filter("[data-name='" + data.active_rule.toString() + "']")
                    .addClass("active_rule");
            }
        } else
            setValue($ui, data);
    };

    // Wake up on schedule and refresh the state
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

    var init_canvas = function($tc) {
        var $div = $tc.closest(".templated");
        var $df = $div.find("[data-field='temperature']");
        var $dt = $div.find("[data-field='target']");
        var $dw = $div.find("[data-field='window']");

        // Construct the autoscale graph and couple it to
        // DOM elements
        $tc.autoscale_graph({
            $thermostat: $div,
            current: function() {
                return parseFloat($df.text());
            },
            target: function() {
                return parseFloat($dt.text());
            },
            window: function() {
                return parseFloat($dw.text());
            }
        });

        $df.data("canvas", $tc)
            .on("data_change", function() {
                $(this).data("canvas").trigger("data_change");
            });
    };

    var expandTemplate = function(tmpl, name, info) {
        // Create a new data block from the template
        var $expansion = $(tmpl);
        $expansion.addClass("templated");
        $expansion.attr("data-field", name);
        // Copy the name up into an attribute to simplify finding the
        // active rule by name
        if (typeof info.name !== "undefined")
            $expansion.attr("data-name", info.name);
        // May be overwritten during field expansion, below
        $expansion
            .find("[data-field='name']")
            .first()
            .text(name);
        for (var item in info) {
            if (typeof info[item] === "object") {
                fillContainer($expansion.find(
                    "[data-field='" + item + "']").first(),
                              item, info[item]);
            } else
                setValue($expansion.find(
                    "[data-field='" + item + "']").first(), info[item]);
        }

        return $expansion;
    };

    /**
     * Fill a container with items created from a template.
     * @param $container the container
     * @param type the type of object in the container e.g. "thermostat"
     * @param data an array or hash of items that are used to configure the
     * itemsin the container
     */
    var fillContainer = function($container, type, data) {
        if (typeof data !== "object")
            throw "unexpected, can't template a non-container";

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

    var attachHandlers = function() {
        $(".editable").on("click", edit_field);
        $("input:checkbox").on("click", toggle_field);

        // Thermostat canvas
        $(".temperature_canvas").each(
            function() {
                init_canvas($(this));
            });

        // Rule handlers
        $(".remove_rule").on("click", remove_rule);
        $(".move_rule.up").on("click", move_up);
        $(".move_rule.down").on("click", move_down);

        // Disable the first move-up and the last move-down in
        // any group of rules
        $(".move_rule.up").first().addClass("disabled");
        $(".move_rule.down").last().addClass("disabled");
        $(".add_rule").on("click", add_rule);
    };

    var configure = function() {
        var urps = window.location.search.substring(1).split(/[&;]/);
        for (var i = 0; i < urps.length; i++) {
            var urp = urps[i].split("=");
            if (urp[0] === "ip")
                hotpot_ip = urp[1];
        }

        server = "http://" + hotpot_ip + ":" + hotpot_port;

        $("#server_url").text(server);

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
                setTimeout(first_ping, setup_backoff * 1000);
            });
    };

    $(document).ready(configure);
})(jQuery);
