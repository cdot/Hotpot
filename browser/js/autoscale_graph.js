/*@preserve Copyright (C) 2015 Crawford Currie http://c-dot.co.uk license MIT*/

// Clipping outcodes
const OUT_MAX_S = 1;
const OUT_MIN_S = OUT_MAX_S << 1;
const OUT_MIN_T = OUT_MIN_S << 1;
const OUT_MAX_T = OUT_MIN_T << 1;

/**
 * Construct a new trace line
 * Trace axes are "t" (for time) and "s" (for sample)
 * @param {object} options
 * ```
 * {
 *  legend: legend for the trace
 *  min: Point, optional bottom/left of axis in S-T coords
 *  max: as `min`
 *  colour: colour of trace
 *  adjust: {
 *   t: "slide" or "flex",
 *   s: "flex"
 *  }
 * }
 * ```
 * Out-of-range
 * "slide" will maintain a constant range. Assumes new data always added
 * "flex" will expand the range at either end
 * @class
 */
function Trace(options) {
    "use strict";
    this.points = [];
    options = $.extend({
        colour: "white",
        adjust: {},
        min: {},
        max: {}
    }, options);
    if (typeof options.min.t === "undefined")
        options.min.t = Number.MAX_VALUE;
    if (typeof options.max.t === "undefined")
        options.max.t = Number.MIN_VALUE;
    if (typeof options.min.s === "undefined")
        options.min.s = Number.MAX_VALUE;
    if (typeof options.max.s === "undefined")
        options.max.s = Number.MIN_VALUE;
    // min end can either lock or slide.
    options.adjust = $.extend({
        t: "slide", s: "flex"
    }, options.adjust);
    this.options = options;
}

/**
 * Calculate the outcode for the given point in the given bounds in S-T space
 */
Trace.prototype.outCode = function(p) {
    "use strict";
    var code = 0;
    if (p.t < this.options.min.t)
	code |= OUT_MIN_T;
    else if (p.t > this.options.max.t)
	code |= OUT_MAX_T;
    if (p.s < this.options.min.s)
	code |= OUT_MIN_S;
    else if (p.s > this.options.max.s)
	code |= OUT_MAX_S;
    return code;
};

// Cohen-Sutherland clipping, done in S-T space
Trace.prototype.clipLine = function(a, b) {
    "use strict";

    var ac = this.outCode(a);
    var bc = this.outCode(b);
    var cc, x, y;

    while (ac + bc !== 0) {
        if ((ac & bc) !== 0)
            // Points both outside the same side
            return true; /// line is clipped

        cc = (ac !== 0) ? ac : bc;

        if ((cc & OUT_MAX_S) !== 0) {
            x = a.t + (b.t - a.t) * (this.options.max.s - a.s) / (b.s - a.s);
            y = this.options.max.s;
        } else if ((cc & OUT_MIN_S) !== 0) {
            x = a.t + (b.t - a.t) * (this.options.min.s - a.s) / (b.s - a.s);
            y = this.options.min.s;
        } else if ((cc & OUT_MAX_T) !== 0) {
            y = a.s + (b.s - a.s) * (this.options.max.t - a.t) / (b.t - a.t);
            x = this.options.max.t;
        } else if ((cc & OUT_MIN_T) !== 0) {
            y = a.s + (b.s - a.s) * (this.options.min.t - a.t) / (b.t - a.t);
            x = this.options.min.t;
        }

	if (cc === ac) {
            a.t = x;
            a.s = y;
            ac = this.outCode(a);
        } else {
            b.t = x;
            b.s = y;
            bc = this.outCode(b);
        }
    }
    return false;
};

/**
 * Add a point to the trace
 * @param {point} OR p = object `{ t:, s: }`
 */
Trace.prototype.addPoint = function(t, s) {
    "use strict";
    if (typeof s === "undefined")
        throw new Utils.exception("Trace", "Cannot add null point");
    this.points.push({ t: t, s: s });
    this.extents = null; // clear cache
};

/**
 * Clip the data in the trace to the visible area in S-T space
 */
Trace.prototype.clip = function() {
    "use strict";
    // TODO: do this properly. At the moment it assumes clipping
    // on the left and leaves all else unclipped.
    var lp;
    while (this.points.length > 0 && (this.outCode(this.points[0]) & OUT_MIN_T) !== 0)
        lp = this.points.shift();
    if (lp)
        this.points.unshift(lp);

    // First point encountered above t = 0
//    if (lp && this.points.length > 0)
//        this.clipLine(lp, this.points[0]);
};

