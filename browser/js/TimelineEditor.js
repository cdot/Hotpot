/*@preserve Copyright (C) 2017 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

/**
 * Interactive canvas that supports the editing of a timeline. The
 * idea is that the timeline provides a value at any point along it's
 * length. The application is a temperature controller, where the
 * exact temperature required at any given time can be read from the
 * timeline.
 * Construct over a div, which will be the container for the canvas.
 * A "selection_changed" event is sent to the container when the
 * selected point has change in some way, either a new point is
 * selected or the position of the point has changed.
 * See https://github.com/benmajor/jQuery-Touch-Events for touch event
 * support.
 */
var POINT_RADIUS = 20; // px
var POINT_RADIUS2 = POINT_RADIUS * POINT_RADIUS;

const Utils = require("../../common/Utils.js");
const Vec = require("../../common/Vec.js");
const Time = require("../../common/Time.js");

/**
 * Timeline editor object.
 * @param timeline a Timeline object
 */
function TimelineEditor(timeline, $container) {
    "use strict";

    this.timeline = timeline;

    this.drag_pt_ix = -1;
    this.sel_pt_ix = 0;
    this.last_tip_xy = undefined;
    this.drag_start_xy = undefined;
    this.$container = $container;
    
    this.$main_canvas = $("<canvas></canvas>")
        .css("width", "100%");
    $container.append(this.$main_canvas);

    this.$tip_canvas = $("<canvas></canvas>")
        .addClass('overlay')
        .css("z-index", 5);
    $container.append(this.$tip_canvas);
    
    this.$selection_canvas = $("<canvas></canvas>")
        .addClass('overlay')
        .css({
            width: 2 * POINT_RADIUS,
            height: 2 * POINT_RADIUS,
            "z-index": 10});
    $container.append(this.$selection_canvas);
    
    $('.overlay').hide();

    var self = this;

    function refresh_all() {
        self.$main_canvas.trigger("redraw");
        self.$selection_canvas.trigger("redraw");
        self.$tip_canvas.trigger("redraw");
    }
    
    this.$main_canvas.on("doubletap", function(e) {
        Utils.LOG("E: doubletap");
        e.preventDefault();
        self.is_editing = !self.is_editing;
        self.$main_canvas.trigger("redraw");
    });
    
    // Hold down over a line to add a point and select it
    this.$main_canvas.on("taphold", function(e, touch) {
        Utils.LOG("E: taphold ", self.drag_pt_ix);
        if (self.is_editing) {
            e.preventDefault();
            var xy = touch.startOffset;
            var selpt = self.overPoint(xy);
            if (typeof selpt === "undefined") {
                selpt = self.overLine(xy);
                if (typeof selpt !== "undefined") {
                    var tv = self.xy2tv(xy);
                    selpt = self.timeline.insertBefore(
                        selpt.next, tv);
                    self.changed = true;
                    self.last_tip_xy = xy;
                }
            } else {
                // taphold on a point will just select it
                self.changed = true;
                self.drag_pt_ix = -1;
                self.sel_pt_ix = selpt;
                self.$container.trigger("selection_changed");
                self.last_tip_xy = xy;
            }
            refresh_all();
        }
        return false;
    });

    this.$main_canvas.on($.getStartEvent(), function(e) {
        Utils.LOG("E: ", $.getStartEvent(), " ", self.drag_pt_ix);
        if (self.is_editing && self.drag_pt_ix < 0) {
            e.preventDefault();
            var xy = self.e2xy(e);
            var selpt = self.overPoint(xy);
            if (typeof selpt !== "undefined") {
                self.sel_pt_ix = selpt;
                self.drag_pt_ix = selpt;
                self.drag_start_xy = xy;
            } else {
                self.drag_pt_ix = -1;
            }
            self.$container.trigger("selection_changed");
            self.$selection_canvas.trigger("redraw");
            self.last_tip_xy = xy;
            self.$tip_canvas.trigger("redraw");
            // Don't return false or you'll kill taphold
        }
    });

    
    this.$main_canvas.on($.getMoveEvent(), function(e) {
        Utils.LOG("E: ", $.getMoveEvent(), " ", self.drag_pt_ix);
        if (self.is_editing && self.drag_pt_ix >= 0) {
            e.preventDefault();
            var xy = self.e2xy(e);
            var tv = self.xy2tv(xy);
            if (self.timeline.setPointConstrained(self.drag_pt_ix, tv)) {
                self.changed = true;
                self.$container.trigger("selection_changed");
            }
            self.$selection_canvas.trigger("redraw");
            self.last_tip_xy = xy;
            self.$tip_canvas.trigger("redraw");
        }
    });
    
    this.$main_canvas.on($.getEndEvent(), function(e) {
        Utils.LOG("E: ", $.getEndEvent(), " ", self.drag_pt_ix);
        var xy = self.e2xy(e);
        self.last_tip_xy = xy;
        if (self.is_editing && self.drag_pt_ix >= 0) {
            e.preventDefault();
            self.drag_pt_ix = -1;
            self.$container.trigger("selection_changed");
            self.$main_canvas.css( 'cursor', 'default' );
            refresh_all();
            return false;
        } else
            self.$tip_canvas.trigger("redraw");            
    });

    this.$main_canvas.hover(
        function() {
            self.$tip_canvas.show();
        },
        function() {
            self.$tip_canvas.hide();
        });

    this.$main_canvas.on("redraw", function() {
        self.drawMainCanvas();
    });
    
    this.$tip_canvas.on("redraw", function() {
        self.drawTipCanvas();
    });
    
    this.$selection_canvas.on("redraw", function() {
        self.drawSelectionCanvas();
    });
    
    var resizeTimer;

    // Debounce resizing
    $(window)/*this.$main_canvas*/.on('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(refresh_all, 100);
    });
    
    this.$main_canvas.trigger("redraw");
}

