/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

/**
 * Main module for managing the browser interface to a hotpot server.
 */
define("browser/js/Hotpot", ["common/js/Time", "common/js/Timeline", "common/js/DataModel", "browser/js/TimelineEditor", "browser/js/Spinner"], function(Time, Timeline, DataModel, TimelineEditor) {

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
            $("#log").append("<div>" + mess + "</div>");
        }
        
        refreshCalendars() {
            $("#refresh_calendars").attr("disabled", "disabled");
            $(".calendar").hide();
            let self = this;
            $.get("/ajax/refresh_calendars")
            .done(() => {
                $("#refresh_calendars").removeAttr("disabled");
                self.log("Calendar refresh requested");
                $(document).trigger("poll");
            })
            .fail(function (jqXHR, textStatus, err) {
                self.log("Could not contact server: " + err);
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
            let self = this;
            $.post("/ajax/request", JSON.stringify(params))
            .fail(function (jqXHR, textStatus, err) {
                self.log("Could not contact server: " + err);
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
            let ttgt = Math.round(
                10 * obj.thermostat[service].target) / 10;
            if (tcur > ttgt)
                $div.find(".th-diff").text(">=");
            else if (tcur < ttgt)
                $div.find(".th-diff").text("<");
            else
                $div.find(".th-diff").text("=");
            $div.find(".th-temp").text(tcur);
            $div.find(".th-target").text(ttgt);
            let ptext = (obj.pin[service].state === 0) ? "OFF" : "ON";
            $div.find(".pin-state").text(ptext);
            $div.find(".pin-reason").text(obj.pin[service].reason);

            let $requests = $div.find(".requests");
            $requests.empty();
            let self = this;
            for (let req of obj.thermostat[service].requests) {
                let $div = $("<div></div>").addClass("request");
                let u = (!req.until || req.until === "boost")
                    ? "boosted" : new Date(req.until);
                $div.append("<span>" + req.source + " is requesting " +
                    req.target + " </span>°C until " + u + " ");
                let $butt = $("<button>Clear</button>")
                $div.append($butt);
                $butt
                .on("click", () => {
                    self.sendRequest({
                        service: service,
                        source: re.source,
                        until: "now"
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
                    $caldiv.find(".cal-state").text(ce.state);
                    $caldiv.find(".cal-start").text(new Date(ce.start));
                    $caldiv.find(".cal-end").text(new Date(ce.start + ce.length));
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
            let self = this;

            if (this.poller) {
                clearTimeout(this.poller);
                this.poller = null;
            }
            $.getJSON("/ajax/state")
            .done((data) => {
                $(".showif").hide(); // hide optional content
                self.updateTraces(data);
                self.updateState(data);
            })
            .fail(function (jqXHR, status, err) {
                self.log("Could not contact server for update: " + err);
            })
            .always(() => {
                self.poller = setTimeout(function () {
                    $(document).trigger("poll");
                }, UPDATE_BACKOFF * 1000)
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

            let self = this;
            $container.on("redraw", () => { self.renderTraces(service); });

            let $div = $("#" + service);
            let $tp = $div.find(".tl-point");
            let $tt = $div.find(".tl-time");
            let $th = $div.find(".tl-temp");

            $tp
            .on("spin_up", function () {
                let now = Number.parseInt($(this).val());
                if (isNaN(now))
                    now = -1;
                if (now < te.timeline.nPoints - 1) {
                    $(this).val(++now);
                    te.setSelectedPoint(now);
                }
            })
            .on("spin_down", function () {
                let now = Number.parseInt($(this).val());
                if (isNaN(now))
                    now = te.timeline.nPoints;
                if (now > 0) {
                    $(this).val(--now);
                    te.setSelectedPoint(now);
                }
            })
            .on("change", function () {
                let now = Number.parseInt($(this).val());
                if (now >= 0 && now < te.timeline.nPoints) {
                    te.setSelectedPoint(now);
                }
            });

            $tt.on("change", function () {
                try {
                    let now = Time.parse($(this).val());
                    te.setSelectedTime(now);
                } catch (e) {}
            });

            $th.on("change", function () {
                let now = Number.parseFloat($(this).val());
                if (isNaN(now))
                    return;
                te.setSelectedValue(now);
            });

            $div.find(".tl-removepoint")
            .on("click", function () {
                te.removeSelectedPoint();
            });

            $container
            .on("selection_changed", function () {
                // Timeline editor selected point changed, update
                // other data fields
                let dp = te.getSelectedPoint();
                if (dp) {
                    $tp.val(dp.index);
                    $tt.val(Time.unparse(dp.time));
                    $th.val(dp.value.toFixed(1));
                }
            }).trigger("selection_changed");
        }

        openTimeline(service) {
            let $div = $("#" + service);
            let te = this.timelineEditors[service];
            $div.find(".tl-open").hide();
            $div.find(".tl-container").show();
            let self = this;
            $.getJSON("/ajax/getconfig/thermostat/" + service + "/timeline")
            .done((tl) => {
                te.timeline = DataModel.remodel(service, tl, Timeline.Model);
                te.changed = false;
                te.$main_canvas.trigger("redraw");
            })
            .fail(function (jqXHR, textStatus, err) {
                self.log("Could not contact server: " + err);
            });
        }

        closeTimeline(service) {
            let $div = $("#" + service);
            $div.find(".tl-container").hide();
            $div.find(".tl-open").show();
        };

        saveTimeline(service) {
            closeTimeline(service);
            let te = this.timelineEditors[service];
            if (te.changed) {
                console.log("Send timeline update to server");
                te.getSerialisable()
                .then((serialisable) => {
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
        }

        configureService(service) {
            let $div = $("#" + service);
            $div.find(".boost")
            .on("click",
                {
                    service: service,
                    until: "boost"
                },
                function (e) {
                    e.data.target =
                    $div.find(".boost-target").val();
                    self.sendRequest(e.data);
                });
            $div.find(".timeline").hide();

            this.initialiseTimeline(service);

            let self = this;
            $div.find(".tl-open")
            .on("click", () => { self.openTimeline(service); });
            $div.find(".tl-save")
            .on("click", () => { self.saveTimeline(service); });
            $div.find(".tl-cancel")
            .on("click", () => { self.closeTimeline(service); });
        }

        /**
         * Add handlers and fire initial events to configure the graphs
         * and start the polling loop.
         */
        begin() {
            $(".spinnable").Spinner();
        
            this.configureService("HW");
            this.configureService("CH");

            let self = this;
            $("#refresh_calendars")
            .on("click", () => { self.refreshCalendars(); });

            $("#open-twisty").on("click", function () {
                $("#help-twisty").show();
                $(this).hide();
            });

            $("#close-twisty").on("click", function () {
                $("#help-twisty").hide();
                $("#open-twisty").show();
            });

            $(".switcher").on("click", function () {
                $(".display").hide();
                $("#" + $(this).data("to")).show();
            });

            $(document).on("poll", () => { self.poll(); });

            self.poll();

            // Get the last 24 hours of logs
            let params = {
                since: Date.now() - 24 * 60 * 60
            };
            $.getJSON("/ajax/log", JSON.stringify(params), function(data) {
                self.loadTraces(data);
            })
            .fail(function (jqXHR, textStatus, errorThrown) {
                self.log("Could not contact server for logs: " + errorThrown);
            })
            .always(() => {
                $(document).trigger("poll");
            });
        }
    }
    return Hotpot;
});
