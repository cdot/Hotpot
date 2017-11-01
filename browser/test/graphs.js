// Test code for Graphs package
(function($) {
    $(document).ready(function() {
        var $canvas = $("#graph_canvas");

        $canvas.autoscale_graph({
            render_tip_t: function(trd) {
                return trd;
            },
            render_tip_s: function(trd) {
                return (Math.round(trd * 10) / 10).toString();
            },
            lock_t: true
        });
        
        var g = $canvas.data("graph"); // get graph object
        var graph_width = 20 * 1000; // 1h in milliseconds

        var stop_after = Date.now() + 1.3 * graph_width;
        
        var binary = new BinaryTrace({
            legend: "binary",
            colour: "yellow",
            min: { t: Date.now() },
            max: { t: Date.now() + graph_width }
        });
        g.addTrace(binary);
        
        var continuous = new Trace({
            legend: "continuous",
            colour: "orange",
            min: { t: Date.now(), s: -1 }, // min is at the top!
            max: { t: Date.now() + graph_width, s: 1 }
        });
        g.addTrace(continuous);
        
        var onoff = 1;
        var rad = 0;
        function cont_pulse() {
            continuous.addPoint(Date.now(), onoff * Math.sin(rad));
            rad += 1 / (2 * Math.PI);
            if (Date.now() < stop_after)
                setTimeout(cont_pulse, 200);
            g.render();
        };

        binary.addPoint(Date.now(), onoff);
        function bin_pulse() {
            binary.addPoint(Date.now(), onoff);
            onoff = onoff == 1 ? 0 : 1;
            if (Date.now() < stop_after)
                setTimeout(bin_pulse, 5000);
            g.render();
        }

        bin_pulse();
        cont_pulse();
        
        $canvas = $("#timeline_canvas");
        var DAY_IN_MS = 24 * 60 * 60 * 1000;
        var timeline = new Timeline({
            period: DAY_IN_MS, min: 5, max: 25
        });
        $canvas.TimelineEditor(timeline);

    });
})(jQuery);

