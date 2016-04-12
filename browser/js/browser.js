(function($) {
    var populate = function(sensor, data) {
        data = data[sensor];
        for (var k in data) {
            $("#" + sensor + "_" + k).each(function() {
                $(this).text(data[k]);
            });
        }
    };

    var ping = function() {
        $.getJSON("http://192.168.1.15:13196/", function(data) {
            $("#time").text(data.time);
            populate("HW", data);
            populate("CH", data);
            setTimeout(ping, 1000);
        });
    };

    $(document).ready(function() {
        ping();
    });
})(jQuery);
