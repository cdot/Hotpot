/*@preserve Copyright (C) 2017 Crawford Currie http://c-dot.co.uk license MIT*/

// Interactive canvas that supports the editing of a timeline. The idea is
// that the timeline provides a value at any point along it's length. The
// application is a temperature controller, where the exact temperature
// required at any given time can be read from the timeline.
var POINT_RADIUS = 3; // px
var POINT_RADIUS2 = POINT_RADIUS * POINT_RADIUS;

const Vec = require("common/Vec.js");
const Time = require("common/Time.js");

/**
 * Timeline editor object.
 * @param timeline a Timeline object
 */
function TimelineEditor(timeline, $canvas) {
    "use strict";
    var self = this;

    self.timeline = timeline;

    // Editor value range
    self.drag_point = -1;

    self.$canvas = $canvas;
    self.ctx = $canvas[0].getContext("2d");

    self.$tip_canvas = $("<canvas></canvas>");
    $canvas.after(self.$tip_canvas);
    self.$tip_canvas.css("display", "none");
    self.$tip_canvas.css("position", "absolute");
    self.$tip_canvas.css("background-color", "transparent");
    self.$tip_canvas.css("color", "white");
    self.$tip_canvas.css("pointer-events", "none");

    function getTarget(e) {
        return {
            evt: e,
            pt: { x: e.pageX - self.$canvas.offset().left,
                  y: e.pageY - self.$canvas.offset().top }
        }
    }

    $canvas.on("mousemove", function(e) {
        self.handleMouseMove(e, getTarget(e));
    });

    $canvas.on("mousemove", function(e) {
        self.handleTipCanvas(e, getTarget(e));
    });

    $canvas.on("mousedown", function(e) {
        var selpt = self.overPoint(self.e2xy(e));
        if (typeof selpt !== "undefined") {
            self.drag_point = selpt;
            $canvas.trigger("render");
        } else {
            endDrag();
        }
    });

    function endDrag() {
        if (self.drag_point >= 0) {
            self.drag_point = -1;
            $canvas.trigger("change");
        }
    }

    $canvas.on("mouseup", endDrag);
    $canvas.on("mouseout", endDrag);

    $canvas.on("click", function(e) {
        var xy = self.e2xy(e);
        if (typeof self.overPoint(xy) === "undefined") {
            var intercept = self.overLine(xy);
            if (typeof intercept !== "undefined") {
                self.timeline.insertBefore(
                    intercept.next, self.xy2p(intercept.point));
                $canvas.trigger("change");
            }
        }
        // else do nothing if we are over a point - may be a pending double
        // which will delete the point.
    });

    $canvas.on("dblclick", function(e) {
        var idx = self.overPoint(self.e2xy(e));
        if (typeof idx !== "undefined" &&
            idx > 0 && idx < self.timeline.nPoints() - 1) {
            self.timeline.remove(idx);
            $canvas.trigger("change");
        }
    });

    $canvas.hover(
        function() {
            self.$tip_canvas.show();
        },
        function() {
            self.$tip_canvas.hide();
        });

    $canvas.on("change", function() {
        if (self.redrawing)
            return;
        self.redrawing = true;
        self.render();
        self.redrawing = false;
    });
    
    var resizeTimer;

    // Debounce resizing
    $canvas.on('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            $canvas.trigger("change");
        }, 250);
    });
    
    $canvas.trigger("change");
}

TimelineEditor.prototype.e2xy = function(e) {
    return { x: e.pageX - this.$canvas.offset().left,
             y: e.pageY - this.$canvas.offset().top };
};

TimelineEditor.prototype.handleMouseMove = function(e) {
    "use strict";

    var xy = this.e2xy(e);

    // Handle being over a point
    if (this.drag_point >= 0 || typeof this.overPoint(xy) !== "undefined")
        // Change to hand cursor
        this.$canvas.css( 'cursor', 'pointer' );
    else
        this.$canvas.css( 'cursor', 'default' );

    // Handle drag
    if (e.buttons !== 0 && this.drag_point >= 0) {
        var tp = this.xy2p(xy);
        if (this.timeline.setPointConstrained(this.drag_point, tp)) {
            this.$canvas.trigger("change");
        }
    }
};

TimelineEditor.prototype.handleTipCanvas = function(e) {
    "use strict";

    var xy, tp, fg, bg;

    if (this.drag_point < 0) {
        xy = this.e2xy(e);
        tp = this.xy2p(xy);
        fg = "white";
    } else {
        // Dragging, lock to the drag point
        tp = this.timeline.getPoint(this.drag_point);
        xy = this.p2xy(tp);
        fg = "black";
        bg = "yellow";
    }

    var text = "  " + Time.unparse(tp.time) + " : "
        + this.timeline.valueAtTime(tp.time).toPrecision(4);

    var tipCtx = this.$tip_canvas[0].getContext("2d");
    var tw = tipCtx.measureText(text).width;
    var th = 10;

    // CSS just stretches the content
    tipCtx.canvas.width = tw;
    tipCtx.canvas.height = th;

    if (bg) {
        tipCtx.fillStyle = bg;
        tipCtx.fillRect(0, 0, tw, th);
    }

    tipCtx.fillStyle = fg;
    tipCtx.font = th + "px sans-serif";

    // Move the tip to the left if too near right edge
    if (xy.x + tw > this.$canvas.width())
        xy.x -= tw + 2; // plus a bit to clear the cursor

    this.$tip_canvas.css({
        left: (xy.x + this.$canvas.offset().left) + "px",
        top: (xy.y + this.$canvas.offset().top) + "px",
        width: tw,
        height: th
    });
    tipCtx.textBaseline = "top";
    tipCtx.fillText(text, 0, 0);
};

