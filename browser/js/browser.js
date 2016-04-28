(function($) {
    "use strict";

    var server = "https://192.168.1.16:13196";
    var setup_backoff = 5; // seconds
    var update_backoff = 5; // seconds
    var update_rate = 1; // seconds

    // Edit text of a field
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
                $.post("https://192.168.1.15:13196",
                       JSON.stringify(data))
                    .success(function() {
                        $self.text(s);
                    });
            }
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
                $.post("https://192.168.1.15:13196",
                       JSON.stringify(data))
                    .success(function() {
                        $self.text(s);
                    });
            }
        });
    };

    // Populate from pin or thermostat record
    var populate = function(data, $div) {
        var populate_field = function() {
            if (typeof data[k] !== "object") {
                $(this).text(data[k]);
                return;
            }
            // Rule array
            for (var i in data[k]) {
                var rule = data[k][i];
                var $tbody = $(this).find("tbody");
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
                populate(rule, $row);
            }
        };

        if (typeof $div === "undefined")
            $div = $("#" + data.name);
        $div.data("name", data.name);
        for (var k in data) {
            $div
                .find("[data-field='" + k + "']")
                .first()
                .each(populate_field);
        }
    };

    var ping = function() {
        $.getJSON(
            server,
            function(data) {
                var i;
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
                        + server + " for update</div>");
                setTimeout(ping, update_backoff * 1000);
            });
    };

    var first_ping = function() {
        $.getJSON(
            server,
            function(data) {
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
                    populate(th, $div);
                    $("#controllers").append($div);
                }
                setTimeout(ping, 1000);
            })
            .error(function(jqXHR, textStatus, errorThrown) {
                $("#comms_error").html(
                    "<div class='error'>Could not contact server "
                        + server + " for setup. Will try again in "
                        + setup_backoff
                        + " seconds</div>");
                setTimeout(first_ping, setup_backoff * 1000);
            });
    };

    $(document).ready(first_ping);
})(jQuery);
