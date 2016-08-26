/*@preserve Copyright (C) 2015 Crawford Currie http://c-dot.co.uk license MIT*/

const TOP = 1;
const BOTTOM = TOP << 1;
const LEFT = BOTTOM << 1;
const RIGHT = LEFT << 1;

/**
 * Construct a new trace line
 * @param {string} name name of the trace
 * @param {Config} options 
 * * `type`: trace type, may be "binary" or "continuous" (default)
 * * `min`: Point, optional bottom/left of y axis
 * * `max`: as `min`
 * * `colour`: colour of trace
 * * `adjust`: {}
 *   * `max`: {}
 *     * `x`: `clip` or `scale` - how to handle an out-or-range value at
 *            this end of this axis
 *     * `y`: as `x`
 *   * `min`: as `max`
 * @class
 */
function Trace(graph, name, options) {
    "use strict";
    var self = this;
    this.name = name;
    this.graph = graph;
    this.points = [];
    options = $.extend({
        type: "continuous",
        min: {},
        max: {},
        colour: "white",
        adjust: {},
        min: {},
        max: {}
    }, options);
    if (options.type === "binary")
        this.slot = graph.next_slot++;
    if (typeof options.min.x === "undefined")
        options.min.x = Number.MAX_VALUE;
    if (typeof options.min.y === "undefined")
        options.min.y = Number.MAX_VALUE;
    if (typeof options.max.x === "undefined")
        options.max.x = Number.MIN_VALUE;
    if (typeof options.max.y === "undefined")
        options.max.y = Number.MIN_VALUE;
    options.adjust = $.extend({
        max: {}, min: {}     
    }, options.adjust);
    // TODO: can't have clip at both ends of an axis
    options.adjust.min = $.extend({
        x: "clip", y: "scale"
    }, options.adjust.min);
    options.adjust.max = $.extend({
        x: "scale", y: "scale"
    }, options.adjust.max);
    this.options = options;
}

/**
 * Calculate the outcode for the given point in the given bounds
 */
Trace.prototype.outCode = function(p) {
    "use strict";
    var code = 0;
    if (p.x < this.options.min.x)
	code |= LEFT;
    else if (p.x > this.options.max.x)
	code |= RIGHT;
    if (p.y < this.options.min.y)
	code |= BOTTOM;
    else if (p.y > this.options.max.y)
	code |= TOP;
    return code;
};

// Cohen-Sutherland clipping
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

        if ((cc & TOP) !== 0) {
            x = a.x + (b.x - a.x) * (this.options.max.y - a.y) / (b.y - a.y);
            y = this.options.max.y;
        } else if ((cc & BOTTOM) !== 0) {
            x = a.x + (b.x - a.x) * (this.options.min.y - a.y) / (b.y - a.y);
            y = this.options.min.y;
        } else if ((cc & RIGHT) !== 0) {
            y = a.y + (b.y - a.y) * (this.options.max.x - a.x) / (b.x - a.x);
            x = this.options.max.x;
        } else if ((cc & LEFT) !== 0) {
            y = a.y + (b.y - a.y) * (this.options.min.x - a.x) / (b.x - a.x);
            x = this.options.min.x;
        }

	if (cc === ac) {
            a.x = x;
            a.y = y;
            ac = this.outCode(a);
        } else {
            b.x = x;
            b.y = y;
            bc = this.outCode(b);
        }
    }
    return false;
};

/**
 * Add a point to the trace
 * @param {point} OR p = object `{ x:, y: }`
 */
Trace.prototype.addPoint = function(x, y) {
    "use strict";
    var p;
    if (typeof y !== "undefined")
        p = { x: x, y: y };
    else
        p = x;
    this.points.push(p);
    this.extents = null; // clear cache
};

/**
 * Clip the data in the trace to the viewport
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
 * Get the limits of the points in the trace
 * @return {object} {min:{x:,y:}, max:{x:,y:}}
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

/**
 * Set the drawing area for this trace withing the graph canvas
 */
Trace.prototype.setViewport = function(vpt) {
    this.viewport = vpt;
};

/**
 * Convert a logical 0|1 to a canvas Y
 */
Trace.prototype.digitalY = function(sample) {
    var h = this.viewport.dy / 5;
    return this.viewport.y + this.viewport.dy - (h + sample * 3 * h);
};

/*
 * Convert a logical X to a canvas coordinate
 * @param x {number} ordinate
 * @private
 */
Trace.prototype.x2v = function(x) {
    "use strict";
    return Math.floor(
        this.viewport.x + (x - this.options.min.x) * this.viewport.dx
            / (this.options.max.x - this.options.min.x));
};

/**
 * Convert a logical Y to a canvas coordinate
 * @param y {number} ordinate
 * @private
 */
Trace.prototype.y2v = function(y) {
    "use strict";
    return Math.floor(
        this.viewport.y + this.viewport.dy
            - (y - this.options.min.y) * this.viewport.dy
            / (this.options.max.y - this.options.min.y));
};

/**
 * Convert logical point on a trace to a physical point (does not work for
 * digital traces)
 * @param {object} p {x:,y:} logical point (float)
 * @return {object} {x:,y:} physical point (int)
 * @private
 */
