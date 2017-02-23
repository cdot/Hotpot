/*@preserve Copyright (C) 2015 Crawford Currie http://c-dot.co.uk license MIT*/

// Clipping outcodes
const OUT_S_MAX = 1;
const OUT_MIN_S = OUT_S_MAX << 1;
const OUT_MIN_T = OUT_MIN_S << 1;
const OUT_MAX_T = OUT_MIN_T << 1;
const horz = false;

/**
 * Construct a new trace line
 * Trace axes are "t" (for time) and "s" (for sample)
 * @param {string} name name of the trace
 * @param {Config} options 
 * * `type`: trace type, may be "binary" or "continuous" (default)
 * * `min`: Point, optional bottom/left of axis in S-T coords
 * * `max`: as `min`
 * * `colour`: colour of trace
 * * `adjust`: {}
 *   * `max`: {}
 *     * `s`: `clip` or `scale` - how to handle an out-or-range value at
 *            this end of this axis
 *     * `t`: as `x`
 *   * `min`: as `max`
 * @class
 */
function Trace(graph, name, options) {
    "use strict";
    this.name = name;
    this.graph = graph;
    this.points = [];
    options = $.extend({
        type: "continuous",
        colour: "white",
        adjust: {},
        min: {},
        max: {}
    }, options);
    if (typeof options.min.t === "undefined")
        options.min.t = Number.MAX_VALUE;
    if (typeof options.max.t === "undefined")
        options.max.t = Number.MIN_VALUE;
    if (options.type === "binary") {
        this.slot = graph.next_slot++;
        options.min.s = 0;
        options.max.s = 1;
    } else {
        if (typeof options.min.s === "undefined")
            options.min.s = Number.MAX_VALUE;
        if (typeof options.max.s === "undefined")
            options.max.s = Number.MIN_VALUE;
    }
    options.adjust = $.extend({
        max: {}, min: {}     
    }, options.adjust);
    // TODO: can't have clip at both ends of an axis
    options.adjust.min = $.extend({
        t: "clip", s: "scale"
    }, options.adjust.min);
    options.adjust.max = $.extend({
        t: "scale", s: "scale"
    }, options.adjust.max);
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
	code |= OUT_S_MAX;
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

        if ((cc & OUT_S_MAX) !== 0) {
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
    var p;
    if (typeof s !== "undefined")
        p = { t: t, s: s };
    else
        p = t;
    this.points.push(p);
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
    while (this.points.length > 0 && this.outCode(this.points[0]) !== 0)
        lp = this.points.shift();
    if (lp && this.points.length > 0)
        this.clipLine(lp, this.points[0]);
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
 * Convert logical point on a trace to a physical point (does not work for
 * digital traces)
 * @param {object} stp {t:,s:} logical point (float)
 * @return {object} {x:,y:} physical point (int)
 * @private
 */
Trace.prototype.st2xy = function(stp) {
    "use strict";
    
    // Normalise to range 0..1
    var norm_s =  (stp.s - this.options.min.s)
        / (this.options.max.s - this.options.min.s);
    var norm_t = (stp.t - this.options.min.t)
        / (this.options.max.t - this.options.min.t);
    
    // Map to viewport
    if (horz)
        return {
            x: this.viewport.x + this.viewport.dx * norm_t,
            y: this.viewport.y + this.viewport.dy * norm_s
        };
    else
        return {
            x: this.viewport.x + this.viewport.dx * norm_s,
            y: this.viewport.y + this.viewport.dy
                - this.viewport.dy * norm_t
        };
};

/**
 * Convert a logical 0|1 point to a physical point.
 * If a single point is passed, then calculates the position of the
 * current value of the trace. If two points are passed, it takes the
 * t value of the second point, but the s value of the first. This is
 * so digital traces can be plotted.
 * @param {object} lstp {t:,s:} last logical point (if stp is given) or
* current logical point if stp is undefined
 * @param {object} stp {t:,s:} optional current logical point
 */
Trace.prototype.dst2xy =  function(lstp, stp) {
    var norm_t = ((stp ? stp.t : lstp.t) - this.options.min.t)
        / (this.options.max.t - this.options.min.t);

    var h, p = {};
    if (horz) {
        h = this.viewport.dy / 5;
        p.x = this.viewport.x + this.viewport.dx * norm_t;
        p.y = this.viewport.y + this.viewport.dy - (h + lstp.s * 3 * h);
    } else {
        h = this.viewport.dx / 5;
        p.x = this.viewport.x + this.viewport.dx - (h + lstp.s * 3 * h);
        p.y = this.viewport.y + this.viewport.dy - this.viewport.dy * norm_t
    }

    return p;
}

/**
 * Convert a canvas point to a logical point
 * @param {object} p {x:,y:} physical point (int)
 * @return {object} {t:,s:} logical point (float) or undefined if the point
 *  is outside the trace viewport
 * @private
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
    
    if (horz)
        return {
            t: this.options.min.t + dt * norm_x,
            s: this.options.min.s + ds * norm_y
        };
    else
        return {
            t: this.options.min.t + dt * norm_y,
            s: this.options.min.s + ds * norm_x
        };
};

/**
 * Render the trace in the given graph
 * @param {Graph} g the graph we are rendering within
 */
Trace.prototype.render = function() {
    "use strict";

    if (this.points.length < 2)
        return;

    var g = this.graph;
    var ctx = g.ctx;

    // Scale and clip the data
    var options = this.options;
    var range = {
        t: options.max.t - options.min.t,
        s: options.max.s - options.min.s
    };

    var adj = options.adjust;
    var e = this.getExtents();
    var clip = false;
    for (var ord in e.min) {
        // Scale first to shift the end of a clipped axis
        if (e.min[ord] < options.min[ord] && adj.min[ord] === "scale")
            options.min[ord] = e.min[ord];
        if (e.max[ord] > options.max[ord] && adj.max[ord] === "scale")
            options.max[ord] = e.max[ord];
        // Now apply clip, and flag a trace clip.
        if (e.min[ord] < options.min[ord] && adj.min[ord] === "clip") {
            options.min[ord] = options.max[ord] - range[ord];
            clip = true;
        }
        if (e.max[ord] > options.max[ord] && adj.max[ord] === "clip") {
            options.max[ord] = options.min[ord] + range[ord];
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

    // Current
    ctx.beginPath();
    var lp, p, j;
    if (this.options.type === "binary") {
        lp = this.points[0];
        p = this.dst2xy(lp);
        ctx.moveTo(p.x, p.y);
        for (j = 1; j < this.points.length; j++) {
            p = this.dst2xy(lp, this.points[j]);
            ctx.lineTo(p.x, p.y);
            p = this.dst2xy(this.points[j]);
            ctx.lineTo(p.x, p.y);
            lp = this.points[j];
        }
        p.x = this.viewport.x + this.viewport.dx;
        ctx.lineTo(p.x, p.y);
    } else {
        p = this.st2xy(this.points[0]);
        ctx.moveTo(p.x, p.y);
        for (j = 1; j < this.points.length; j++) {
            p = this.st2xy(this.points[j]);
            ctx.lineTo(p.x, p.y);
        }
    }

    ctx.stroke();
};

/**
 * Render the label at (x, y) and return the width of the label
 * @param {number} x coordinate
 * @param {number} y coordinate
 */
Trace.prototype.renderLabel = function(x, y) {
    "use strict";
    var ctx = this.graph.ctx;
    ctx.fillStyle = this.options.colour;
    ctx.strokeStyle = this.options.colour;
    ctx.fillText(this.name, x, y);
    return ctx.measureText(this.name).width;
};

/**
 * Simple auto-scaling graph for a set of traces using an HTML5 canvas.
 * @param {jquery} $canvas jQuery object around canvas element
 * @param {object} options options for the graph
 * * `background_col`: colour of background
 * * `text_col`: colour of text
 * * `font_height`: height of label font
 * @class
 */
function Graph(options, $canvas) {
    "use strict";
    var self = this;

    self.$canvas = $canvas;
    self.ctx = $canvas[0].getContext("2d");

    self.options = $.extend({
        background_col: "black",
        text_col: "white",
        font_height: 10 // px
    }, options);

    if (!horz)
        $canvas.height($(window).height());
    
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
            $("#tip_canvas").show();
        },
        function() {
            $("#tip_canvas").hide();
        });

    self.next_slot = 0;
    self.traces = {};
}

/**
 * Add a point to the given trace on the graph.
 * @param {string} tracename name of the trace
 * @param x {number} x ordinate
 * @param y {number} y ordinate
 */
Graph.prototype.addPoint = function(tracename, x, y) {
    "use strict";
    this.traces[tracename].addPoint(x, y);
};

/**
 * Add a trace to the graph, of the given type ("binary" or anything else for a line)
 * @param {string} tracename unique trace name
 * @param {Config} trace config (see Trace)
 * @return {Trace} the trace
 */
Graph.prototype.addTrace = function(tracename, options) {
    this.traces[tracename] = new Trace(this, tracename, options);
    return this.traces[tracename];
};

/**
 * Update (draw) the graph.
 */
Graph.prototype.update = function() {
    "use strict";
    var $canvas = this.$canvas;
    var options = this.options;
    var ctx = this.ctx;
    var i, num_tr = 0;

    for (i in this.traces) num_tr++;
    if ($canvas.height() === 0 || num_tr === 0)
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
    if (horz) {
        trh = ($canvas.height() - this.options.font_height) / num_tr;
        w = $canvas.width();
    } else {
        trh = $canvas.width() / num_tr;
        w = $canvas.height() - this.options.font_height;
    }
    
    var troff = 0;
    for (i in this.traces) {
        var tit = this.traces[i];
        if (horz)
            tit.setViewport({
                x: 0, y: troff, dx: w, dy: trh
            });
        else
            tit.setViewport({
                x: troff, y: 0, dx: trh, dy: w
            });
        troff += trh;
    }

    // Paint the traces
    for (i in this.traces) {
        this.traces[i].render();
    }

    // Legends
    ctx.font = options.font_height + "px sans-serif";
    ctx.textBaseline = "bottom";

    var x = 20;
    for (i in this.traces) {
        x += this.traces[i].renderLabel(x, $canvas.height()) + 15;
    }
};

Graph.prototype.handleMouse = function(e, targ) {
    var $canvas = this.$canvas;
    var targ_left = $canvas.offset().left;
    var targ_top = $canvas.offset().top;

    // jQuery normalizes the pageX and pageY
    // pageX,Y are the mouse positions relative to the document
    var p = { x: e.pageX - targ_left, y: e.pageY - targ_top };
    var options = this.options;
    var th = options.font_height;

    if (p.x > $canvas.height() - th) {
        $("#tip_canvas").hide();
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
    var text = " " + tn + ": " + options.render_label("t", l.t) + "\n"
        + options.render_label("s", l.s);

    var $tipCanvas = $("#tip_canvas");
    var tipCtx = $tipCanvas[0].getContext("2d");
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

    $tipCanvas.css({
        left: (p.x + targ_left) + "px",
        top: (p.y + targ_top) + "px",
        width: tw,
        height: th
    });
    tipCtx.textBaseline = "top";
    tipCtx.fillText(text, 0, 0);
    $("#tip_canvas").show();
};

(function($) {
    "use strict";

    $.fn.autoscale_graph = function(options) {
        var $canvas = $(this);

        $(this).data("graph", new Graph(options, $canvas));
    };
})(jQuery);