/**
 * Get the limits of the points in the trace in S-T space
 * @return {object} {min:{t:,s:}, max:{t:,s:}}
 */
Trace.prototype.getExtents = function() {
    "use strict";
    if (this.extents)
        return this.extents;
    var e = this.extents = {
        min: { t: Number.MAX_VALUE, s: Number.MAX_VALUE },
        max: { t: Number.MIN_VALUE, s: Number.MIN_VALUE }
    };
    for (var i in this.points) {
        var p = this.points[i];
        if (p.t < e.min.t) e.min.t = p.t;
        if (p.t > e.max.t) e.max.t = p.t;
        if (p.s < e.min.s) e.min.s = p.s;
        if (p.s > e.max.s) e.max.s = p.s;
    }
    return e;
};

/**
 * Set the drawing area for this trace within the graph canvas
 */
Trace.prototype.setViewport = function(vpt) {
    this.viewport = vpt;
};

/**
 * Convert logical point on a trace to a physical point
 * @param {object} stp {t:,s:} logical point (float)
 * @return {object} {x:,y:} physical point (int)
 * @protected
 */
Trace.prototype.st2xy = function(stp) {
    "use strict";

    // Normalise to range 0..1
    var norm_s =  (stp.s - this.options.min.s)
        / (this.options.max.s - this.options.min.s);
    var norm_t = (stp.t - this.options.min.t)
        / (this.options.max.t - this.options.min.t);

    // Map to viewport
    return {
        x: this.viewport.x + this.viewport.dx * norm_t,
        y: this.viewport.y + this.viewport.dy * norm_s
    };
};

/**
 * Convert a canvas point to a logical point
 * @param {object} p {x:,y:} physical point (int)
 * @return {object} {t:,s:} logical point (float) or undefined if the point
 *  is outside the trace viewport
 * @protected
 */
Trace.prototype.xy2st = function(p) {
    "use strict";
    if (p.x < this.viewport.x || p.y < this.viewport.y
        || p.x > this.viewport.x + this.viewport.dx
        || p.y > this.viewport.y + this.viewport.dy)
        return undefined;

    var norm_y = (this.viewport.y + this.viewport.dy - p.y)
        / this.viewport.dy;
    var norm_x = (this.viewport.x + this.viewport.dx - p.x)
        / this.viewport.dx;
    var dt = this.options.max.t - this.options.min.t;
    var ds = this.options.max.s - this.options.min.s;

    return {
        t: this.options.min.t + dt * norm_x,
        s: this.options.min.s + ds * norm_y
    };
};

/**
 * Render the trace in the given graph
 * @param ctx the drawing context we are rendering within
 * @param lock_t the right end of the trace traces are to be extended, undef otherwise
 */
Trace.prototype.render = function(ctx, lock_t) {
    "use strict";

    if (this.points.length < 2)
        return;

    // Scale and clip the data
    var options = this.options;

    var adj = options.adjust;
    var e = this.getExtents();
    var clip = false;
    for (var ord in e.min) {
        var range = options.max[ord] - options.min[ord];
        if (adj[ord] === "flex") {
            if (e.min[ord] < options.min[ord])
                // Move the start of the range to match the start of the data
                options.min[ord] = e.min[ord];
            if (e.max[ord] > options.max[ord])
                // Move the end of the range to match the end of the data
                options.max[ord] = e.max[ord];
        } else if (adj[ord] === "slide" && e.max[ord] > options.max[ord]) {
            range = options.max[ord] - options.min[ord];
            options.max[ord] = e.max[ord];
            options.min[ord] = e.max[ord] - range;
            clip = true;
        }
    }

    if (clip)
        // SMELL: is this really necessary? It does keep the trace sizes
        // manageable, I suppose.
        // SMELL: doesn't interpolate zero crossing correctly
        this.clip();

    if (this.points.length < 2)
        return;

    ctx.strokeStyle = this.options.colour;

    if (this.points.length < 2)
        return;

    // Current
    ctx.beginPath();

    var p = this.st2xy(this.points[0]);
    var len = this.points.length;
    this.firstPoint(p, ctx);
    for (var j = 1; j < len; j++) {
        p = this.st2xy(this.points[j]);
        this.nextPoint(p, ctx);
    }
    if (typeof lock_t !== "undefined" && this.points[len - 1].t < lock_t) {
        p = this.st2xy({ s: this.points[len - 1].s, t: lock_t });
        this.nextPoint(p, ctx);
    }

    ctx.stroke();
};

