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

const TOP = 1;
const BOTTOM = TOP << 1;
const LEFT = BOTTOM << 1;
const RIGHT = LEFT << 1;

function outCode(p, min, max) {
    "use strict";
    var code = 0;
    if (p.x < min.x)
	code |= LEFT;
    else if (p.x > max.x)
	code |= RIGHT;
    if (p.y < min.y)
	code |= BOTTOM;
    else if (p.y > max.y)
	code |= TOP;
    return code;
}

// Cohen-Sutherland clipping
function clipLine(a, b, min, max) {
    "use strict";

    var ac = outCode(a, min, max);
    var bc = outCode(b, min, max);
    var cc, x, y;

    while (ac + bc !== 0) {
        if ((ac & bc) !== 0)
            // Points both outside the same side
            return true; /// line is clipped

        cc = (ac !== 0) ? ac : bc;

        if ((cc & TOP) !== 0) {
            x = a.x + (b.x - a.x) * (max.y - a.y) / (b.y - a.y);
            y = max.y;
        } else if ((cc & BOTTOM) !== 0) {
            x = a.x + (b.x - a.x) * (min.y - a.y) / (b.y - a.y);
            y = min.y;
        } else if ((cc & RIGHT) !== 0) {
            y = a.y + (b.y - a.y) * (max.x - a.x) / (b.x - a.x);
            x = max.x;
        } else if ((cc & LEFT) !== 0) {
            y = a.y + (b.y - a.y) * (min.x - a.x) / (b.x - a.x);
            x = min.x;
        }

	if (cc === ac) {
            a.x = x;
            a.y = y;
            ac = outCode(a, min, max);
        } else {
            b.x = x;
            b.y = y;
            bc = outCode(b, min, max);
        }
    }
    return false;
}

var trace_cols = [ "yellow", "red", "orange", "magenta" ];

function Trace(name) {
    "use strict";
    this.name = name;
    this.points = [];
    this.colour = trace_cols.shift();
}

// TODO: add data
Trace.prototype.addPoint = function(p) {
    "use strict";
    this.points.push(p);
    this.extents = null; // clear cache
};

/**
 * Clip the data in the trace to the given range
 */
Trace.prototype.clip = function(min, max) {
    "use strict";
    // TODO: do this properly. At the moment it assumes clipping
    // on the left and leaves all else unclipped.
    var lp;
    while (this.points.length > 0 && outCode(this.points[0], min, max) !== 0)
        lp = this.points.shift();
    if (lp && this.points.length > 0)
        clipLine(lp, this.points[0], min, max);
};

/**
 * Get the limits of the points in the trace
 */
Trace.prototype.getExtents = function() {
    "use strict";
    if (this.extents)
        return this.extents;
    var e = this.extents = {
        min: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
        max: { x: Number.MIN_VALUE, y: Number.MIN_VALUE }
    };
    for (var i in this.points) {
        var p = this.points[i];
        if (p.x < e.min.x) e.min.x = p.x;
        if (p.x > e.max.x) e.max.x = p.x;
        if (p.y < e.min.y) e.min.y = p.y;
        if (p.y > e.max.y) e.max.y = p.y;
    }
    return e;
};

// TODO colour and trace
Trace.prototype.render = function(g) {
    "use strict";

    if (this.points.length === 0)
        return;
    g.ctx.strokeStyle = this.colour;

    // Current
    g.ctx.beginPath();
 
    var p = g.l2v(this.points[0]);
    g.ctx.moveTo(p.x, p.y);
    for (var j = 1; j < this.points.length; j++) {
if (j == this.points.length - 1) debugger;
        p = g.l2v(this.points[j]);
        g.ctx.lineTo(p.x, p.y);
    }

    g.ctx.stroke();
};

/**
* Render the label at (x, y) and return the width of the label
*/
Trace.prototype.renderLabel = function(g, x, y) {
    "use strict";
    g.ctx.fillStyle = this.colour;
    g.ctx.strokeStyle = this.colour;
    g.ctx.fillText(this.name, x, y);
    return g.ctx.measureText(this.name).width;
};

function Graph(options, $canvas) {
    "use strict";
    this.$canvas = $canvas;
    this.ctx = $canvas[0].getContext("2d");

    this.options = $.extend({
        min: {},
        max: {},
        background_col: "black",
        text_col: "white",
        font_height: 10, // px
        window: 5, // degrees either side of measured temp
        adjust: {}
    }, options);
    this.options.min = $.extend({
        x: Number.MAX_VALUE,
        y: Number.MAX_VALUE
    }, this.options.min);
    this.options.max = $.extend({
        x: Number.MIN_VALUE,
        y: Number.MIN_VALUE
    }, this.options.max);
    this.options.adjust = $.extend({
        max: {},
        min: {}     
    }, this.options.adjust);
    // TODO: can't have clip at both ends of an axis
    this.options.adjust.min = $.extend({
            x: "clip",
            y: "scale"
    }, this.options.adjust.min);
    this.options.adjust.max = $.extend({
            x: "scale",
            y: "scale"
    }, this.options.adjust.max);

    this.traces = [];
}

