/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

define([
	"js/common/Time", "js/common/DataModel", "js/common/TimeValue",
	"js/common/Timeline",
	"js/browser/TimelineCanvas", "js/browser/edit_in_place"
], (
  Time, DataModel, TimeValue,
  Timeline,
  TimelineCanvas
) => {

  // Frequency of going back to the server for state
  const UPDATE_BACKOFF = 10000; // milliseconds

  // A day in ms
  const DAY_IN_MS = 24 * 60 * 60 * 1000;

  /**
   * Management of a timeline edit.
   */
  class TimelineView {

		/**
		 * @param {jQuery} $container Container div
		 * @param {string} service service being edited
		 */
    constructor($container, service) {
			$("#save-timeline")
			.hide();

			this.$container = $container;

      /**
       * Name of the service
       * @member {string}
       */
      this.service = service;

      this.$container.find("[name=title]")
			.text(`${this.service}`);

			const $graph = this.$container.find(".graph");
			this.timelineCanvas = new TimelineCanvas($graph);

			this.otherHeight = 500;
      const handle_graph = () => {
				const h = this.otherHeight;
				this.otherHeight = $graph.height();
				$graph.css("height", h);
				this.timelineCanvas.cacheSize();
				this.timelineCanvas.redrawAll();
			};
			$graph
      .on("click", handle_graph);

			this.changed = false;

			$.getJSON(`/ajax/getconfig/thermostat/${this.service}/timeline`)
			.catch(errorThrown => {
        console.error("Could not contact server: " + errorThrown);
        throw errorThrown;
      })
			.then(tl => DataModel.remodel({
				index: this.service,
        data: tl,
        model: Timeline.Model
      }))
      .then(timel => this.setTimeline(timel));

      this.setTimeline(new Timeline({
        period: DAY_IN_MS,
        min: 0,
        max: 25
      }));

			$(document).on("poll", () => this.poll());

			// Get the last 24 hours of logs
      const ajaxParams = {
        since: Date.now() - 24 * 60 * 60
      };
      const promises = [
				$.getJSON(`/ajax/log/thermostat/${this.service}`,
						      JSON.stringify(ajaxParams), trace => {
							      this.timelineCanvas.addTrace(
								      "thermostat", false,
								      TimeValue.decodeTrace(trace));
						      })
				.catch(errorThrown => {
          console.error("Could not contact server: " + errorThrown);
        }),
				$.getJSON(`/ajax/log/pin/${this.service}`,
						      JSON.stringify(ajaxParams), trace => {
							      this.timelineCanvas.addTrace(
								      "pin", true,
								      TimeValue.decodeTrace(trace));
						      })
				.catch(errorThrown => {
          console.error("Could not contact server: " + errorThrown);
        }),
				$.getJSON(`/ajax/getconfig/thermostat/${this.service}/timeline`)
				.catch(errorThrown => {
          console.error("Could not contact server: " + errorThrown);
        })
				.then(tl => DataModel.remodel({
          index: this.service,
          data: tl,
          model: Timeline.Model
        }))
        .then(timel => this.setTimeline(timel))
			];

      Promise.all(promises)
      .then(() => $(document).trigger("poll"));
    }

		setChanged() {
			this.changed = true;
			$("#save-timeline").show();
		}

		setTimeline(tl) {
      this.$container.find("[name=table] tbody").empty();
			this.timeline = tl;
			for (let i = 0; i < tl.nPoints; i++) {
				const tp = tl.getPoint(i);
				this._decoratePoint(tp);
			}
			this.timelineCanvas.setTimeline(tl);
		}

		addTimelinePoint(tp) {
			this.timeline.insert(tp);
			this.setChanged();
			this.setTimeline(this.timeline);
		}

		removeTimelinePoint(tp) {
			this.timeline.remove(tp);
			this.setChanged();
			this.setTimeline(this.timeline);
		}

		editTime($row) {
			const tp = $row.data("point");
			const $time = $row.find(`[name="time"]`);
			$time.edit_in_place({
				text: $time.text(),
				onClose: s => {
					try {
						this.timeline.setTime(tp, Time.parse(s));
						this.setChanged();
						this.setTimeline(this.timeline);
					} catch (e) {
						alert(e);
					}
				}
			});
		}

		editTemperature($row) {
			const tp = $row.data("point");
			const $temp = $row.find(`[name="temp"]`);
			$temp.edit_in_place({
				text: tp.temp,
				onClose: s => {
          const val = Number.parseFloat(s);
          if (Number.isNaN(val))
            alert(`${s} is not a valid temperature`);
          else {
            this.timeline.setValue(tp, val);
					  this.setChanged();
					  $temp.text(tp.value);
            if (tp.value !== val)
              alert(`${val} clipped to ${tp.value}`);
					  this.timelineCanvas.redrawAll();
          }
				}
			});
		}

		_decoratePoint(tp) {
			const $row = $(`<tr></tr>`);
			$row.data("point", tp);
			const $time = $(`<td name="time">${Time.formatHMS(tp.time)}</td>`);
			const i = this.timeline.getIndexOf(tp);
			if (tp.time > 0 && i < this.timeline.nPoints - 1) {
				$time.attr("title", "Click to edit");
				$time
        .on("click", () => this.editTime($row));
			}
			$row.append($time);
			const $temp = $(`<td name="temp">${tp.value}</td>`);
			$temp.attr("title", "Click to edit");
			$temp
      .on("click", () => this.editTemperature($row));
			$row.append($temp);
			const $controls = $("<td></td>");
			if (tp.time > 0) {
				const $delete = $('<img class="image_button" src="images/wastebin.svg" />');
				$delete
        .on('click', () => this.removeTimelinePoint(tp));
				$controls.append($delete);
			}
			$row.append($controls);
			this.$container.find("[name=table] tbody").append($row);
		}

    /**
     * Send timeline to the server. On a successful save, mark the editor
     * as unchanged and disable the save button.
     * @private
     */
    saveTimeline() {
      DataModel.getSerialisable(this.timeline, Timeline.Model)
      .then(serialisable => {
        $.post(
          `/ajax/setconfig/thermostat/${this.service}/timeline`,
          JSON.stringify(serialisable))
        .done(() => {
          alert("Timeline saved");
          // Save done, not required.
          $("#save-timeline").hide();
					this.changed = false;
        })
        .fail(function (xhr) {
          alert(`Save failed ${xhr.status}: ${xhr.statusText}`);
        });
      });
    }

		cancelTimeline() {
			if (this.changed) {
				$("#close-timeline").dialog({
          title: "Close timeline",
          width: 'auto',
					buttons: [
						{
							text: "OK",
							click: function() {
								$(this).dialog( "close" );
								$("#timeline-editor").hide();
								$("#main").show();
							}
						}
					]
				});
			} else {
				$("#timeline-editor").hide();
				$("#main").show();
			}
		}

		/**
     * Wake up on schedule and refresh the graph
     * @private
     */
    poll() {
      if (this.poller) {
        clearTimeout(this.poller);
        this.poller = null;
      }
      $.getJSON("/ajax/state")
      .catch(err => {
        console.error(`Could not contact server for update: ${err}`);
        throw err;
      })
      .then(data => {
        $(".showif").hide(); // hide optional content
        this.timelineCanvas.addSample(
					'thermostat',
					new TimeValue(
						data.time, data.thermostat[this.service].temperature));
        this.timelineCanvas.addSample(
					'pin',
					new TimeValue(data.time, data.pin[this.service].state));
      })
      .always(() => {
        this.poller = setTimeout(
          () => {
            $(document).trigger("poll");
          }, UPDATE_BACKOFF);
      });
    }
  }
  return TimelineView;
});
