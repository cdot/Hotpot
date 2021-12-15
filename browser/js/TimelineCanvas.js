/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

define("browser/js/TimelineCanvas", ["common/js/Utils", "common/js/Vec", "common/js/Time", "jquery"], function (Utils, Vec, Time) {

    const POINT_RADIUS = 10; // px

    /**
     * @typedef {object} TimelineCanvas.Point
     * @property {number} x x coordinate
     * @property {number} y y coordinate
     */

    /**
     * Canvas that supports the display of a {@link Timeline}.
     * Construct over a div, which will be the container for the canvas.
     */
    class TimelineCanvas {

        /**
         * @param {jQuery} $container container object (a canvas)
         */
        constructor($container) {
            /**
			 * The timeline being displayed
			 * @member {Timeline}
			 */
            this.timeline = undefined;

            /**
			 * Current cursor location, in canvas space.
			 * undefined if the cursor is no over the canvas.
			 * @member {TimelineCanvas.Point}
			 */
            this.cursor_pos = undefined;

            /** @member {jQuery} */
            this.$container = $container;

            /**
			 * The Canvas object used for drawing the timeline
			 * @member {jQuery}
			 */
            this.$main_canvas = $("<canvas></canvas>")
			.addClass("timeline_canvas")
            .hover(
                () => $(".overlay").show(),
				() => $(".overlay").hide())
            .on("mousemove", e => this.handleMouseMove(e))
            .on("redraw", () => this.drawTimeline());
            $container.append(this.$main_canvas);

            /**
			 * The overlay canvas used for crosshairs
			 * @member {jQuery}
			 */
            this.$crosshair_canvas = $("<canvas></canvas>")
            .addClass('overlay')
            .css("z-index", 5)
            .on("redraw", () => this.drawCrosshairs());
            $container.append(this.$crosshair_canvas);

            /**
			 * The small floating overlay canvas used for draing tips
			 * @member {jQuery}
			 */
            this.$tip_canvas = $("<canvas></canvas>")
            .addClass('overlay')
            .css("z-index", 10)
            .on("redraw", () => this.drawTooltip());
            $container.append(this.$tip_canvas);

			// Tooltip overlay will be shown as required
            $('.overlay').hide();

            let resizeTimer;
            // Debounce resizing
            $(window) /*this.$main_canvas*/ .on('resize', () => {
                if (resizeTimer)
                    clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
					resizeTimer = undefined;
					this.cacheSize();
					this.refreshAll();
				}, 100);
            });

			this.cacheSize();
            this.refreshAll();
        }

		cacheSize() {
            this.mch = this.$main_canvas.height();
            this.mcw = this.$main_canvas.width();
            this.mcl = this.$main_canvas.offset().left;
            this.mct = this.$main_canvas.offset().top;

            // Rendering doesn't work unless you force the attrs
            this.$main_canvas.attr("width", this.mcw);
            this.$main_canvas.attr("height", this.mch);
            this.$crosshair_canvas.attr("width", this.mcw);
            this.$crosshair_canvas.attr("height", this.mch);
		}

		/**
		 * Set the timeline to be displayed, and redraw.
         * @param {Timeline} timeline a Timeline object
		 */
		setTimeline(tl) {
			this.timeline = tl;
			this.refreshAll();
		}

        /** @private */
        refreshAll() {
            this.$main_canvas.trigger("redraw");
            this.$tip_canvas.trigger("redraw");
            this.$crosshair_canvas.trigger("redraw");
        }

        /** @private */
        handleMouseMove(e) {
            let xy = this.e2xy(e);
            let tv = this.xy2tv(xy);
            this.cursor_pos = xy;
            this.$tip_canvas.trigger("redraw");
            this.$crosshair_canvas.trigger("redraw");
        }

        /** @private */
        tvi2xy(i) {
            return this.tv2xy(this.timeline.getPoint(i));
        }

        /**
         * Map a touch event to an XY point
         * @param {Event} e the event
         * @return {{x: number, y: number}} the XY point
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
         * @param {Event} e the event
         * @return {{x: number, y: number}} the XY point
         * @private
         */
        mouse2xy(e) {
            return {
                x: e.pageX - this.mcl,
                y: e.pageY - this.mct
            };
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

        /**
         * Convert a canvas point to timeline space (integer ms)
         * @private
         */
        xy2tv(p) {
            return {
                time: Math.trunc(this.timeline.period * p.x / this.mcw),
                value: this.timeline.min +
                    (this.timeline.max - this.timeline.min) *
                    (this.mch - p.y) / this.mch
            };
        }

        /**
		 * Draw the tip overlay canvas
         * @private
         */
        drawTooltip() {
			const xy = this.cursor_pos;
            if (!xy)
                return;
            const tv = this.xy2tv(xy);

			if (!this.timeline)
				return;

            const fg = "white";
            const ts = Time.formatHMS(tv.time);
            const vs = tv.value.toFixed(1);
            const text = `  ${ts} : ${vs}`;

            const tipCtx = this.$tip_canvas[0].getContext("2d");
            const tw = tipCtx.measureText(text).width;
            const th = 10;

            // CSS just stretches the content
            tipCtx.canvas.width = tw;
            tipCtx.canvas.height = th;

            tipCtx.fillStyle = fg;
            tipCtx.font = `${th}px sans-serif`;

            // Move the tip to the left if too near right edge
            if (xy.x + tw > this.mcw)
                xy.x -= tw + 2; // plus a bit to clear the cursor

            this.$tip_canvas.css({
                left: `${(xy.x + this.mcl)}px`,
                top: `${(xy.y + this.mct)}px`,
                width: tw,
                height: th
            });
            tipCtx.textBaseline = "top";
            if (text.indexOf("NaN") >= 0)
                debugger;
            tipCtx.fillText(text, 0, 0);
        };

		drawCrosshairs() {
			const xy = this.cursor_pos;
            if (!xy || !this.timeline)
                return;
            this.$crosshair_canvas.css({
                left: this.mcl,
                top: this.mct,
                width: this.mcw,
                height: this.mch
            });
            const tv = this.xy2tv(xy);

			const ctx = this.$crosshair_canvas[0].getContext("2d");
            ctx.clearRect(0, 0, this.mcw, this.mch);

			ctx.beginPath();
            ctx.strokeStyle = "red";

            const vmin = this.tv2xy({
                time: tv.time,
                value: this.timeline.min
            });
            ctx.moveTo(vmin.x, vmin.y);
            const vmax = this.tv2xy({
                time: tv.time,
                value: this.timeline.max
            });
            ctx.lineTo(vmax.x, vmax.y);

            const hmin = this.tv2xy({
                time: 0,
                value: tv.value
            });
            ctx.moveTo(hmin.x, hmin.y);
            const hmax = this.tv2xy({
                time: this.timeline.period,
                value: tv.value
            });
            ctx.lineTo(hmax.x, hmax.y);
			
            ctx.stroke();
		}
		
        /**
		 * Draw the timeline display canvas
         * @private
         */
        drawTimeline() {
            if (this.mch === 0 || this.mcw === 0)
                return;

            const ctx = this.$main_canvas[0].getContext("2d");
            ctx.clearRect(0, 0, this.mcw, this.mch);

			if (!this.timeline)
				return;

			// Draw a green bar every hour
			ctx.beginPath();
            ctx.strokeStyle = "green";
            const p = this.tv2xy({
                time: Time.parse("01:00"),
                value: this.timeline.min
            });
			const dt = p.x;
            const bot = this.tv2xy({
                time: 0,
                value: this.timeline.max
            });
			for (let t = dt; t < this.mcw; t += dt) {
				ctx.moveTo(t, p.y);
				ctx.lineTo(t, bot.y);
			}
            ctx.stroke();

            // Timeline
            ctx.beginPath();
            ctx.fillStyle = 'white';
            ctx.strokeStyle = "white";
			let iv;
            for (let i = 0; i < this.timeline.nPoints; i++) {
                const p = this.tvi2xy(i);
                if (i === 0) {
					iv = p.y;
					ctx.moveTo(p.x, p.y);
				} else
					ctx.lineTo(p.x, p.y);
            }
            ctx.lineTo(this.mcw, iv);

            ctx.stroke();

            if (this.is_editing) {
                ctx.fillStyle = 'rgba(0,255,0,0.5)';
                for (let i = 0; i < this.timeline.nPoints; i++) {
                    const p = this.tvi2xy(i);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, POINT_RADIUS, 0, 2 * Math.PI, false);
                    ctx.fill();
                }
            }
        }
    }
    return TimelineCanvas;
});
