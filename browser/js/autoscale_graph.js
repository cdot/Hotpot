/*@preserve Copyright (C) 2015 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Simple auto-scaling graph for a single value trace using an HTML5 canvas
 * Options:
 *     traces: array of objects
 *        label: label for this trace
 *        current: required function returning current value
 *        colour: RGB colour of value plot
 *     background_col: colour of background
 *     text_col: colour of text
 *     max_y: optional top of y axis
 *     min_y: optional bottom of y axis
 * @class
 * @private
 */
function History() {
    "use strict";
    this.vals = [];
    this.runs = [];
}

History.prototype.push = function(val) {
    "use strict";
    if (val === this.vals[0])
        this.runs[0]++;
    else {
        this.vals.unshift(val);
        this.runs.unshift(1);
    }
};

History.prototype.get = function(num) {
    "use strict";
    var trace = [];
    var i = 0;
    while (i < this.vals.length && num > 0) {
        for (var j = 0; num > 0 && j < this.runs[i]; j++, num--) 
            trace.unshift(this.vals[i]);
        i++;
    }
    return trace;
};

const trace_cols = [ "yellow", "green", "orange", "red" ];

(function($) {
    "use strict";
    $.fn.autoscale_graph = function(trace, options) {
        var $canvas = $(this);
        var font_height = 10;
        var window = 5; // degrees either side of measured temp

        if (typeof options !== "undefined" ||
            typeof $canvas.data("options") === "undefined") {
            options = $.extend({
                background_col: "black",
                text_col: "white",
                min_y: Number.MAX_VALUE,
                max_y: Number.MIN_VALUE,
                traces: []
            }, options);
            $canvas.data("options", options);
        } else
            options = $canvas.data("options");

        if (typeof trace.colour === "undefined")
            trace.colour = trace_cols[options.traces.length];

        options.traces.push(trace);

        function y(v) {
            return $canvas.height() -
                (font_height
                 + ((v - options.min_y)
                    * ($canvas.height() - 2 * font_height)
                    / (options.max_y - options.min_y)));
        }

        // Generate graph
        var data_change = function() {
            if ($canvas.height() === 0)
                return;

            // Rendering doesn't work unless you force the attrs
            if (!$canvas.data("attrs_set")) {
                $canvas.attr("width", $canvas.width());
                $canvas.attr("height", $canvas.height());
                $canvas.data("attrs_set", true);
            }

            var ctx = $canvas[0].getContext("2d");

            // Always fill the background and paint the window. We may blat
            // some or all of this with the history image. We actually only
            // need to paint the rightmost pixel, but this is cheap.

            // Background
            ctx.fillStyle = options.background_col;
            ctx.fillRect(0, 0, $canvas.width(), $canvas.height());

            var history, line, current;
            for (var i in options.traces) {
                line = options.traces[i];
                current = line.current();

                if (current < options.min_y)
                    options.min_y = Math.round(current - window / 2);
                if (current > options.max_y)
                    options.max_y = Math.round(current + window / 2);

                history = line.history;
                if (typeof history === "undefined") {
                    history = new History();
                    line.history = history;
                }
                history.push(current);
            }
            
            for (i in options.traces) {
                line = options.traces[i];
                history = line.history;

                ctx.strokeStyle =
                    (typeof line.colour !== "undefined") ?
                    line.colour : "yellow";

                // Current
                ctx.beginPath();
            
                var tr = history.get($canvas.width());
                ctx.moveTo(0, y(tr[0]));
                for (var j = 1; j < tr.length; j++)
                    ctx.lineTo(j, y(tr[j]));

                ctx.stroke();
            }

            // Legend
            ctx.fillStyle = options.text_col;
            ctx.strokeStyle = options.text_col;
            ctx.font = font_height + "px sans-serif";

            var t = "" + options.max_y;
            ctx.textBaseline = "top";
            ctx.fillText(t, 0, 0);

            t = "" + options.min_y;
            ctx.textBaseline = "bottom";
            ctx.fillText(t, 0, $canvas.height());

            var x = ctx.measureText(t).width + 20;
            for (i in options.traces) {
                line = options.traces[i];
                ctx.fillStyle = line.colour;
                ctx.strokeStyle = line.colour;
                ctx.fillText(line.label, x, $canvas.height());
                x += ctx.measureText(line.label).width + 20;
            }
        };

        $canvas.on("data_change", data_change);
    };
})(jQuery);
