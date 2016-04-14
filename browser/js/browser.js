(function($) {
    // Populate from pin or thermostat record
    var populate = function(data) {
        var $div = $("#" + data.name);
        for (var k in data) {
            $div.find("." + k).each(function() {
                if (typeof data[k] === "object") {
                    //index, name, test
                    for (var i in data[k]) {
                        var rule = data[k][i];
                        var $tbody = $(this).find("tbody");
                        var $row = $tbody.find(".rule" + rule.index);
                        if ($row.length === 0) {
                            var $row = $($("#rule_template").html());
                            $row.addClass("rule" + rule.index);
                            $tbody.append($row);
                        }
                        $row.find(".index").text(rule.index);
                        $row.find(".name").text(rule.name);
                        $row.find(".test").text(rule.test);
                    }
                } else {
                    $(this).val(data[k]);
                }
            });
        }
    };

    var ping = function() {
        $.getJSON("https://192.168.1.15:13196", function(data) {
            $("#time").text(data.time);
            for (var i in data.thermostats)
                populate(data.thermostats[i]);
            for (var i in data.pins)
                populate(data.pins[i]);
        });
        setTimeout(ping, 1000);
    };

    var on_keyup = function(e) {
        if (e.which === 13) {
            var id = $(this).attr("name").split("_");
            var data = {
                id: id[0],
                command: "set_" + id[1],
                number: $(this).val()
            };
            $.post("https://192.168.1.15:13196",
                   JSON.stringify(data),
                   function(data, status) {
                       debugger;
                   });
        }
    };

    $(document).ready(function() {
        $.getJSON("https://192.168.1.15:13196", function(data) {
            $("#time").text(data.time);
            for (var i in data.thermostats) {
                // Create a new data block from the template
                var th = data.thermostats[i];
                var html = $("#controller_template").html();
                $("#controllers").append("<div id='" + th.name
                                         + "'>" + html + "</div>");
                var $div = $("#" + th.name);
                $div.find(".name").first().each(function() {
                    $(this).text(th.name);
                })
                $div.find("input").each(function() {
                    $(this).on("keyup", on_keyup);
                });
                populate(th);
            }
            setTimeout(ping, 1000);
        });
    });
})(jQuery);
