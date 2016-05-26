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

    // User clicks edit text of a value field
    var edit_field = function() {
        stop_polling();
        $(this).edit_in_place({
            changed: function(s) {
                var $self = $(this);
                var $controller = $self.closest(".controller");
                var data = {
                    command: "set_" + $self.data("field"),
                    id: $controller.data("name"),
                    value: s
                };
                $.post(server,
                       JSON.stringify(data))
                    .success(function() {
                        $self.text(s);
                        poll();
                    });
            }
        });
    };

    // User toggles a checkbox field
    var toggle_field = function() {
        var $self = $(this);
        var $controller = $self.closest(".controller");
        var data = {
            command: "set_" + $self.data("field"),
            id: $controller.data("name"),
            value: $self.prop("checked") ? 1 : 0
        };
        $.post(server,
               JSON.stringify(data))
            .always(function() {
                poll();
            });
    };

    // User clicks add rule
    var add_rule = function() {
        var $self = $(this);
        var $controller = $self.closest(".controller");
        stop_polling();
        var data = {
            command: "insert_rule",
            id: $controller.data("name"),
            name: "new rule",
            test: "function() { }",
            index: -1
        };
        $.post(server,
               JSON.stringify(data))
            .always(function() {
                poll();
            });
    };

    // User clicks remove rule
    var remove_rule = function() {
        var $self = $(this);
        var $controller = $self.closest(".controller");
        var $rule = $self.closest(".rule");
        var index = parseInt($rule.find("[data-field='index']").text());
        stop_polling();
        var data = {
            command: "remove_rule",
            id: $controller.data("name"),
            index: index
        };
        $.post(server,
               JSON.stringify(data))
            .done(function() {
                $rule.remove();
            })
            .always(function() {
                poll();
            });
    };

    // Support for user clicks that move rules
    var move_rule = function(dir) {
        var $self = $(this);
        var $controller = $self.closest(".controller");
        var $rule = $self.closest(".rule");
        var index = parseInt($rule.find("[data-field='index']").text());
        stop_polling();
        var data = {
            command: "move_rule",
            id: $controller.data("name"),
            index: index,
            value: dir
        };
        $.post(server,
               JSON.stringify(data))
            .done(function() {
                $rule.remove();
            })
            .always(function() {
                poll();
            });
    };

    // User clicks move rule down
    var move_down = function() {
        move_rule.call(this, +1);
    };

    // User clicks move rule up
    var move_up = function() {
        move_rule.call(this, -1);
    };

    // User clicks edit text of a rule
    var edit_rule = function() {
        stop_polling();
        $(this).edit_in_place({
            changed: function(s) {
                var $self = $(this);
                var $controller = $self.closest(".controller");
                var $row = $self.closest(".rule");
                var newrule = {
                    name: $row.find("[data-field='name']").text(),
                    test: $row.find("[data-field='test']").text()
                };
                newrule[$self.data("field")] = s;
                var data = {
                    command: "replace_rule",
                    id: $controller.data("name"),
                    index: $row.data("index"),
                    name: newrule.name,
                    test: newrule.test
                };
                $.post(server,
                       JSON.stringify(data))
                    .done(function() {
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
    };

    // Populate a field from pin or thermostat record
    var populate = function(data, $div) {
        var k;

        var populate_field = function() {
            var $self = $(this);
            if (k === "rules") {
                // Rule array
                var $tbody = $self.find("tbody");
                $tbody.find(".rule").remove();
                data[k].sort(function(a, b) {
                    return a.index - b.index;
                });
                for (var i = 0; i < data[k].length; i++) {
                    var rule = data[k][i];
                    // Create new row
                    var $row = $($("#rule_template").html());
                    $row.addClass("rule" + rule.index);
                    $row.addClass("rule");
                    $row.data("index", rule.index);
                    $row.attr("name", rule.name);
                    $tbody.append($row);
                    $row.find(".editable")
                        .on("click", edit_rule);
                    $row.find(".remove")
                        .on("click", remove_rule);
                    if (i === 0)
                        $row.find(".move.up").addClass("disabled");
                    else
                        $row.find(".move.up")
                        .on("click", move_up);
                    if (i === data[k].length - 1)
                        $row.find(".move.down").addClass("disabled");
                    else
                        $row.find(".move.down")
                        .on("click", move_down);
                    // Recurse onto each text field
                    populate(rule, $row);
                }
            } else if ($self.is(":checkbox")) {
                // Binary checkbox
                if (typeof data[k] === "string")
                    $self.prop("checked", parseInt(data[k]) === 1);
                else
                    $self.prop("checked", data[k]);
            } else {
                // Text / number field
                $self.text(data[k].toString());
            }
            $self.trigger("data_change");
        };

        if (typeof $div === "undefined")
            $div = $("#" + data.name);
        $div.data("name", data.name);
        for (k in data) {
            $div
                .find("[data-field='" + k + "']")
                .first()
                .each(populate_field);
        }

        if (typeof data.active_rule !== "undefined")
            $div
            .find(".rule")
            .filter("[name='" + data.active_rule.toString() + "']")
            .addClass("active_rule");
    };

    var poll = function() {
        $.get(
            server,
            function(raw) {
                var data, i;
                eval("data=" + raw);
                $("#comms_error").html("");
                $("#time").text(data.time);
                for (i in data.thermostats)
                    populate(data.thermostats[i]);
                for (i in data.pins)
                    populate(data.pins[i]);
                poller = setTimeout(poll, update_rate * 1000);
            })
            .error(function(jqXHR, status, err) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server "
                        + server + " for update: " + err + "</div>");
                poller = setTimeout(poll, update_backoff * 1000);
            });
    };

    var init_canvas = function($div) {
        var $df = $div.find("[data-field='temperature']");
        var $dt = $div.find("[data-field='target']");
        var $dw = $div.find("[data-field='window']");
        var $tc = $div.find(".temperature_canvas");

        $tc.autoscale_graph({
            $controller: $div,
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

    var first_ping = function() {
        var urps = window.location.search.substring(1).split(/[&;]/);
        for (var i = 0; i < urps.length; i++) {
            var urp = urps[i].split("=");
            if (urp[0] === "ip")
                hotpot_ip = urp[1];
        }

        server = "http://" + hotpot_ip + ":13196";
        // Can't use getJSON because of the rule functions
        $.get(
            server,
            function(raw) {
                var data;
                eval("data=" + raw);
                $("#comms_error").html("");
                $("#time").text(data.time);
                for (var j in data.thermostats) {
                    // Create a new data block from the template
                    var th = data.thermostats[j];
                    var html = $("#controller_template").html();
                    var $div = $("<div id='" + th.name
                        + "'>" + html + "</div>");
                    $div.addClass("controller");
                    $div.find(".editable")
                        .on("click", edit_field);
                    $div.find("input:checkbox")
                        .on("click", toggle_field);
                    init_canvas($div);
                    populate(th, $div);
                    $div.find(".add_rule")
                        .on("click", add_rule);
                    $("#controllers").append($div);
                }
                setTimeout(poll, 1000);
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

    $(document).ready(first_ping);
})(jQuery);