/**
 * Map a touch event to an XY point
 * @param e the event
 * @return the XY point
 * @private
 */
TimelineEditor.prototype.e2xy = function(e) {
    if (e.changedTouches)
        return this.mouse2xy(e.changedTouches[0]);
    else
        return this.mouse2xy(e);
};

/**
 * Map a mouse event to an XY point
 * @param e the event
 * @return the XY point
 * @private
 */
TimelineEditor.prototype.mouse2xy = function(e) {
    return { x: e.pageX - this.$main_canvas.offset().left,
             y: e.pageY - this.$main_canvas.offset().top };
};

/**
 * Determine if point p is within a minimum range of an existing
 * timeline point.
 * @param xy a point in the {x: y:} canvas space
 * @param rad optional minimum range
 * @return the index of the point it's over, or undefined
 * @private
 */
TimelineEditor.prototype.overPoint = function(xy, rad) {
    // Done in canvas space to avoid problems with aspect ratios
    "use strict";

    var min2 = Number.MAX_VALUE;
    var selected;
    for (var i = 0; i < this.timeline.nPoints(); i++) {
        var pt = this.tv2xy(this.timeline.getPoint(i));
        var d = Vec.sub(xy, pt);
        var dist2 = Vec.mag2(d);
        //Utils.LOG("Test ", i, " at ", pt, " dist ", Math.sqrt(dist2));
        if (dist2 <= min2 || typeof selected === "undefined") {
            //Utils.LOG("< ", min2);
            min2 = dist2;
            selected = i;
        }
    }
    //Utils.LOG("Closest ", selected, " at ",
    //          this.tv2xy(this.timeline.getPoint(selected)),
    //          " dist ", Math.sqrt(min2));
    if (min2 > (typeof rad === "undefined" ? POINT_RADIUS2 : rad * rad))
        return undefined;
    return selected;
};

/**
 * Determine if point p is within a minimum range of a line between two
 * neighbouring points.
 * Done in canvas space.
 * @param xy a point on the canvas
 * @param rad optional minimum range
 * @return the index of the point at the end of the line it's over,
 * or undefined
 * @private
 */
TimelineEditor.prototype.overLine = function(xy, rad) {
    // Done in canvas space to avoid problems with aspect ratios
    "use strict";

    var min2 = Number.MAX_VALUE;
    var selected;
    var p1 = this.tv2xy(this.timeline.getPoint(0));
    for (var i = 1; i < this.timeline.nPoints(); i++) {
        var p2 = this.tv2xy(this.timeline.getPoint(i));
        var line = Vec.sub(p2, p1); // p2-p1
        var lineLen = Vec.mag(line); // |line|
        var vLine = Vec.normalise(line, lineLen); // (p2-p1) / lineLen
        var d = Vec.dot(Vec.sub(xy, p1), vLine); // (xy-p1) . vLine
        var cp;
        if (d < 0)
            cp = p1; // before start
        else if (d > lineLen)
            cp = p2; // after end
        else
            cp = Vec.add(p1, Vec.mul(vLine, d)); // closest point
        var dist2 = Vec.mag2(Vec.sub(cp, xy));
        //Utils.LOG("Test ", i, " dist ", Math.sqrt(dist2));
        if (dist2 < min2 || typeof selected === "undefined") {
            //Utils.LOG("< ", Math.sqrt(min2));
            min2 = dist2;
            selected = { next: i, point: cp };
        }
        p1 = p2;
    }
    //Utils.LOG("Closest ", selected, " dist ", Math.sqrt(min2));
    if (min2 > (typeof rad === "undefined" ? POINT_RADIUS2 : rad * rad))
        return undefined;
    return selected;
};

