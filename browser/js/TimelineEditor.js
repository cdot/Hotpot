/*@preserve Copyright (C) 2017 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

define("browser/js/TimelineEditor", ["common/js/Utils", "common/js/Vec", "common/js/Time", "jquery", "touch-punch"], function(Utils, Vec, Time) {
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
    const POINT_RADIUS = 10; // px
    const POINT_RADIUS2 = POINT_RADIUS * POINT_RADIUS;

    const POINT_2RADIUS = POINT_RADIUS * 2;
    const POINT_2RADIUS2 = POINT_2RADIUS * POINT_2RADIUS;

    /**
     * Timeline editor object.
     * @param timeline a Timeline object
     */
    class TimelineEditor {

        constructor(timeline, $container) {
            this.timeline = timeline;

            this.hit_pt_ix = -1;
            this.isDragging = false;
            this.sel_pt_ix = -1;
            delete this.last_tip_xy;
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
                "z-index": 10
            });
            $container.append(this.$selection_canvas);

            $('.overlay').hide();

            this.$main_canvas.on("mousedown", e => this.handleMouseDown(e));
            this.$main_canvas.on("mousemove", e => this.handleMouseMove(e));
            this.$main_canvas.on("mouseup", e => this.handleMouseUp(e));

            this.$main_canvas.hover(
                () => this.$tip_canvas.show(), () => this.$tip_canvas.hide());

            this.$main_canvas.on("redraw", () => this.drawMainCanvas());
            this.$tip_canvas.on("redraw", () => this.drawTipCanvas());
            this.$selection_canvas.on("redraw", () => this.drawSelectionCanvas());

            let resizeTimer;

            // Debounce resizing
            $(window) /*this.$main_canvas*/ .on('resize', () => {
                if (resizeTimer)
                    (resizeTimer);
                resizeTimer = setTimeout(() => { this.refresh_all(); }, 100);
            });

            this.$main_canvas.trigger("redraw");
        }

        refresh_all() {
            this.$main_canvas.trigger("redraw");
            this.$selection_canvas.trigger("redraw");
            this.$tip_canvas.trigger("redraw");
        }

        handleMouseDown(e) {
            //console.log("E: mousedown ", this.hit_pt_ix);
            e.preventDefault();
            let xy = this.e2xy(e);
            let selpt = this.overPoint(xy, POINT_RADIUS2);
            if (!selpt) {
                this.hit_pt_ix = -1;
            } else {
                this.sel_pt_ix = selpt;
                this.hit_pt_ix = selpt;
                // Update UI fields
                this.$container.trigger("selection_changed");
            }
            this.$selection_canvas.trigger("redraw");
            this.last_tip_xy = xy;
            this.$tip_canvas.trigger("redraw");
            return false;
        }

        handleMouseMove(e) {
            let xy = this.e2xy(e);
            let tv = this.xy2tv(xy);
            if (this.hit_pt_ix >= 0) {
                // We don't start dragging until the cursor has moved
                // by at least the point radius since the mouse was pressed
                if (!this.isDragging) {
                    let delta = Vec.sub(xy, this.tvi2xy(this.hit_pt_ix));
                    if (Vec.mag2(delta) > POINT_RADIUS2)
                        this.isDragging = true;
                }
                if (this.isDragging
                    && this.timeline.setPointConstrained(this.hit_pt_ix, tv)) {
                    if (typeof this.onChanged == "function") this.onChanged();
                    // Update UI fields
                    this.$container.trigger("selection_changed");
                }
            } else {
                let selpt = this.overPoint(xy, POINT_RADIUS2);
                if (selpt) {
                    this.sel_pt_ix = selpt;
                    // Update UI fields
                    this.$container.trigger("selection_changed");
                }
            }
            this.$selection_canvas.trigger("redraw");
            this.last_tip_xy = xy;
            this.$tip_canvas.trigger("redraw");
        }

        handleMouseUp(e) {
            let xy = this.e2xy(e);
            //console.log("E: mouseup ", xy);
            this.last_tip_xy = xy;
            if (this.isDragging) {
                // We have dragged a point at least POINT_RADIUS away from
                // where it started. Simply finish the drag.
                this.hit_pt_ix = -1
                this.isDragging = false;
                // Update UI fields
                this.$container.trigger("selection_changed");
                this.$main_canvas.css('cursor', 'default');
                this.refresh_all();
                return false;
            }

            let tv = this.xy2tv(xy);
            if (this.hit_pt_ix >= 0) {
                // Did we click a point and release within the radius of
                // the same point? If so, this is a NOP
                let delta = Vec.sub(xy, this.tvi2xy(this.hit_pt_ix));
                if (Vec.mag2(delta) <= POINT_RADIUS2) {
                    this.hit_pt_ix = -1;
                    return false;
                }
            }

            let selpt = this.overLine(xy, POINT_RADIUS2);
            if (typeof selpt !== "undefined") {
                // The mouse was released over a line; insert a
                // new point if it is at least 2 * POINT_RADIUS2 away
                // from another point. Otherwise NOP
                let nearpt = this.overPoint(xy, POINT_2RADIUS2);
                if (nearpt >= 0) {
                    this.sel_pt_ix = this.timeline.insertBefore(selpt.next, tv);
                    if (typeof this.onChanged == "function") this.onChanged();
                }
                this.last_tip_xy = xy;
            }
        }

        tvi2xy(i) {
            return this.tv2xy(this.timeline.getPoint(i));
        }

        /**
         * Map a touch event to an XY point
         * @param e the event
         * @return the XY point
         * @private
         */
        e2xy(e) {
            if (e.changedTouches)
                return this.mouse2xy(e.changedTouches[0]);
            else
                return this.mouse2xy(e);
        }

        /**
         * Map a mouse event to an XY point
         * @param e the event
         * @return the XY point
         * @private
         */
        mouse2xy(e) {
            return {
                x: e.pageX - this.mcl,
                y: e.pageY - this.mct
            };
        }

        /**
         * Determine if point p is within a minimum range of an existing
         * timeline point.
         * @param xy a point in canvas space
         * @param r2 range*range
         * @return the index of the point it's over, or null
         * @private
         */
        overPoint(xy, r2) {
            // Done in canvas space to avoid problems with aspect ratios
            let min2 = Number.MAX_VALUE;
            let selected;
            for (let i = 0; i < this.timeline.nPoints; i++) {
                let pt = this.tvi2xy(i);
                let d = Vec.sub(xy, pt);
                let dist2 = Vec.mag2(d);
                //console.log("Test ", i, " at ", pt, " dist ", Math.sqrt(dist2));
                if (dist2 <= min2 || typeof selected === "undefined") {
                    //console.log("< ", min2);
                    min2 = dist2;
                    selected = i;
                }
            }
            //console.log("Closest ", selected, " at ",
            //          this.tv2xy(this.timeline.getPoint(selected)),
            //          " dist ", Math.sqrt(min2));
            if (min2 > r2)
                return null;
            return selected;
        }

        /**
         * Determine if point p is within a minimum range of a line between two
         * neighbouring points.
         * Done in canvas space.
         * @param xy a point on the canvas
         * @param r2 range*range
         * @return the index of the point at the end of the line it's over,
         * or undefined
         * @private
         */
        overLine(xy, r2) {
            // Done in canvas space to avoid problems with aspect ratios
            let min2 = Number.MAX_VALUE;
            let selected;
            let p1 = this.tvi2xy(0);
            for (let i = 1; i < this.timeline.nPoints; i++) {
                let p2 = this.tvi2xy(i);
                let line = Vec.sub(p2, p1); // p2-p1
                let lineLen = Vec.mag(line); // |line|
                let vLine = Vec.normalise(line, lineLen); // (p2-p1) / lineLen
                let d = Vec.dot(Vec.sub(xy, p1), vLine); // (xy-p1) . vLine
                let cp;
                if (d < 0)
                    cp = p1; // before start
                else if (d > lineLen)
                    cp = p2; // after end
                else
                    cp = Vec.add(p1, Vec.mul(vLine, d)); // closest point
                let dist2 = Vec.mag2(Vec.sub(cp, xy));
                //console.log("Test ", i, " dist ", Math.sqrt(dist2));
                if (dist2 < min2 || typeof selected === "undefined") {
                    //console.log("< ", Math.sqrt(min2));
                    min2 = dist2;
                    selected = {
                        next: i,
                        point: cp
                    };
                }
                p1 = p2;
            }
            //console.log("Closest ", selected, " dist ", Math.sqrt(min2));
            if (min2 > r2)
                return undefined;
            return selected;
        }

        /**
         * Convert a timeline point to canvas space
         * @private
         */
        tv2xy(p) {
            return {
                x: (p.time * this.mcw) / this.timeline.period,
                y: this.mch *
                (1 - (p.value - this.timeline.min) /
                 (this.timeline.max - this.timeline.min))
            };
        }

        get pointRadiusXY2() {
            return Vec.mag2(this.tv2xy(POINT_RADIUS_VEC));
        }

        /**
         * Convert a canvas point to timeline space (integer ms)
         * @private
         */
        xy2tv(p) {
            return {
                time: Math.trunc(this.timeline.period * p.x / this.mcw),
                value: this.timeline.min
                + (this.timeline.max - this.timeline.min)
                * (this.mch - p.y) / this.mch
            };
        }

        /**
         * Set the crosshairs on the timeline
         * @param time time for the crosshairs
         * @param value value for the crosshairs
         * @return this
         */
        setCrosshairs(time, value) {
            if (typeof this.crosshairs === "undefined" ||
                this.crosshairs.time != time ||
                this.crosshairs.value != value) {

                this.crosshairs = {
                    time: time,
                    value: value
                };

                if (this.hit_pt_ix < 0) {
                    // Don't trigger a redraw during dragging
                    this.$main_canvas.trigger("redraw");
                }
            }
            return this;
        }

        /**
         * get the index of the currently selected point.
         * @return {index:, time:, value:} for selected point or null if
         * no point selected
         */
        getSelectedPoint() {
            if (this.sel_pt_ix < 0)
                return null;

            let pt = this.timeline.getPoint(this.sel_pt_ix);
            return {
                index: this.sel_pt_ix,
                time: pt.time,
                value: pt.value
            };
        }

        /**
         * Set the selected point. The selected point must be a point on the
         * timeline.
         * @param pno point to select
         * @return this
         */
        setSelectedPoint(pno) {
            this.is_editing = true;
            if (pno < 0)
                pno = 0;
            if (pno >= this.timeline.nPoints)
                pno = this.timeline.nPoints;
            if (pno != this.sel_pt_ix) {
                this.sel_pt_ix = pno;
                // Update UI fields
                this.$container.trigger("selection_changed");
                this.$selection_canvas.trigger("redraw");
            }
            return this;
        }

        /**
         * Set the time for the currently selected point.
         * @param t time to set. Will be constrained to the valid range.
         * @return this
         */
        setSelectedTime(t) {
            let dp = this.timeline.getPoint(this.sel_pt_ix);
            dp = {
                time: t,
                value: dp.value
            };
            if (this.timeline.setPointConstrained(this.sel_pt_ix, dp)) {
                if (typeof this.onChanged == "function") this.onChanged();
                this.$main_canvas.trigger("redraw");
                this.$tip_canvas.trigger("redraw");
                this.$selection_canvas.trigger("redraw");
            };
        }

        /**
         * Set the value for the currently selected point.
         * @param v value to set. Will be constrained to the valid range.
         * @return this
         */
        setSelectedValue(v) {
            let dp = this.timeline.getPoint(this.sel_pt_ix);
            dp = {
                time: dp.time,
                value: v
            };
            if (this.timeline.setPointConstrained(this.sel_pt_ix, dp)) {
                if (typeof this.onChanged == "function") this.onChanged();
                this.$main_canvas.trigger("redraw");
                this.$tip_canvas.trigger("redraw");
                this.$selection_canvas.trigger("redraw");
            };
        }

        /**
         * Remove the currently selected point. The selected point will be moved
         * to the next point after the removed point, or the last point if that's
         * not legal.
         * @return this
         */
        removeSelectedPoint() {
            try {
                this.timeline.remove(this.sel_pt_ix);
                if (this.selectedPoint > this.timeline.nPoints - 1)
                    this.selectedPoint = this.timeline.nPoints - 1;
                if (typeof this.onChanged == "function") this.onChanged();
                this.$main_canvas.trigger("redraw");
                this.$tip_canvas.trigger("redraw");
                this.$selection_canvas.trigger("redraw");
            } catch (e) {
                Utils.TRACE(e);
            }
            return this;
        }

        /**
         * @private
         */
        drawSelectionCanvas() {

            if (this.hit_pt_ix < 0 && this.sel_pt_ix < 0) {
                this.$selection_canvas.hide();
                return;
            }

            this.$selection_canvas.show();
            let pCtx = this.$selection_canvas[0].getContext("2d");
            pCtx.canvas.width = 2 * POINT_RADIUS;
            pCtx.canvas.height = 2 * POINT_RADIUS;
            if (this.sel_pt_ix >= 0) {
                let xy = this.tvi2xy(this.sel_pt_ix);
                this.$selection_canvas.css({
                    left: (xy.x - POINT_RADIUS + this.mcl) + "px",
                    top: (xy.y - POINT_RADIUS + this.mct) + "px"
                });
                pCtx.fillStyle = 'rgba(255,255,0,0.5)';
                pCtx.beginPath();
                pCtx.arc(POINT_RADIUS, POINT_RADIUS, POINT_RADIUS, 0, 2 * Math.PI, false);
                pCtx.fill();
            }
            if (this.hit_pt_ix >= 0) {
                let xy = this.tvi2xy(this.hit_pt_ix);
                this.$selection_canvas.css({
                    left: (xy.x - POINT_RADIUS + this.mcl) + "px",
                    top: (xy.y - POINT_RADIUS + this.mct) + "px"
                });
                pCtx.fillStyle = 'rgba(255,0,0,0.5)';
                pCtx.beginPath();
                pCtx.arc(POINT_RADIUS, POINT_RADIUS, POINT_RADIUS, 0, 2 * Math.PI, false);
                pCtx.fill();
            }
        }

        /**
         * @private
         */
        drawTipCanvas() {

            let tv, fg, bg, xy;

            if (this.hit_pt_ix < 0) {
                xy = this.last_tip_xy;
                if (!xy)
                    return;
                tv = this.xy2tv(xy);
                fg = "white";
            } else {
                // Dragging, lock to the drag point
                tv = this.timeline.getPoint(this.hit_pt_ix);
                xy = this.tv2xy(tv);
                fg = "black";
                bg = "yellow";
            }

            let ts = Time.formatHMS(tv.time);
            let vs = /*this.timeline.valueAtTime(tv.time)*/ tv.value.toFixed(1);
            let text = "  " + ts + " : " + vs;

            let tipCtx = this.$tip_canvas[0].getContext("2d");
            let tw = tipCtx.measureText(text).width;
            let th = 10;

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
            if (xy.x + tw > this.mcw)
                xy.x -= tw + 2; // plus a bit to clear the cursor

            this.$tip_canvas.css({
                left: (xy.x + this.mcl) + "px",
                top: (xy.y + this.mct) + "px",
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
        drawMainCanvas() {
            this.mch = this.$main_canvas.height();
            this.mcw = this.$main_canvas.width();
            this.mcl = this.$main_canvas.offset().left;
            this.mct = this.$main_canvas.offset().top;

            if (this.mch === 0 || this.mcw === 0)
                return;

            // Rendering doesn't work unless you force the attrs
            this.$main_canvas.attr("width", this.mcw);
            this.$main_canvas.attr("height", this.mch);

            // Background
            let ctx = this.$main_canvas[0].getContext("2d");
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, this.mcw, this.mch);

            // Crosshairs
            if (typeof this.crosshairs !== "undefined") {
                ctx.beginPath();
                ctx.strokeStyle = "red";

                let vmin = this.tv2xy({
                    time: this.crosshairs.time,
                    value: this.timeline.min
                });
                ctx.moveTo(vmin.x, vmin.y);
                let vmax = this.tv2xy({
                    time: this.crosshairs.time,
                    value: this.timeline.max
                });
                ctx.lineTo(vmax.x, vmax.y);

                let hmin = this.tv2xy({
                    time: 0,
                    value: this.crosshairs.value
                });
                ctx.moveTo(hmin.x, hmin.y);
                let hmax = this.tv2xy({
                    time: this.timeline.period,
                    value: this.crosshairs.value
                });
                ctx.lineTo(hmax.x, hmax.y);

                ctx.stroke();
            }

            // Timeline
            ctx.beginPath();
            ctx.fillStyle = 'white';
            ctx.strokeStyle = "white";
            for (let i = 0; i < this.timeline.nPoints; i++) {
                let p = this.tvi2xy(i);
                i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();

            if (this.is_editing) {
                ctx.fillStyle = 'rgba(0,255,0,0.5)';
                for (let i = 0; i < this.timeline.nPoints; i++) {
                    let p = this.tvi2xy(i);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, POINT_RADIUS, 0, 2 * Math.PI, false);
                    ctx.fill();
                }
            }
        }
    }
    return TimelineEditor;
});

