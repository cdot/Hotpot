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
                $.post(server,
                       JSON.stringify(data))
                    .success(function() {
                        $self.text(s);
                    });
            }
        });
    };

    var toggle_field = function() {
        var $self = $(this);
        var $controller = $self.closest(".controller");
        var data = {
            command: "set_" + $self.data("field"),
            id: $controller.data("name"),
            value: !$self.prop("checked")
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

    var log_temperature = function($self, temp) {
        var $controller = $self.closest(".controller");
        var last_temp = $controller.data("last_temp");
        var $canvas = $controller.find(".temperature_canvas");
        var target = parseFloat($controller.find("[data-field='target']").text());
        var window = parseFloat($controller.find("[data-field='window']").text());
        if ($canvas.height() === 0)
            return;
        var h = $canvas.height();
        var w = $canvas.width();
        var scale = 3 * window;
        var offset = target - 3 * window / 2;
        var y = function(v) {
            return h - (v - offset) * h / scale;
        };

        var ctx = $canvas[0].getContext('2d');

        var img = null;
        if (typeof(last_temp) !== "undefined") {
            img = ctx.getImageData(
                2, 1, w - 3, h - 2);
        }

        // Background
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, w, h);

        // Window
        ctx.fillStyle = "white";
        ctx.fillRect(0, y(target + window / 2), w, window * h / scale);

        // Target
        ctx.strokeStyle = "red";
        ctx.beginPath();
        ctx.moveTo(0, y(target));
        ctx.lineTo(w, y(target));
        ctx.stroke();

        // Current temp
        ctx.strokeStyle = "green";
        ctx.beginPath();
        ctx.moveTo(w - 2, y(last_temp));
        ctx.lineTo(w - 1, y(temp));
        ctx.stroke();

        // Old data
        if (img !== null)
            ctx.putImageData(img, 1, 1);

        $controller.data("last_temp", temp);
    };

    // Populate from pin or thermostat record
    var populate = function(data, $div) {
        var populate_field = function() {
            var $self = $(this);
            if (typeof data[k] !== "object") {
                if ($self.is(":checkbox")) {
                    $self.prop("checked", parseInt(data[k]) === 1);
                } else {
                    if ($self.data("field") === "temperature")
                        log_temperature($self, parseInt(data[k]));
                    $self.text(data[k]);
                }
                return;
            }
            // Rule array
            for (var i in data[k]) {
                var rule = data[k][i];
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
                    $div.find("input:checkbox")
                        .on("click", toggle_field);
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
