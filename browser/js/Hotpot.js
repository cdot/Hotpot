/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

/**
 * Main module for managing the browser interface to a hotpot server.
 */
define("browser/js/Hotpot", ["common/js/Utils", "common/js/Time", "common/js/Timeline", "common/js/DataModel", "browser/js/TimelineEditor", "browser/js/Spinner"], function(Utils, Time, Timeline, DataModel, TimelineEditor) {

	const UPDATE_BACKOFF = 10; // seconds

	class Hotpot {

		constructor() {
			this.traces = {
				pin: {},
				thermostat: {}
			};
			this.timelineEditors = {};
			this.poller = null;
		}

		log(mess) {
			let t = new Date().toLocaleString();
			$("#log").html(`<div>${t}: ${mess}</div>`);
		}

		refreshCalendars() {
			$("#refresh_calendars").attr("disabled", "disabled");
			$(".calendar").hide();
			$.get("/ajax/refresh_calendars")
			.done(() => {
				$("#refresh_calendars").removeAttr("disabled");
				this.log("Calendar refresh requested");
				$(document).trigger("poll");
			})
			.fail((jqXHR, textStatus, err) => {
				this.log("Could not contact server for calendar update: " + err);
			});
		}

		/**
		 * User clicks a request button. Send the request to the server.
		 * @return {boolean} false to terminate event handling
		 */
		sendRequest(params) {
			if (!params.source)
				params.source = "Browser";

			// Posting to the same server as hosts the html
			$.post("/ajax/request", JSON.stringify(params))
			.fail((jqXHR, textStatus, err) => {
				this.log(`Could not contact server: ${textStatus} ${err}`);
			})
			.always(() => {
				$(document).trigger("poll");
			});
			return false; // prevent repeated calls
		}

		/**
		 * Update traces cache with data from server
		 */
		updateTraces(data) {
			for (let type in this.traces) { // thermostat/pin
				for (let service in data[type]) { // HW/CH
					let o = data[type][service];
					let d = (typeof o.temperature !== "undefined") ?
						o.temperature : o.state;
					let trace = this.traces[type][service];
					if (typeof trace === "undefined")
						this.traces[type][service] = trace = [];
					if (typeof d !== "undefined") {
						trace.push({
							time: data.time,
							value: d
						});
						let te = this.timelineEditors[service];
						if (te && typeof o.temperature !== "undefined")
							te.setCrosshairs(data.time - Time.midnight(), d);
					}
				}
			}
		}

		/**
		 * Update service information cache with data from server
		 */
		updateService(service, obj) {

			let $div = $("#" + service);
			let tcur = Math.round(
				10 * obj.thermostat[service].temperature) / 10;
			let deltat = (Date.now() - obj.thermostat[service].lastKnownGood);
			let ttgt = Math.round(
				10 * obj.thermostat[service].target) / 10;
			if (tcur > ttgt)
				$div.find(".th-diff").html("&ge;");
			else if (tcur < ttgt)
				$div.find(".th-diff").html("&lt;");
			else
				$div.find(".th-diff").text("=");
			$div.find(".th-temp").text(tcur);
			if (deltat < 60)
				$div.find(".th-lkg").hide();
			else {
				$div.find(".th-lkg").show().text(Time.formatDelta(deltat));
			}
			$div.find(".th-target").text(ttgt);
			let ptext = (obj.pin[service].state === 0) ? "OFF" : "ON";
			$div.find(".pin-state").text(ptext);
			$div.find(".pin-reason").text(obj.pin[service].reason);

			let $requests = $div.find(".requests");
			$requests.empty();
			for (let req of obj.thermostat[service].requests) {
				let $div = $("<div></div>").addClass("request");
				let u = (!req.until || req.until === Utils.BOOST)
					? "boosted" : new Date(req.until);
				$div.append("<span>" + req.source + " is requesting " +
							req.target + " </span>°C until " + u + " ");
				let $butt = $("<button>Clear</button>")
				$div.append($butt);
				$butt
				.on("click", () => {
					this.sendRequest({
						service: service,
						source: req.source,
						target: req.target,
						until: Utils.CLEAR
					});
					$div.remove();
				});
				$requests.append($div);
			}

			let $caldiv = $div.find(".calendar");
			$caldiv.hide();
			for (let name in obj.calendar) {
				let cal = obj.calendar[name];
				if (cal.pending_update)
					$("#cal_update_pending").show();
				let ce = cal.events[service];
				if (ce) {
					$caldiv.find(".cal-name").text(cal);
					$caldiv.find(".cal-temperature").text(ce.temperature);
					$caldiv.find(".cal-start").text(new Date(ce.start));
					$caldiv.find(".cal-end").text(ce.end === "boost" ? "boosted" : new Date(ce.end));
					$caldiv.show();
				}
			}
		}

		/**
		 * Update the cache with state information from the server.
		 * @param {object} obj the structure containing the state (as
		 * received from /ajax/state)
		 */
		updateState(data) {
			$("#cal_update_pending").hide();
			$("#systemTime").text(new Date(data.time).toLocaleString())
			this.updateService("CH", data);
			this.updateService("HW", data);
		}

		/**
		 * Wake up on schedule and refresh the state
		 */
		poll() {
			if (this.poller) {
				clearTimeout(this.poller);
				this.poller = null;
			}
			$.getJSON("/ajax/state")
			.done(data => {
				$(".showif").hide(); // hide optional content
				this.updateTraces(data);
				this.updateState(data);
			})
			.fail((jqXHR, status, err) => {
				this.log(`Could not contact server for update: ${status} ${err}`);
			})
			.always(() => {
				this.poller = setTimeout(() => $(document).trigger("poll"), UPDATE_BACKOFF * 1000)
			});
		}

		loadTraces(data) {
			for (let type in this.traces) {
				for (let name in data[type]) {
					let trace = [];
					let tdata = data[type][name];
					let offset = tdata.shift();
					for (let i = 0; i < tdata.length; i += 2) {
						trace.push({
							time: offset + tdata[i],
							value: tdata[i + 1]
						});
					}
					this.traces[type][name] = trace;
				}
			}
		}

		renderTrace(te, trace, style1, style2, is_binary) {
			if (typeof trace === "undefined")
				return;
			let ctx = te.$main_canvas[0].getContext("2d");
			let base = is_binary ? te.timeline.max / 10 : 0;
			let binary = is_binary ? te.timeline.max / 10 : 1;

			// Draw from current time back to 0
			ctx.strokeStyle = style1;
			ctx.beginPath();
			let midnight = Time.midnight();
			let i = trace.length - 1;
			let now = trace[i].time;
			let lp;

			function nextPoint(tv, last_tv) {
				let tp = {
					time: tv.time - midnight,
					value: base + tv.value * binary
				};
				let xy = te.tv2xy(tp);
				if (!last_tv) {
					ctx.moveTo(xy.x, xy.y);
				} else {
					if (is_binary && tp.value != last_tv.value) {
						let lxy = te.tv2xy({
							time: last_tv.time,
							value: tp.value
						});
						ctx.lineTo(lxy.x, lxy.y);
					}
					ctx.lineTo(xy.x, xy.y);
				}
				return tp;
			}

			while (i >= 0 && trace[i].time > midnight) {
				lp = nextPoint(trace[i--], lp);
			}
			ctx.stroke();

			// Draw from midnight back to same time yesterday
			ctx.strokeStyle = style2;
			ctx.beginPath();
			let stop = now - 24 * 60 * 60 * 1000;
			midnight -= 24 * 60 * 60 * 1000;
			lp = undefined;
			while (i >= 0 && trace[i].time > stop) {
				lp = nextPoint(trace[i--], lp);
			}
			ctx.stroke();
		}

		renderTraces(service) {
			let te = this.timelineEditors[service];

			this.renderTrace(
				te, this.traces.thermostat[service],
				"#00AA00", "#005500", false)
			this.renderTrace(
				te, this.traces.pin[service],
				"#eea500", "#665200", true)
		}

		initialiseTimeline(service) {

			let DAY_IN_MS = 24 * 60 * 60 * 1000;
			let timeline = new Timeline({
				period: DAY_IN_MS,
				min: 0,
				max: 25
			});
			let $container = $(".tl-canvas[data-service='" + service + "']");
			let te = new TimelineEditor(timeline, $container);
			this.timelineEditors[service] = te;

			$container.on("redraw", () => this.renderTraces(service));

			let $div = $("#" + service);
			let $tp = $div.find(".tl-point");
			let $tt = $div.find(".tl-time");
			let $th = $div.find(".tl-temp");

			$tp
			.on("spin_up", () => {
				let now = Number.parseInt($(this).val());
				if (isNaN(now))
					now = -1;
				if (now < te.timeline.nPoints - 1) {
					$(this).val(++now);
					te.setSelectedPoint(now);
				}
			})
			.on("spin_down", () => {
				let now = Number.parseInt($(this).val());
				if (isNaN(now))
					now = te.timeline.nPoints;
				if (now > 0) {
					$(this).val(--now);
					te.setSelectedPoint(now);
				}
			})
			.on("change", () => {
				let now = Number.parseInt($(this).val());
				if (now >= 0 && now < te.timeline.nPoints) {
					te.setSelectedPoint(now);
				}
			});

			$tt.on("change", () => {
				try {
					let now = Time.parse($(this).val());
					te.setSelectedTime(now);
				} catch (e) {}
			});

			$th.on("change", () => {
				let now = Number.parseFloat($(this).val());
				if (isNaN(now))
					return;
				te.setSelectedValue(now);
			});

			$div.find(".tl-removepoint")
			.on("click", () => {
				te.removeSelectedPoint();
			});

			$container
			.on("selection_changed", () => {
				// Timeline editor selected point changed, update
				// other data fields
				let dp = te.getSelectedPoint();
				if (dp) {
					$tp.val(dp.index);
					$tt.val(Time.formatHMS(dp.time));
					$th.val(dp.value.toFixed(1));
				}
			}).trigger("selection_changed");
		}

		openTimeline(service) {
			let $div = $("#" + service);
			let te = this.timelineEditors[service];
			$div.find(".tl-open").hide();
			$div.find(".tl-container").show();
			$div.find(".tl-save").prop("disabled", true);
			te.onChanged = () => { $div.find(".tl-save").prop("disabled", false) };
			$.getJSON("/ajax/getconfig/thermostat/" + service + "/timeline")
			.done(tl => {
				DataModel.remodel(service, tl, Timeline.Model)
				.then(timel => {
					te.timeline = timel;
					te.$main_canvas.trigger("redraw");
				});
			})
			.fail((jqXHR, textStatus, err) => this.log(`Could not contact server: ${err}`));
		}

		closeTimeline(service) {
			let $div = $("#" + service);
			$div.find(".tl-container").hide();
			$div.find(".tl-open").show();
		};

		saveTimeline(service) {
			this.closeTimeline(service);
			let te = this.timelineEditors[service];
			console.log("Send timeline update to server");
			DataModel.getSerialisable(te.timeline, Timeline.Model)
			.then(serialisable => {
				$.post(
					"/ajax/setconfig/thermostat/" + service + "/timeline",
					JSON.stringify(serialisable))
				.done(() => {
					te.changed = false;
				})
				.always(() => {
					$(document).trigger("poll");
				});
			});
		}

		configureService(service) {
			let $div = $("#" + service);
			$div.find(".boost")
			.on("click",
				{
					service: service,
					until: Utils.BOOST
				},
				e => {
					e.data.target = $div.find(".boost-target").val();
					this.sendRequest(e.data);
				});
			$div.find(".timeline").hide();

			this.initialiseTimeline(service);

			$div.find(".tl-open")
			.on("click", () => this.openTimeline(service));
			$div.find(".tl-save")
			.on("click", () => this.saveTimeline(service));
			$div.find(".tl-cancel")
			.on("click", () => this.closeTimeline(service));
		}

		/**
		 * Add handlers and fire initial events to configure the graphs
		 * and start the polling loop.
		 */
		begin() {
			$(".spinnable").Spinner();

			this.configureService("HW");
			this.configureService("CH");

			$("#refresh_calendars")
			.on("click", () => this.refreshCalendars());

			$("#open-twisty").on("click", () => {
				$("#help-twisty").show();
				$(this).hide();
			});

			$("#close-twisty").on("click", () => {
				$("#help-twisty").hide();
				$("#open-twisty").show();
			});

			$(".switcher").on("click", () => {
				$(".display").hide();
				$("#" + $(this).data("to")).show();
			});

			$(document).on("poll", () => this.poll());

			this.poll();

			// Get the last 24 hours of logs
			let params = {
				since: Date.now() - 24 * 60 * 60
			};
			$.getJSON("/ajax/log", JSON.stringify(params), data => {
				this.loadTraces(data);
			})
			.fail((jqXHR, textStatus, errorThrown) => {
				this.log("Could not contact server for logs: " + errorThrown);
			})
			.always(() => {
				$(document).trigger("poll");
			});
		}
	}
	return Hotpot;
});
