/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

define("browser/js/TimelineView", ["common/js/Time", "common/js/DataModel", "common/js/Timeline", "browser/js/TimelineEditor", "browser/js/Spinner"], function(Time, DataModel, Timeline, TimelineEditor) {

	// Frequency of going back to the server for state
	const UPDATE_BACKOFF = 10000; // milliseconds

	// A day in ms
	const DAY_IN_MS = 24 * 60 * 60 * 1000;

	/**
	 * Management of a timeline view page. This is a standalone brower
	 * app that communicates via AJAX with a Hotpot server.
	 */
	class TimelineView {

		constructor(params) {
			/**
			 * Name of the service
			 * @member {string}
			 */
			this.service = params.service;

			$("#title").text(`${params.name} timeline`);
			$(".spinnable").Spinner();

			/**
			 * Traces on this view.
			 * @member
			 */
			this.traces = {
				thermostat: [],
				pin: []
			};

			const timeline = new Timeline({
				period: DAY_IN_MS,
				min: 0,
				max: 25
			});
			const $container = $("#canvas");

			const editor = new TimelineEditor(timeline, $container);
			/**
			 * @member
			 */
			this.editor = editor;
			
			$container.on("redraw", () => this.renderTraces());

			const $point = $("#point");
			const $time = $("#time");
			const $temperature = $("#temp");

			$point
			.on("spin_up", function() {
				if (editor.timeline.nPoints === 0)
					return;
				let now = Number.parseInt($(this).val());
				if (isNaN(now) || now === editor.timeline.nPoints - 1)
					now = -1;
				$(this).val(++now);
				editor.setSelectedPoint(now);
			})
			.on("spin_down", function() {
				if (editor.timeline.nPoints === 0)
					return;
				let now = Number.parseInt($(this).val());
				if (isNaN(now) || now === 0)
					now = editor.timeline.nPoints;
				$(this).val(--now);
				editor.setSelectedPoint(now);
			})
			.on("change", function() {
				let now = Number.parseInt($(this).val());
				if (now >= 0 && now < editor.timeline.nPoints) {
					editor.setSelectedPoint(now);
				}
			});

			$time.on("change", () => {
				try {
					const now = Time.parse($(this).val());
					editor.setSelectedTime(now);
				} catch (e) {}
			});

			$temperature.on("change", () => {
				const now = Number.parseFloat($(this).val());
				if (isNaN(now))
					return;
				editor.setSelectedValue(now);
			});

			$("#removepoint")
			.on("click", () => {
				editor.removeSelectedPoint();
			});

			$container
			.on("selection_changed", () => {
				// Timeline editor selected point changed, update
				// other data fields
				const dp = editor.getSelectedPoint();
				if (dp) {
					$point.val(dp.index);
					$time.val(Time.formatHMS(60000 * Math.round(dp.time / 60000)));
					$temperature.val(dp.value.toFixed(1));
				}
			}).trigger("selection_changed");

			$("#save")
			.on("click", () => this.saveTimeline(this.service));

			console.log(`Starting timeline for ${this.service}`);
			const te = this.editor;

			te.onChanged = () => {
				$("#save").removeClass("disabled");
			};

			$(document).on("poll", () => this.poll());

			// Get the last 24 hours of logs
			const ajaxParams = {
				since: Date.now() - 24 * 60 * 60
			};
			const promises = [
				$.getJSON(`/ajax/log/thermostat/${this.service}`,
						  JSON.stringify(ajaxParams), data => {
							  this.traces.thermostat = this.loadTrace(data);
						  })
				.fail((jqXHR, textStatus, errorThrown) => {
					console.log("Could not contact server: " + errorThrown);
				}),
				$.getJSON(`/ajax/log/pin/${this.service}`,
						  JSON.stringify(ajaxParams), data => {
							  this.traces.pin = this.loadTrace(data);
						  })
				.fail((jqXHR, textStatus, errorThrown) => {
					console.log("Could not contact server: " + errorThrown);
				}),
				$.getJSON(`/ajax/getconfig/thermostat/${this.service}/timeline`)
				.fail((jqXHR, textStatus, errorThrown) => {
					console.log("Could not contact server: " + errorThrown);
				})
				.done(tl => {
					DataModel.remodel(this.service, tl, Timeline.Model)
					.then(timel => {
						te.timeline = timel;
						te.$main_canvas.trigger("redraw");
					});
				})
			];

			Promise.all(promises)
			.then(() => {
				$(document).trigger("poll");
			});
		}

		/**
		 * @private
		 */
		renderTrace(trace, style1, style2, is_binary) {
			if (typeof trace === "undefined" || trace.length < 1)
				return;
			const ctx = this.editor.$main_canvas[0].getContext("2d");
			const base = is_binary ? this.editor.timeline.max / 10 : 0;
			const binary = is_binary ? this.editor.timeline.max / 10 : 1;

			// Draw from current time back to 0
			ctx.strokeStyle = style1;
			ctx.beginPath();
			let midnight = Time.midnight();
			let i = trace.length - 1;
			const now = trace[i].time;
			const te = this.editor;
			let lp;

			function nextPoint(tv, last_tv) {
				const tp = {
					time: tv.time - midnight,
					value: base + tv.value * binary
				};
				const xy = te.tv2xy(tp);
				if (!last_tv) {
					ctx.moveTo(xy.x, xy.y);
				} else {
					if (is_binary && tp.value != last_tv.value) {
						const lxy = te.tv2xy({
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
			const stop = now - 24 * 60 * 60 * 1000;
			midnight -= 24 * 60 * 60 * 1000;
			lp = undefined;
			while (i >= 0 && trace[i].time > stop) {
				lp = nextPoint(trace[i--], lp);
			}
			ctx.stroke();
		}

		/**
		 * @private
		 */
		renderTraces() {
			this.renderTrace(this.traces.thermostat,
				"#00AA00", "#005500", false);
			this.renderTrace(this.traces.pin,
				"#eea500", "#665200", true);
		}

		/**
		 * @private
		 */
		loadTrace(data) {
			const trace = [];
			const offset = data.shift();
			for (let i = 0; i < data.length; i += 2) {
				trace.push({
					time: offset + data[i],
					value: data[i + 1]
				});
			}
			return trace;
		}

		/**
		 * Update traces cache with data from server
		 */
		updateTraces(data) {
			const cutoff = Date.now() - 24 * 60 * 60 * 1000;
			for (let type in this.traces) { // thermostat/pin
				const trace = this.traces[type];
				if (typeof trace === "undefined")
					continue;
				// Discard samples > 24h old
				while (trace.length > 0 && trace[0].time < cutoff)
					trace.shift();
				const o = data[type][this.service];
				if (typeof o === "undefined")
					continue;
				const d = (typeof o.temperature !== "undefined") ?
					o.temperature : o.state;
				if (typeof d === "undefined")
					continue;
				trace.push({
					time: data.time,
					value: d
				});
				if (typeof o.temperature !== "undefined")
					this.editor.setCrosshairs(data.time - Time.midnight(), d);
			}
		}
		
		/**
		 * Wake up on schedule and refresh the state
		 * @private
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
			})
			.fail((jqXHR, status, err) => {
				console.log(`Could not contact server for update: ${status} ${err}`);
			})
			.always(() => {
				this.poller = setTimeout(
					() => {
						$(document).trigger("poll");
					}, UPDATE_BACKOFF);
			});
		}

		/**
		 * Send timeline to the server. On a successful save, mark the editor
		 * as unchanged and disable the save button.
		 * @private
		 */
		saveTimeline(service) {
			console.log("Send timeline update to server");
			DataModel.getSerialisable(this.editor.timeline, Timeline.Model)
			.then(serialisable => {
				$.post(
					"/ajax/setconfig/thermostat/" + service + "/timeline",
					JSON.stringify(serialisable))
				.done(() => {
					alert("Timeline saved");
					this.editor.changed = false;
					// Save done, not required.
					$("#save").addClass("disabled");
				})
				.fail(function(xhr, status, error) {
					alert(`Save failed ${xhr.status}: ${xhr.statusText}`);
				})
				.always(() => {
					$(document).trigger("poll");
				});
			});
		}
	}
	return TimelineView;
});
