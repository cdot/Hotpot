(function($) {
    "use strict";

    var server;
    var setup_backoff = 5; // seconds
    var update_backoff = 5; // seconds
    var update_rate = 1; // seconds

    // Edit text of a value field
    var edit_field = function() {
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
                    });
            }
        });
    };

    // Toggle a checkbox field
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
            .success(function() {
            });
    };

    // Edit text of a rule
    var edit_rule = function() {
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
                    .success(function() {
                        $self.text(s);
                    });
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
                for (var i in data[k]) {
                    var rule = data[k][i];
                    rule.index = i;
                    var $tbody = $self.find("tbody");
                    var $row = $tbody.find(".rule" + rule.index);
                    if ($row.length === 0) {
                        // Create new row
                        $row = $($("#rule_template").html());
                        $row.addClass("rule" + rule.index);
                        $row.addClass("rule");
                        $row.data("index", rule.index);
                        $tbody.append($row);
                        $row.find(".editable")
                            .on("click", edit_rule);
                    }
                    // Recurse onto each text field
                    populate(rule, $row);
                }
            } else  if ($self.is(":checkbox")) {
                // Binary checkbox
                $self.prop("checked", parseInt(data[k]) === 1);
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
    };

    var ping = function() {
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
                setTimeout(ping, update_rate * 1000);
            })
            .error(function(jqXHR, status, err) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server "
                        + server + " for update: " + err + "</div>");
                setTimeout(ping, update_backoff * 1000);
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
        server = "https://" + hotpot_ip + ":13196";
        // Can't use getJSON because of the rule functions
        $.get(
            server,
            function(raw) {
                var data;
                eval("data=" + raw);
                $("#comms_error").html("");
                $("#time").text(data.time);
                for (var i in data.thermostats) {
                    // Create a new data block from the template
                    var th = data.thermostats[i];
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
                    $("#controllers").append($div);
                }
                setTimeout(ping, 1000);
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
