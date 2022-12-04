/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

/**
 * Main module for managing the browser interface to a Hotpot server.
 * @module browser/Hotpot
 */
define("browser/js/Hotpot", [
	"common/js/Utils",
	"common/js/Time",
	"common/js/TimeValue",
	"browser/js/TimelineView"
], (Utils, Time, TimeValue, TimelineView) => {

	'use strict';

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

      const $requests = $(`#${service}-requests`);
      $requests.empty();
      for (let req of obj.thermostat[service].requests) {
        const $div = $("<div></div>").addClass("request");
        const u = (!req.until || req.until === Utils.BOOST) ?
              "boosted" : new Date(req.until);
				const tgt = req.target === Utils.OFF
					    ? "OFF" : `${req.target}°C`;
        $div.append(
					`${req.source} is requesting ` +
					`${tgt} until ` + u.toLocaleString() + " ");
        const $butt = $('<img class="image_button" src="/browser/images/request-cancel.svg" title="Cancel this request" />');
        const handle = () => {
          this.sendRequest({
            service: service,
            source: req.source,
						target: req.target === Utils.OFF
						? Utils.CLEAR : req.target,
            until: req.until === Utils.BOOST
						? Utils.CLEAR : req.until
          });
          $div.remove();
        };
        $div.append($butt);
        $butt
        .on("click", handle)
        .on("tap", handle);
        $requests.append($div);
      }

      const $caldiv = $(`#${service}-calendar`);
      $caldiv.hide();
      for (let name in obj.calendar) {
        const cal = obj.calendar[name];
        if (cal.pending_update)
          $("#cal_update_pending").show();
        const ce = cal.events[service];
        if (ce) {
          $(`#${service}-cal-name`).text(service);
          $(`#${service}-cal-temperature`).text(
						ce.temperature === Utils.OFF ? "OFF"
						: `${ce.temperature}°C`);
          $(`#${service}-cal-start`).text(
						new Date(ce.start).toLocaleString());
          $(`#${service}-cal-end`).text(
						ce.end === "boost"
						? "boosted"
						: new Date(ce.end).toLocaleString());
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

		/**
		 * @param {string} service service shortcode e.g. HW
		 * @param {string} name service name e.g. "Hot Water"
		 * @param {number} boostTo temperature to boost to
		 */
    configureService(service, name, boostTo) {
      const self = this;

      const handle_boost = () => {
				const $dlg = $(`#boost-dialog`);
				const $target = $dlg.find("[name=target]");
				$target.val(boostTo);
				$dlg.dialog({
          title: `Boost ${name}`,
          buttons: [
            {
              text: "Boost",
              click: () => {
                $dlg.dialog("close");
                self.sendRequest({
                  service: service,
                  until: Utils.BOOST,
                  target: $target.val()
                });
              }
					  }
				  ]
        });
			};
      $(`#${service}-boost`)
      .on("click", handle_boost)
      .on("tap", handle_boost);

      const handle_off = () => $(`#off-dialog`).dialog({
        title: `${name} off`,
        buttons: [
          {
            text: "Off",
            click: function () {
              $(this).dialog("close");
              self.sendRequest({
                service: service,
                until: Date.now() + Time.parse(
									$(`#off-for`).val()),
                target: Utils.OFF
              });
            }
					}
				]
      });
      $(`#${service}-off`)
      .on("click", handle_off)
      .on("tap", handle_off);

      $(`#${service}-timeline`)
      .on("click", () => this.editTimeline(service))
      .on("tap", () => this.editTimeline(service));
    }

		editTimeline(service) {
			$("#main").hide();
			$("#timeline-editor").show();
			this.timelineView = new TimelineView(
				$("#timeline-editor"),
				service);
		}

    /**
     * Add handlers and fire initial events to configure the graphs
     * and start the polling loop.
     */
    begin() {
      this.configureService("HW", "Hot Water", 50);
      this.configureService("CH", "Central Heating", 18);

      $("#refresh_calendars")
      .on("click", () => this.refreshCalendars())
      .on("tap", () => this.refreshCalendars());

      const handle_open = () => window.open(`browser/html/index-help.html`, "_blank", "toolbar=1,menubar=1,status=1,resizable=1");
      $("#help")
      .on("click", handle_open)
      .on("tap", handle_open);

      const handle_add = () => {
				const tlv = this.timelineView;
				if (!tlv)
					return;
				const $dlg = $(`#add-timepoint-dialog`);
				$dlg.dialog({
					title: `Add timepoint`,
					buttons: [
						{
							text: "Add",
							click: function () {
								$(this).dialog("close");
								const tim = $dlg.find("[name=time]").val();
								const val = $dlg.find("[name=temp]").val();
								tlv.addTimelinePoint(
									new TimeValue(tim, Number.parseFloat(val)));
							}
						}
					]
				});
			};
			$("#add-timepoint")
			.on("tap", handle_add)
			.on("click", handle_add);

      const handle_save = () => {
				const tlv = this.timelineView;
				if (!tlv)
					return;
				tlv.saveTimeline();
			};
			$("#save-timeline")
			.on("tap", handle_save)
			.on("click", handle_save);

      const handle_cancel = () => {
				const tlv = this.timelineView;
				if (!tlv)
					return;
				tlv.cancelTimeline();
			};
			$("#cancel-timeline")
			.on("click", handle_cancel)
			.on("tap", handle_cancel);

      $(document).on("poll", () => this.poll());

      this.lkg();
      this.poll();
    }
  }
  return Hotpot;
});