Trace.prototype.firstPoint = function(p, ctx) {
    ctx.moveTo(p.x, p.y);
};

Trace.prototype.nextPoint = function(p, ctx) {
    ctx.lineTo(p.x, p.y);
};

/**
 * Render the legend at (x, y) and return the width of the label
 * @param {number} x coordinate
 * @param {number} y coordinate
 */
Trace.prototype.renderLegend = function(x, y, ctx) {
    "use strict";
    ctx.fillStyle = this.options.colour;
    ctx.strokeStyle = this.options.colour;
    ctx.fillText(this.options.legend, x, y);
    return ctx.measureText(this.options.legend).width;
};

Trace.prototype.firstPoint = function(p, ctx) {
    ctx.moveTo(p.x, p.y);
};

Trace.prototype.nextPoint = function(p, ctx) {
    ctx.lineTo(p.x, p.y);
};

/**
 * Render the legend at (x, y) and return the width of the label
 * @param {number} x coordinate
 * @param {number} y coordinate
 */
Trace.prototype.renderLegend = function(x, y, ctx) {
    "use strict";
    ctx.fillStyle = this.options.colour;
    ctx.strokeStyle = this.options.colour;
    ctx.fillText(this.options.legend, x, y);
    return ctx.measureText(this.options.legend).width;
};

/**
 * Subclass of Trace for a binary signal (0, 1 values at either extreme
 * of the range)
 * @class
 */
function BinaryTrace(options) {
    options.min.s = 0;
    options.max.s = 1;
    Trace.call(this, options);
}
BinaryTrace.prototype = Object.create(Trace.prototype);

/**
 * Add a point to the trace
 * @param {point} OR p = object `{ t:, s: }`
 */
BinaryTrace.prototype.addPoint = function(t, s) {
    "use strict";
    if (this.points.length > 0) {
        var lp = this.points[this.points.length - 1];

        this.points.push({ t: t, s: lp.s });
    }
    this.points.push({ t: t, s: s });
    this.extents = null; // clear cache
};

/**
 * Simple canvas for a set of auto-scaling traces using an HTML5 canvas.
 * Trace scales are all locked to the same range.
 * @param {jquery} $canvas jQuery object around canvas element
 * @param {object} options options for the graph
 * * background_col: colour of background
 * * text_col: colour of text
 * * font_height: height of label font
 * * render_tip_s: function(val) function to render t val in a tip canvas
 * * render_tip_t: function(val)
 * * lock_t: lock the max t of all traces together. If true, this will cause the traces to
 *   sync to the same t on the right end, and will extend traces that don't have new values
 *   up to the right edge too.
 * * stack_traces: "vertical" or "horizontal" to stack traces on top of eachother (default) or side-by-side
 * @class
 */
function Graph(options, $canvas) {
    "use strict";
    var self = this;

    self.$canvas = $canvas;
    self.ctx = $canvas[0].getContext("2d");

    self.$tip_canvas = $("<canvas></canvas>");
    $canvas.after(self.$tip_canvas);
    self.$tip_canvas.css("display", "none");
    self.$tip_canvas.css("position", "absolute");
    self.$tip_canvas.css("background-color", "transparent");
    self.$tip_canvas.css("color", "white");

    self.options = $.extend({
        background_col: "black",
        text_col: "white",
        font_height: 10 // px
    }, options);

    $canvas.on("mousemove", function(e) {
        var targ;
        if (!e)
            e = window.event;
        if (e.target)
            targ = e.target;
        else if (e.srcElement)
            targ = e.srcElement;
        if (targ.nodeType === 3) // defeat Safari bug
            targ = targ.parentNode;
        self.handleMouse(e, targ);
    })
    .hover(
        function() {
            self.$tip_canvas.show();
        },
        function() {
            self.$tip_canvas.hide();
        });

    self.traces = [];
}

/**
 * Add a trace to the graph
 * @param {string} tracename unique trace name
 * @param {Trace} trace the Trace object
 */
Graph.prototype.addTrace = function(trace) {
    this.traces.push(trace);
};