Trace.prototype.l2v = function(p) {
    "use strict";

    return {
        x: this.x2v(p.x),
        y: this.y2v(p.y)
    };
};

/**
 * Convert a canvas point to a logical point
 * @param {object} p {x:,y:} physical point (int)
 * @return {object} {x:,y:} logical point (float) or null if the point
 *  is outside the trace viewport
 * @private
 */
Trace.prototype.v2l = function(p) {
    "use strict";
    if (p.x < this.viewport.x || p.y < this.viewport.y
        || p.x > this.viewport.x + this.viewport.dx
        || p.y > this.viewport.y + this.viewport.dy)
        return undefined;

    return {
        x: this.options.min.x
            + (this.options.max.x - this.options.min.x)
            * (p.x - this.viewport.x)
            / this.viewport.dx,
        y: this.options.min.y
            + (this.options.max.y - this.options.min.y)
            * (p.y - this.viewport.y)
            / this.viewport.dy
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

    // Scale and clip the viewport
    var options = this.options;
    var range = {
        x: options.max.x - options.min.x,
        y: options.max.y - options.min.y
    };

    var adj = options.adjust;
    var e = this.getExtents();
    var clip = false;
    for (var ax in e.min) {
        // Scale first to shift the end of a clipped axis
        if (e.min[ax] < options.min[ax] && adj.min[ax] === "scale")
            options.min[ax] = e.min[ax];
        if (e.max[ax] > options.max[ax] && adj.max[ax] === "scale")
            options.max[ax] = e.max[ax];
        // Now apply clip, and flag a trace clip.
        if (e.min[ax] < options.min[ax] && adj.min[ax] === "clip") {
            options.min[ax] = options.max[ax] - range[ax];
            clip = true;
        }
        if (e.max[ax] > options.max[ax] && adj.max[ax] === "clip") {
            options.max[ax] = options.min[ax] + range[ax];
            clip = true;
        }
    }
/*
    if (clip)
        // SMELL: is this really necessary? It does keep the trace sizes
        // manageable, I suppose.
        this.clip();
*/
    if (this.points.length < 2)
        return;

    ctx.strokeStyle = this.options.colour;

    // Current
    ctx.beginPath();
    var p, j;
    if (this.options.type === "binary") {
        p = {
            x: this.x2v(this.points[0].x),
            y: this.digitalY(this.points[0].y)
        };
        ctx.moveTo(p.x, p.y);
        for (j = 1; j < this.points.length; j++) {
            p.x = this.x2v(this.points[j].x);
            ctx.lineTo(p.x, p.y);
            p.y = this.digitalY(this.points[j].y);
            ctx.lineTo(p.x, p.y);
        }
        p.x = this.viewport.x + this.viewport.dx;
        ctx.lineTo(p.x, p.y);
    } else {
        p = this.l2v(this.points[0]);
        ctx.moveTo(p.x, p.y);
        for (j = 1; j < this.points.length; j++) {
            p = this.l2v(this.points[j]);
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

        var targ_left = $canvas.offset().left;
        var targ_top = $canvas.offset().top;

        // jQuery normalizes the pageX and pageY
        // pageX,Y are the mouse positions relative to the document
        var p = { x: e.pageX - targ_left, y: e.pageY - targ_top };
        var th = self.options.font_height;

        if (p.y <= $canvas.height() - th) {
            var l, tn;
            for (tn in self.traces) {
                l = self.traces[tn].v2l(p);
                if (l)
                    break;
            }
            if (!l)
                return;
            var text = " " + tn + ": " + options.render_label("x", l.x) + ","
                + options.render_label("y", l.y);

            var $tipCanvas = $("#tip_canvas");
            var tipCtx = $tipCanvas[0].getContext("2d");
            var tw = tipCtx.measureText(text).width;

            // CSS just stretches the content
            tipCtx.canvas.width = tw;
            tipCtx.canvas.height = th;

            tipCtx.fillStyle = self.options.background_col;
            tipCtx.fillRect(0, 0, tw, th);

            tipCtx.fillStyle = "white";
            tipCtx.strokeStyle = "white";
            tipCtx.font = th + "px sans-serif";

            // Move the tip to the left if too near right edge
            if (p.x + tw > $canvas.width())
                p.x -= tw;

            $tipCanvas.css({
                left: (p.x + targ_left) + "px",
                top: (p.y + targ_top) + "px",
                width: tw,
                height: th
            });
            tipCtx.textBaseline = "top";
            tipCtx.fillText(text, 0, 0);
            $("#tip_canvas").show();
        } else
            $("#tip_canvas").hide();           
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
    var i, j, num_tr = 0;

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
    var trh = ($canvas.height() - this.options.font_height) / num_tr;
    var troff = 0;
    for (i in this.traces) {
        var tit = this.traces[i];
        tit.setViewport({
            x: 0, y: troff, dx: $canvas.width(), dy: trh
        });
        troff += trh;
/*
        ctx.strokeStyle = tit.options.colour;
        ctx.strokeRect(tit.viewport.x, tit.viewport.y,
                       tit.viewport.dx, tit.viewport.dy);
*/
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

(function($) {
    "use strict";

    $.fn.autoscale_graph = function(options) {
        var $canvas = $(this);

        $(this).data("graph", new Graph(options, $canvas));
    };
})(jQuery);