/**
 * Convert a timeline point to canvas space
 * @private
 */
TimelineEditor.prototype.tv2xy = function(p) {
    "use strict";
    return {
        x: (p.time * this.$main_canvas.width()) / this.timeline.period,
        y: this.$main_canvas.height() *
            (1 - (p.value - this.timeline.min) /
             (this.timeline.max - this.timeline.min))
    };
};

/**
 * Convert a canvas point to timeline space
 * @private
 */
TimelineEditor.prototype.xy2tv = function(p) {
    "use strict";
    return {
        time: this.timeline.period * p.x / this.$main_canvas.width(),
        value: this.timeline.min + (this.timeline.max - this.timeline.min) *
            (this.$main_canvas.height() - p.y) / this.$main_canvas.height()
    };
};

/**
 * Set the crosshairs on the timeline
 * @param time time for the crosshairs
 * @param value value for the crosshairs
 * @return this
 */
TimelineEditor.prototype.setCrosshairs = function(time, value) {
    if (typeof this.crosshairs === "undefined" ||
        this.crosshairs.time != time ||
        this.crosshairs.value != value) {
        
        this.crosshairs = { time: time, value: value };

        if (this.drag_pt_ix < 0) {
            // Don't trigger a redraw during dragging
            this.$main_canvas.trigger("redraw");
        }
    }
    return this;
};

/**
 * get the index of the currently selected point.
 * @return <index:, time:, value:> for selected point
 */
TimelineEditor.prototype.getSelectedPoint = function() {
    var pt = this.timeline.getPoint(this.sel_pt_ix);
    return {
        index: this.sel_pt_ix,
        time: pt.time,
        value: pt.value
    };
};

/**
 * Set the selected point. The selected point must be a point on the
 * timeline.
 * @param pno point to select
 * @return this
 */
TimelineEditor.prototype.setSelectedPoint = function(pno) {
    this.is_editing = true;
    if (pno < 0)
        pno = 0;
    if (pno >= this.timeline.nPoints())
        pno = this.timeline.nPoints();
    if (pno != this.sel_pt_ix) {
        this.sel_pt_ix = pno;
        this.$container.trigger("selection_changed");
        this.$selection_canvas.trigger("redraw");
    }
    return this;
};

/**
 * Set the time for the currently selected point.
 * @param t time to set. Will be constrained to the valid range.
 * @return this
*/
TimelineEditor.prototype.setSelectedTime = function(t) {
    var dp = this.timeline.getPoint(this.sel_pt_ix);
    dp = { time: t, value: dp.value };
    if (this.timeline.setPointConstrained(this.sel_pt_ix, dp)) {
        this.$main_canvas.trigger("redraw");
        this.$tip_canvas.trigger("redraw");
        this.$selection_canvas.trigger("redraw");
    };
};

/**
 * Set the value for the currently selected point.
 * @param v value to set. Will be constrained to the valid range.
 * @return this
*/
TimelineEditor.prototype.setSelectedValue = function(v) {
    var dp = this.timeline.getPoint(this.sel_pt_ix);
    dp = { time: dp.time, value: v };
    if (this.timeline.setPointConstrained(this.sel_pt_ix, dp)) {
        this.$main_canvas.trigger("redraw");
        this.$tip_canvas.trigger("redraw");
        this.$selection_canvas.trigger("redraw");
    };
};

/**
 * Remove the currently selected point. The selected point will be moved
 * to the next point after the removed point, or the last point if that's
 * not legal.
 * @return this
*/
TimelineEditor.prototype.removeSelectedPoint = function() {
    try {
        this.timeline.remove(this.sel_pt_ix);
        if (this.selectedPoint > this.timeline.nPoints() - 1)
            this.selectedPoint = this.timeline.nPoints() - 1;
        this.$main_canvas.trigger("redraw");
        this.$tip_canvas.trigger("redraw");
        this.$selection_canvas.trigger("redraw");
    } catch (e) {
        Utils.ERROR(e);
    }
    return this;
};

/**
 * @private
 */
