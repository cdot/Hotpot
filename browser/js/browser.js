(function($) {
    var populate = function(sensor, data) {
        data = data[sensor];
        for (var k in data) {
            $("input[name='" + sensor + "_" + k + "']").each(function() {
                $(this).val(data[k]);
            });
        }
    };

    var ping = function() {
        $.getJSON("https://192.168.1.15:13196", function(data) {
            $("#time").text(data.time);
            populate("HW", data);
            populate("CH", data);
        });
        setTimeout(ping, 1000);
    };

    $(document).ready(function() {
        $("input").each(function() {
            $(this).on("keyup", function(e) {
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
            });
        });
        ping();
    });
})(jQuery);