/**
 * Convert logical point on a trace to a physical point
 */
Graph.prototype.l2v = function(p) {
    "use strict";
    var full_width = this.$canvas.width();
    var full_height = this.$canvas.height();

    // Allow font_height above and below the drawing area for legend
    var font_height = this.options.font_height;
    return {
        x: Math.floor((p.x - this.options.min.x) * full_width
            / (this.options.max.x - this.options.min.x)),
        y: Math.floor(full_height -
            (font_height
             + ((p.y - this.options.min.y)
                * (full_height - 2 * font_height)
                / (this.options.max.y - this.options.min.y))))
    };
};

Graph.prototype.addPoint = function(tracename, x, y) {
    "use strict";
    if (typeof this.traces[tracename] === "undefined") {
        this.traces[tracename] = new Trace(tracename);
    }
    this.traces[tracename].addPoint(x, y);
};

Graph.prototype.update = function() {
    "use strict";
    var $canvas = this.$canvas;
    var options = this.options;
    var ctx = this.ctx;

    if ($canvas.height() === 0)
        return;

    // Rendering doesn't work unless you force the attrs
    if (!$canvas.data("attrs_set")) {
        $canvas.attr("width", $canvas.width());
        $canvas.attr("height", $canvas.height());
        $canvas.data("attrs_set", true);
    }

    // Always fill the background and paint the window. We may blat
    // some or all of this with the history image. We actually only
    // need to paint the rightmost pixel, but this is cheap.

    // Background
    ctx.fillStyle = options.background_col;
    ctx.fillRect(0, 0, $canvas.width(), $canvas.height());

    // Scale and clip the viewport
    var i, j, e, t, clip, a = options.adjust;
    var range = {
        x: options.max.x - options.min.x,
        y: options.max.y - options.min.y
    };
    for (i in this.traces) {
        t = this.traces[i];
        e = t.getExtents();
        clip = false;
        for (var ax in e.min) {
            // Scale first to shift the end of a clipped axis
            if (e.min[ax] < options.min[ax] && a.min[ax] === "scale")
                options.min[ax] = e.min[ax];
            if (e.max[ax] > options.max[ax] && a.max[ax] === "scale")
                options.max[ax] = e.max[ax];
            // Now apply clip, and flag a trace clip.
            if (e.min[ax] < options.min[ax] && a.min[ax] === "clip") {
                options.min[ax] = options.max[ax] - range[ax];
                clip = true;
            }
            if (e.max[ax] > options.max[ax] && a.max[ax] === "clip") {
                options.max[ax] = options.min[ax] + range[ax];
                clip = true;
            }
        }
        if (clip)
            t.clip(options.min, options.max);
    }
    
    // Paint the traces
    for (i in this.traces) {
        this.traces[i].render(this);
    }

    // Legends
    ctx.fillStyle = options.text_col;
    ctx.strokeStyle = options.text_col;
    ctx.font = options.font_height + "px sans-serif";

    var labels = { min: {}, max: {} };

    for (i in { max: 0, min: 1 }) {
        for (j in { x: 0, y: 1 }) {
            if (options.render_label)
                labels[i][j] = options.render_label(i + j, options[i][j]);
            else
                labels[i][j] = "" + options[i][j].toPrecision(4);
        }
    }

    ctx.textBaseline = "top";
    ctx.fillText(labels.max.y, 0, 0);
    ctx.fillText(labels.min.x, ctx.measureText(labels.max.y).width + 20, 0);
    ctx.fillText(labels.max.x,
                 $canvas.width() - ctx.measureText(labels.max.x).width - 10, 0);

    ctx.textBaseline = "bottom";
    ctx.fillText(labels.min.y, 0, $canvas.height());

    var x = ctx.measureText(t).width + 20;
    for (i in this.traces) {
        x += this.traces[i].renderLabel(this, x, $canvas.height()) + 15;
    }
};

(function($) {
    "use strict";

    $.fn.autoscale_graph = function(options) {
        var $canvas = $(this);

        $(this).data("graph", new Graph(options, $canvas));
    
        $canvas.on("addpoint", function(e, data) {
            $canvas.data("graph").addPoint(data.trace, data.point);
            $canvas.trigger("update");
        });

        $canvas.on("update", function() {
            $canvas.data("graph").update();
        });
    };
})(jQuery);