TimelineEditor.prototype.drawSelectionCanvas = function() {
    "use strict";
    
    if (this.drag_pt_ix < 0 && this.sel_pt_ix < 0) {
        this.$selection_canvas.hide();
        return;
    }

    this.$selection_canvas.show();
    var pCtx = this.$selection_canvas[0].getContext("2d");
    pCtx.canvas.width = 2 * POINT_RADIUS;
    pCtx.canvas.height = 2 * POINT_RADIUS;
    if (this.sel_pt_ix >= 0) {
        var xy = this.tv2xy(this.timeline.getPoint(this.sel_pt_ix));
        this.$selection_canvas.css({
            left: (xy.x - POINT_RADIUS + this.$main_canvas.offset().left) + "px",
            top: (xy.y - POINT_RADIUS + this.$main_canvas.offset().top) + "px"
        });
        pCtx.fillStyle = '#FFFF0077';
        pCtx.beginPath();
        pCtx.arc(POINT_RADIUS, POINT_RADIUS, POINT_RADIUS, 0, 2 * Math.PI, false);
        pCtx.fill();
    }
    if (this.drag_pt_ix >= 0) {
        var xy = this.tv2xy(this.timeline.getPoint(this.drag_pt_ix));
        this.$selection_canvas.css({
            left: (xy.x - POINT_RADIUS + this.$main_canvas.offset().left) + "px",
            top: (xy.y - POINT_RADIUS + this.$main_canvas.offset().top) + "px"
        });
        pCtx.fillStyle = '#FF000077';
        pCtx.beginPath();
        pCtx.arc(POINT_RADIUS, POINT_RADIUS, POINT_RADIUS, 0, 2 * Math.PI, false);
        pCtx.fill();
    }
};

/**
 * @private
 */
TimelineEditor.prototype.drawTipCanvas = function() {
    "use strict";

    var tv, fg, bg, xy;

    if (this.drag_pt_ix < 0) {
        xy = this.last_tip_xy;
        if (!xy)
            return;
        tv = this.xy2tv(xy);
        fg = "white";
    } else {
        // Dragging, lock to the drag point
        tv = this.timeline.getPoint(this.drag_pt_ix);
        xy = this.tv2xy(tv);
        fg = "black";
        bg = "yellow";
    }

    var ts = Time.unparse(tv.time);
    var vs = /*this.timeline.valueAtTime(tv.time)*/tv.value.toFixed(1);
    var text = "  " + ts + " : " + vs;

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
    if (xy.x + tw > this.$main_canvas.width())
        xy.x -= tw + 2; // plus a bit to clear the cursor

    this.$tip_canvas.css({
        left: (xy.x + this.$main_canvas.offset().left) + "px",
        top: (xy.y + this.$main_canvas.offset().top) + "px",
        width: tw,
        height: th
    });
    tipCtx.textBaseline = "top";
    if (text.indexOf("NaN") >= 0)
        debugger;
    tipCtx.fillText(text, 0, 0);
};

/**
 * @private
 */
TimelineEditor.prototype.drawMainCanvas = function() {
    "use strict";
    var ch = this.$main_canvas.height();
    var cw = this.$main_canvas.width();

    if (ch === 0 || cw === 0)
        return;

    // Rendering doesn't work unless you force the attrs
    this.$main_canvas.attr("width", cw);
    this.$main_canvas.attr("height", ch);

    // Background
    var ctx = this.$main_canvas[0].getContext("2d");
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, cw, ch);

    // Crosshairs
    if (typeof this.crosshairs !== "undefined") {
        ctx.beginPath();
        ctx.strokeStyle = "red";
        
        var vmin = this.tv2xy({time: this.crosshairs.time,
                               value: this.timeline.min});
        ctx.moveTo(vmin.x, vmin.y);
        var vmax = this.tv2xy({time: this.crosshairs.time,
                               value: this.timeline.max});
        ctx.lineTo(vmax.x, vmax.y);
        
        var hmin = this.tv2xy({time: 0, value: this.crosshairs.value});
        ctx.moveTo(hmin.x, hmin.y);
        var hmax = this.tv2xy({time: this.timeline.period,
                               value: this.crosshairs.value});
        ctx.lineTo(hmax.x, hmax.y);
        
        ctx.stroke();      
    }

    // Timeline
    ctx.beginPath();
    ctx.fillStyle = 'white';
    ctx.strokeStyle = "white";
    for (var i = 0; i < this.timeline.nPoints(); i++) {
        var p = this.tv2xy(this.timeline.getPoint(i));
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    if (this.is_editing) {
        ctx.fillStyle = '#00FF0066';
        for (var i = 0; i < this.timeline.nPoints(); i++) {
            var p = this.tv2xy(this.timeline.getPoint(i));
            ctx.beginPath();
            ctx.arc(p.x, p.y, POINT_RADIUS, 0, 2 * Math.PI, false);
            ctx.fill();
        }
    }
};

(function($) {
    "use strict";
    $.fn.TimelineEditor = function(timeline) {
        var te = new TimelineEditor(timeline, $(this));
        $(this).data("timeline_editor", te);
    };
})(jQuery);
