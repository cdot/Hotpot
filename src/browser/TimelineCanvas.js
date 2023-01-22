/*@preserve Copyright (C) 2017-2022 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

import { Time } from "../common/Time.js";
import "jquery/dist/jquery.js";

const TIP_HEIGHT = 10; // px
const ONE_DAY = 24 * 60 * 60 * 1000; // one day in ms

const COLOURS = {
	pin: { past: "red", future: "#990000" },
	thermostat: { past: "#00AA00", future: "#009900" }
};

/**
 * @typedef {object} TimelineCanvas.Point
 * @property {number} x x coordinate
 * @property {number} y y coordinate
 */

/**
 * @typedef {object} TimelineCanvas.Trace
 * @property {string} name "pin" or "thermostat"
 * @property {boolean} is_binary true if the trace only have 0|1 values
 * @property {Timeline.TimeValue[]} points points on the timeline
 * @property {jQuery} $canvas canvas specific to this trace
 */

/**
 * Canvas that supports the display of a {@link Timeline} and one or
 * more log traces. A crosshair cursor displays time and temperature
 * of the timeline.
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
		 * Traces to be displayed
		 * @member
		 */
		this.traces = [];

    /**
		 * Current cursor location, in canvas space.
		 * undefined if the cursor is no over the canvas.
		 * @member {TimelineCanvas.Point}
		 */
    this.cursor_pos = undefined;

    const handleMouseMove = e => {
      this.cursor_pos = this.mouse2xy(e);
      this.$tip_canvas.trigger("redraw");
      this.$crosshair_canvas.trigger("redraw");
    };

    /** @member {jQuery} */
    this.$container = $container;
		$container
		.empty()
    .hover(
      () => $(".hover").show(),
			() => $(".hover").hide())
    .on("mousemove", e => handleMouseMove(e));

    /**
		 * The Canvas object used for drawing the timeline
		 * @member {jQuery}
		 */
    this.$main_canvas = $("<canvas></canvas>")
		.addClass("main_canvas overlay")
		.css("z-index", 2)
    .on("redraw", () => this.drawTimeline());
    $container.append(this.$main_canvas);

    /**
		 * The overlay canvas used for crosshairs
		 * @member {jQuery}
		 */
    this.$crosshair_canvas = $("<canvas></canvas>")
    .addClass('crosshair_canvas overlay hover')
    .css("z-index", 4)
    .on("redraw", () => this.drawCrosshairs());
    $container.append(this.$crosshair_canvas);

    /**
		 * The small floating overlay canvas used for drawing tips
		 * @member {jQuery}
		 */
    this.$tip_canvas = $("<canvas></canvas>")
    .addClass('tip_canvas overlay hover')
    .css("z-index", 5)
    .on("redraw", () => this.drawTooltip());
    $container.append(this.$tip_canvas);

		// hover overlays will be shown as required
    $('.hover').hide();

    let resizeTimer;
    // Debounce window resizing
    $(window).on('resize', () => {
      if (resizeTimer)
        clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
				resizeTimer = undefined;
				this.cacheSize();
				this.redrawAll();
			}, 100);
    });

		this.cacheSize();
  }

	/**
	 * Resize all contained canvases to the parent size
	 */
	cacheSize() {
    this.mch = this.$container.height();
    this.mcw = this.$container.width();
    this.$container.find("canvas").each((i, el) => {
			$(el)
			.prop("width", this.mcw)
			.prop("height", this.mch);
		});
	}

	/**
	 * Set the timeline to be displayed, and redraw.
   * @param {Timeline} timeline a Timeline object
	 */
	setTimeline(tl) {
		this.timeline = tl;
		this.redrawAll();
	}

  /** @private */
  redrawAll() {
    this.$container
		.find("canvas")
		.trigger("redraw");
  }

  /**
   * Map a mouse event to an XY point
   * @param {Event} e the event
   * @return {TimelineCanvas.Point} the XY point
   * @private
   */
  mouse2xy(e) {
    return {
      x: e.pageX - this.$container.offset().left,
      y: e.pageY - this.$container.offset().top
    };
  }

  /**
	 * Map a time-value to an x-y in canvas coords
	 * @param {Timeline.TimeValue} p time-value point
	 * @return {TimelineCanvas.Point} point in canvas coords
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
   * Convert a canvas point to timeline space
	 * @param {TimelineCanvas.Point} p canvas point
	 * @return {Timeline.TimeValue} time-value point
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
    if (!this.cursor_pos)
      return;
		const xy = {
			x: this.cursor_pos.x,
			y: this.cursor_pos.y
		};
    const tv = this.xy2tv(xy);

		if (!this.timeline)
			return;

    const ts = Time.formatHMS(tv.time);
    const vs = tv.value.toFixed(1);
    const text = `${ts} : ${vs}`;

    const tipCtx = this.$tip_canvas[0].getContext("2d");
    tipCtx.font = `${TIP_HEIGHT}px sans-serif`;
    const tw = tipCtx.measureText(text).width;
    // CSS just stretches the content
    tipCtx.canvas.width = tw;
    tipCtx.canvas.height = TIP_HEIGHT;
    tipCtx.fillStyle = 'white';

    // Move the tip to the left if too near right edge
		xy.x += 1;
    if (xy.x + tw > this.mcw)
      xy.x -= tw + 3;

		// Or too near the bottom
		xy.y += 3;
		if (xy.y + TIP_HEIGHT > this.mch)
			xy.y -= TIP_HEIGHT + 3;

    this.$tip_canvas.css({
      left: `${xy.x}px`,
      top: `${xy.y}px`,
      width: tw,
      height: TIP_HEIGHT
    });
    tipCtx.textBaseline = "top";
    if (text.indexOf("NaN") >= 0)
      debugger;
    tipCtx.fillText(text, 0, 0);
  };

	/**
	 * Draw the crosshair canvas
   * @private
	 */
	drawCrosshairs() {
		const xy = this.cursor_pos;
    if (!xy || !this.timeline)
      return;
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
      const p = this.tv2xy(this.timeline.getPoint(i));
      if (i === 0) {
				iv = p.y;
				ctx.moveTo(p.x, p.y);
			} else
				ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(this.mcw, iv);

    ctx.stroke();
  }

	/**
	 * Add a trace
	 * @param {string} name either "pin" or "thermostat"
	 * @param {boolean} is_binary if this is a simple on/off trace
	 * @param {Timeline.TimeValue[]} data sample trace
	 */
	addTrace(name, is_binary, data) {
		const trace = {
			name: name,
			is_binary: is_binary,
			points: data,
			$canvas: $("<canvas></canvas>")
			.addClass(`${name}_canvas overlay`)
			.css("z-index", 3)
			.on("redraw", () => this.drawTrace(name))
		};
    this.$container.append(trace.$canvas);
		this.traces[name] = trace;
		this.cacheSize();
		trace.$canvas.trigger("redraw");
	}

	/**
	 * Draw the named trace
	 * @param {string} trane name, "thermostat" or "pin"
   * @private
   */
  drawTrace(name) {
		const trace = this.traces[name];
    if (!trace || trace.points.length < 1)
      return;
		const points = trace.points;
    const ctx = trace.$canvas[0].getContext("2d");
    ctx.clearRect(0, 0, this.mcw, this.mch);

    const base = trace.is_binary ? this.timeline.max / 10 : 0;
    const binary = trace.is_binary ? this.timeline.max / 10 : 1;

    // Draw from current time back to 0
    ctx.strokeStyle = COLOURS[name].future;
    ctx.beginPath();
    let midnight = Time.midnight();
    let i = points.length - 1;
    const now = points[i].time;
    let lp;

    const nextPoint = (tv, last_tv) => {
      const tp = {
        time: tv.time - midnight,
        value: base + tv.value * binary
      };
      const xy = this.tv2xy(tp);
      if (!last_tv) {
        ctx.moveTo(xy.x, xy.y);
      } else {
        if (trace.is_binary && tp.value != last_tv.value) {
          const lxy = this.tv2xy({
            time: last_tv.time,
            value: tp.value
          });
          ctx.lineTo(lxy.x, lxy.y);
        }
        ctx.lineTo(xy.x, xy.y);
      }
      return tp;
    };

    while (i >= 0 && points[i].time > midnight) {
      lp = nextPoint(points[i--], lp);
    }
    ctx.stroke();

    // Draw from midnight back to same time yesterday
    ctx.strokeStyle = COLOURS[name].past;
    ctx.beginPath();
    const stop = now - ONE_DAY;
    midnight -= ONE_DAY;
    lp = undefined;
    while (i >= 0 && points[i].time > stop) {
      lp = nextPoint(points[i--], lp);
    }
    ctx.stroke();
  }

	/**
	 * Update a trace with a new sample
	 * @param {string} name trace name, either "pin" or "thermostat"
	 * @param {Timeline.TimeValue} tv sample to add
	 */
	addSample(name, tv) {
		// Cut off trace 24h before current time
    const cutoff = Date.now() - ONE_DAY;
    // Discard samples > 24h old
		const points = this.traces[name].points;
    points.push(tv);
		// Trim out of range points
    while (points.length > 0 && points[0].time < cutoff)
      points.shift();
		//this.drawTrace(name);
		// debug some day why the timeline is lost if we redraw too early
		this.redrawAll();
	}
}

export { TimelineCanvas }