/**
 * Determine if point p is within a minimum range of an existing
 * timeline point. Done in canvas space.
 * @param p a point on the canvas
 * @return the index of the point it's over, or undefined
 */
TimelineEditor.prototype.overPoint = function(p) {
    "use strict";

    var min2 = POINT_RADIUS2;
    var selpt;
    for (var i = 0; i < this.timeline.nPoints(); i++) {
        var pt = this.p2xy(this.timeline.getPoint(i));
        var d = Vec.sub(p, pt);
        var dist2 = Vec.mag2(d);
        if (dist2 <= min2) {
            dist2 = min2;
            selpt = i;
        }
    }
    return selpt;
};

/**
 * Determine if point p is within a minimum range of an existing line.
 * Done in canvas space.
 * @param p a point on the canvas (or an event in the canvas)
 * @return the index of the point at the end of the line it's over,
 * or undefined
 */
TimelineEditor.prototype.overLine = function(p) {
    "use strict";

    var min2 = POINT_RADIUS2;

    var sel;
    var p1 = this.p2xy(this.timeline.getPoint(0));
    for (var i = 1; i < this.timeline.nPoints(); i++) {
        var p2 = this.p2xy(this.timeline.getPoint(i));
        var line = Vec.sub(p2, p1);
        var len = Vec.mag(line);
        var n = Vec.normalise(line, len);
        var v = Vec.sub(p, p1);
        var d = Vec.dot(v, n);
        var cp;
        if (d < 0) {
            cp = p1;
        } else if (d > len) {
            cp = p2;
        } else {
            cp = Vec.add(p1, Vec.mul(n, d));
        }
        var dist2 = Vec.mag2(Vec.sub(cp, p));
        if (dist2 < min2) {
            dist2 = min2;
            sel = { next: i, point: cp };
        }
        p1 = p2;
    }
    return sel;
};

/**
 * Convert a timeline point to canvas space
 */
TimelineEditor.prototype.p2xy = function(p) {
    "use strict";
    return {
        x: (p.time * this.$canvas.width()) / this.timeline.period,
        y: this.$canvas.height() *
            (1 - (p.value - this.timeline.min) /
             (this.timeline.max - this.timeline.min))
    };
};

/**
 * Convert a canvas point to timeline space
 */
TimelineEditor.prototype.xy2p = function(p) {
    "use strict";
    return {
        time: this.timeline.period * p.x / this.$canvas.width(),
        value: this.timeline.min + (this.timeline.max - this.timeline.min) *
            (this.$canvas.height() - p.y) / this.$canvas.height()
    };
};

/**
 * Set the crosshairs on the timeline
 */
TimelineEditor.prototype.setCrosshairs = function(time, value) {
    if (typeof this.crosshairs === "undefined" ||
        this.crosshairs.time != time ||
        this.crosshairs.value != value) {
        
        this.crosshairs = { time: time, value: value };
        this.$canvas.trigger("change");
    }
};

/**
 * Re-render the canvas
 */
TimelineEditor.prototype.render = function() {
    "use strict";
    var ch = this.$canvas.height();
    var cw = this.$canvas.width();

    if (ch === 0 || cw === 0)
        return;

    // Rendering doesn't work unless you force the attrs
    this.$canvas.attr("width", cw);
    this.$canvas.attr("height", ch);

    // Background
    var ctx = this.ctx;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, cw, ch);

    // Crosshairs
    if (typeof this.crosshairs !== "undefined") {
        ctx.beginPath();
        ctx.strokeStyle = "red";
        
        p = this.p2xy({time: this.crosshairs.time, value: this.timeline.min});
        ctx.moveTo(p.x, p.y);
        p = this.p2xy({time: this.crosshairs.time, value: this.timeline.max});
        ctx.lineTo(p.x, p.y);
        
        p = this.p2xy({time: 0, value: this.crosshairs.value});
        ctx.moveTo(p.x, p.y);
        p = this.p2xy({time: this.timeline.period,
                       value: this.crosshairs.value});
        ctx.lineTo(p.x, p.y);
        
        ctx.stroke();      
    }

    // Timeline
    ctx.beginPath();
    ctx.fillStyle = 'white';
    ctx.strokeStyle = "white";
    var p = this.p2xy(this.timeline.getPoint(0));
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, POINT_RADIUS, 0, 2 * Math.PI, false);
    ctx.moveTo(p.x, p.y);
    for (var i = 1; i < this.timeline.nPoints(); i++) {
        p = this.p2xy(this.timeline.getPoint(i));
        ctx.lineTo(p.x, p.y);
        ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI, false);
        ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();

    // Drag point
    if (this.drag_point >= 0) {
        var p = this.p2xy(this.timeline.getPoint(this.drag_point));
        ctx.beginPath();
        ctx.fillStyle = 'red';
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, POINT_RADIUS, 0, 2 * Math.PI, false);
        ctx.fill()
    }
    
    this.$canvas.trigger("rendered");
};

(function($) {
    "use strict";

    $.fn.TimelineEditor = function(timeline) {
        $(this).data("timeline_editor", new TimelineEditor(timeline, $(this)));
    };
})(jQuery);