/**
 * Update (draw) the graph.
 */
Graph.prototype.render = function() {
    "use strict";
    var $canvas = this.$canvas;
    var options = this.options;
    var ctx = this.ctx;
    var i;

    if ($canvas.height() === 0 || this.traces.length === 0)
        return;

    // Rendering doesn't work unless you force the attrs
    if (!$canvas.data("attrs_set")) {
        $canvas.attr("width", $canvas.width());
        $canvas.attr("height", $canvas.height());
        $canvas.data("attrs_set", true);
    }

    // Background
    ctx.fillStyle = options.background_col;
    ctx.fillRect(0, 0, $canvas.width(), $canvas.height());

    // Tell the traces their containing boxes
    // Allow font_height below the drawing area for legend
    var trh, w;
    var vstack = this.options.stack_traces !== "horizontal";
    if (vstack) {
        trh = ($canvas.height() - this.options.font_height) / this.traces.length;
        w = $canvas.width();
    } else {
        trh = $canvas.width() / this.traces.length;
        w = $canvas.height() - this.options.font_height;
    }

    var troff = 0;
    for (i in this.traces) {
        var tit = this.traces[i];
        if (vstack)
            tit.setViewport({
                x: 0, y: troff, dx: w, dy: trh
            });
        else
            tit.setViewport({
                x: troff, y: 0, dx: trh, dy: w
            });
        troff += trh;
    }

    var locked_t;
    if (options.lock_t) {
        locked_t = 0;
        for (i in this.traces) {
            var e = this.traces[i].getExtents();
            if (e.max.t > locked_t)
                locked_t = e.max.t;
        }
        for (i in this.traces) {
            var e = this.traces[i].getExtents();
            var width = e.max.t - e.min.t;
            e.max.t = locked_t;
            e.min.t = locked_t - width;
        }
    }

    // Paint the traces
    for (i in this.traces) {
        this.traces[i].render(ctx,locked_t);
    }

    // Legends
    ctx.font = options.font_height + "px sans-serif";
    ctx.textBaseline = "bottom";

    var x = 20;
    for (i in this.traces) {
        x += this.traces[i].renderLegend(x, $canvas.height(), this.ctx) + 15;
    }
};

/**
 * Mouse hovering over graph
 */
Graph.prototype.handleMouse = function(e) {
    var $canvas = this.$canvas;
    var targ_left = $canvas.offset().left;
    var targ_top = $canvas.offset().top;

    // jQuery normalizes the pageX and pageY
    // pageX,Y are the mouse positions relative to the document
    var p = { x: e.pageX - targ_left, y: e.pageY - targ_top };
    var options = this.options;
    var th = options.font_height;

    // Not over legend
    if (p.y > $canvas.height() - th) {
        this.$tip_canvas.hide();
        return;
    }

    var l, tn;
    for (tn in this.traces) {
        l = this.traces[tn].xy2st(p);
        if (l)
            break;
    }
    if (!l)
        return;
    var text = " " + this.traces[tn].options.legend + ": " +
        (typeof options.render_tip_t === "function" ?  options.render_tip_t(l.t) : l.t) +
        "\n" +
        (typeof options.render_tip_s === "function" ? options.render_tip_s(l.s) : l.s);

    var tipCtx = this.$tip_canvas[0].getContext("2d");
    var tw = tipCtx.measureText(text).width;

    // CSS just stretches the content
    tipCtx.canvas.width = tw;
    tipCtx.canvas.height = th;

    tipCtx.fillStyle = this.options.background_col;
    tipCtx.fillRect(0, 0, tw, th);

    tipCtx.fillStyle = "white";
    tipCtx.strokeStyle = "white";
    tipCtx.font = th + "px sans-serif";

    // Move the tip to the left if too near right edge
    if (p.x + tw > $canvas.width())
        p.x -= tw + 2; // plus a bit to clear the cursor

    this.$tip_canvas.css({
        left: (p.x + targ_left) + "px",
        top: (p.y + targ_top) + "px",
        width: tw,
        height: th
    });
    tipCtx.textBaseline = "top";
    tipCtx.fillText(text, 0, 0);
    this.$tip_canvas.show();
};

(function($) {
    "use strict";

    $.fn.autoscale_graph = function(options) {
        var $canvas = $(this);

        $canvas.data("graph", new Graph(options, $canvas));
    };
})(jQuery);
