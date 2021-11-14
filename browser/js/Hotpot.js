/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

/**
 * Main module for managing the browser interface to a Hotpot server.
 * @module browser/Hotpot
 */
define("browser/js/Hotpot", ["common/js/Utils", "common/js/Time"], function (Utils, Time) {

    const UPDATE_BACKOFF = 20; // seconds

    class Hotpot {

        constructor() {
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
         * Update service information cache with data from server
         */
        updateService(service, obj) {
            const tcur = Math.round(
                10 * obj.thermostat[service].temperature) / 10;
            const lkg = obj.thermostat[service].lastKnownGood;
            const ttgt = Math.round(
                10 * obj.thermostat[service].target) / 10;
            if (tcur > ttgt)
                $(`#${service}-th-diff`).html("&ge;");
            else if (tcur < ttgt)
                $(`#${service}-th-diff`).html("&lt;");
            else
                $(`#${service}-th-diff`).text("=");
            $(`#${service}-th-temp`).text(tcur);
            $(`#${service}-th-lkg`).data("lkg", lkg);
            $(`#${service}-th-target`).text(ttgt);
            let ptext = (obj.pin[service].state === 0) ? "OFF" : "ON";
            $(`#${service}-pin-state`).text(ptext);
            $(`#${service}-pin-reason`).text(obj.pin[service].reason);

            let $requests = $(`#${service}-requests`);
            $requests.empty();
            for (let req of obj.thermostat[service].requests) {
                let $div = $("<div></div>").addClass("request");
                let u = (!req.until || req.until === Utils.BOOST) ?
                    "boosted" : new Date(req.until);
                $div.append("<span>" + req.source + " is requesting " +
                    req.target + " </span>°C until " + u + " ");
                let $butt = $('<img class="image_button" src="/browser/images/unboost.svg" />');
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

            let $caldiv = $(`#${service}-calendar`);
            $caldiv.hide();
            for (let name in obj.calendar) {
                let cal = obj.calendar[name];
                if (cal.pending_update)
                    $("#cal_update_pending").show();
                let ce = cal.events[service];
                if (ce) {
                    $(`#${service}-cal-name`).text(cal);
                    $(`#${service}-cal-temperature`).text(ce.temperature);
                    $(`#${service}-cal-start`).text(new Date(ce.start));
                    $(`#${service}-cal-end`).text(ce.end === "boost" ? "boosted" : new Date(ce.end));
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
            const servertime = new Date(data.time);
            $("#systemTime").text(`${servertime.toLocaleTimeString()} ${servertime.toLocaleDateString()}`);
            this.updateService("CH", data);
            this.updateService("HW", data);
        }

        /**
         * Wake up every second and update counters
         */
        lkg() {
            $(".lkg").each(function () {
                const lkg = $(this).data("lkg");
                const deltat = Date.now() - lkg;
                // Only show counter if sample is more than 5 minutes old
                if (deltat < 5 * 60 * 1000)
                    $(this).hide();
                else
                    $(this).show().text(`(${Time.formatDelta(deltat)} ago)`);
            });
            setTimeout(() => {
                this.lkg();
            }, 1000);
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
                    this.updateState(data);
                })
                .fail((jqXHR, status, err) => {
                    this.log(`Could not contact server for update: ${status} ${err}`);
                })
                .always(() => {
                    this.poller = setTimeout(() => {
                        $(document).trigger("poll");
                    }, UPDATE_BACKOFF * 1000);
                });
        }

        configureService(service, name) {
            const self = this;

            $(`#${service}-boost`)
            .on("click", () => $(`#boost-dialog`).dialog({
                    title: `Boost ${name}`,
                    buttons: [
                        {
                            text: "Boost",
                            click: function () {
                                $(this).dialog("close");
                                self.sendRequest({
                                    service: service,
                                    until: Utils.BOOST,
                                    target: $(`#boost-target`).val()
                                });
                            }
					}
				]
                }));

            $(`#${service}-timeline`)
                .on("click", () => window.open(
                    `browser/html/timeline.html?service=${service};name=${name}`,
                    "_blank" /*`${service} timeline`*/ ,
                    "toolbar=1,menubar=1,status=1,resizable=1"));
        }

        /**
         * Add handlers and fire initial events to configure the graphs
         * and start the polling loop.
         */
        begin() {
            this.configureService("HW", "Hot Water");
            this.configureService("CH", "Central Heating");

            $("#refresh_calendars")
                .on("click", () => this.refreshCalendars());

            $("#help")
                .on("click", () => window.open(`browser/html/index-help.html`, "_blank", "toolbar=1,menubar=1,status=1,resizable=1"));

            $(document).on("poll", () => this.poll());

            this.lkg();
            this.poll();
        }
    }
    return Hotpot;
});
