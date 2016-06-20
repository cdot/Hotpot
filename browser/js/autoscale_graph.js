/*@preserve Copyright (C) 2015 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Simple auto-scaling graph for a single value trace using an HTML5 canvas
 * Options:
 *     current: required function returning current value
 *     background_col: colour of background
 *     text_col: colour of text
 *     current_col: colour of value plot
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

(function($) {
    "use strict";
    $.fn.autoscale_graph = function(options) {
        var $canvas = $(this);
        var font_height = 10;
        var window = 5; // degrees either side of measured temp

        options = $.extend({
            background_col: "black",
            current_col: "yellow",
            text_col: "white",
            min_y: Number.MAX_VALUE,
            max_y: Number.MIN_VALUE
        }, options);

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

            var current = options.current();

            if (current < options.min_y)
                options.min_y = Math.round(current - window / 2);
            if (current > options.max_y)
                options.max_y = Math.round(current + window / 2);

            var ctx = $canvas[0].getContext("2d");

            // Always fill the background and paint the window. We may blat
            // some or all of this with the history image. We actually only
            // need to paint the rightmost pixel, but this is cheap.

            // Background
            ctx.fillStyle = options.background_col;
            ctx.fillRect(0, 0, $canvas.width(), $canvas.height());

            var history = $canvas.data("history");
            if (typeof history === "undefined") {
                history = new History();
                $canvas.data("history", history);
            }
            history.push(current);

            // Current
            ctx.strokeStyle = options.current_col;
            ctx.beginPath();
            
            var trace = history.get($canvas.width());
            ctx.moveTo(0, y(trace[0]));
            for (var i = 1; i < trace.length; i++)
                ctx.lineTo(i, y(trace[i]));
            ctx.stroke();

            ctx.fillStyle = options.text_col;
            ctx.strokeStyle = options.text_col;
            ctx.font = font_height + "px sans-serif";

            var t = "" + options.max_y;
            ctx.textBaseline = "top";
            ctx.fillText(
                t,
                $canvas.width() - ctx.measureText(t).width,
                0);

            t = "" + options.min_y;
            ctx.textBaseline = "bottom";
            ctx.fillText(
                t,
                $canvas.width() - ctx.measureText(t).width,
                $canvas.height());
        };
        $canvas.on("data_change", data_change);
    };
})(jQuery);
