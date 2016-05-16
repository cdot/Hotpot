/*@preserve Copyright (C) 2015 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Simple auto-scaling graph for a single value trace using an HTML5 canvas
 * Options:
 *     current: required function returning current value
 *     target: optional function returning target value (or undefined)
 *     window: optional function returning window size
 *     background_col: colour of background
 *     window_col: colour of window (if target and window are defined)
 *     target_col: colour of target (if target is defined)
 *     text_col: colour of text
 *     current_col: colour of value plot
 *     max_y: optional top of y axis
 *     min_y: optional bottom of y axis
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
        var min_window = 5;

        options = $.extend({
            background_col: "black",
            window_col: "gray",
            target_col: "red",
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

            var window = typeof options.window !== "undefined"
                ? options.window() : min_window;
            var target = typeof options.target !== "undefined"
                ? options.target() : current;

            // Make sure both target and current val are visible
            if (current < options.min_y)
                options.min_y = Math.round(
                    current - (window === 0 ? min_window : window) - 0.5);
            if (target < options.min_y)
                options.min_y = Math.round(
                    target - (window === 0 ? min_window : window) - 0.5);
            if (current > options.max_y)
                options.max_y = Math.round(
                    current + (window === 0 ? min_window : window) + 0.5);
            if (target > options.max_y)
                options.max_y = Math.round(
                    target + (window === 0 ? min_window : window) + 0.5);

            var ctx = $canvas[0].getContext("2d");

            // Always fill the background and paint the window. We may blat
            // some or all of this with the history image. We actually only
            // need to paint the rightmost pixel, but this is cheap.

            // Background
            ctx.fillStyle = options.background_col;
            ctx.fillRect(0, 0, $canvas.width(), $canvas.height());

            if (options.target !== "undefined") {
                if (options.window !== "undefined") {
                    var high = target + window / 2;
                    var low = target - window / 2;
                    if (high > options.max_y)
                        high = options.max_y;
                    if (low < options.min_y)
                        low = options.min_y;
                    ctx.fillStyle = options.window_col;
                    ctx.fillRect(0, y(high),
                                 $canvas.width(), y(low) - y(high));
                }
                ctx.strokeStyle = options.target_col;

                // Target
                ctx.beginPath();
                ctx.moveTo(0, y(target));
                ctx.lineTo($canvas.width(), y(target));
                ctx.stroke();
            }

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
