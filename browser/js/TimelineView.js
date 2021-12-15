/*@preserve Copyright (C) 2017-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env browser */

define("browser/js/TimelineView", [
	"common/js/Time",
	"common/js/DataModel",
	"common/js/Timeline",
	"browser/js/TimelineCanvas",
	"browser/js/edit_in_place",
	"jquery-touch-events"
], (Time, DataModel, Timeline, TimelineCanvas) => {

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

			const $graph = this.$container.find("[name=graph]");
			this.$canvas = new TimelineCanvas($graph);

			this.changed = false;

			$.getJSON(`/ajax/getconfig/thermostat/${this.service}/timeline`)
			.fail((jqXHR, textStatus, errorThrown) => {
                console.log("Could not contact server: " + errorThrown);
            })
			.done(tl => DataModel.remodel(
				this.service, tl, Timeline.Model)
                  .then(timel => this.setTimeline(timel)));

            this.setTimeline(new Timeline({
                period: DAY_IN_MS,
                min: 0,
                max: 25
            }));
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
			this.$canvas.setTimeline(tl);
		}

		addPoint(tp) {
			this.timeline.insert(tp);
			this.setChanged();
			this.setTimeline(this.timeline);
		}

		removePoint(tp) {
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
					this.timeline.setValue(tp, Number.parseFloat(s));
					this.setChanged();
					$temp.text(tp.value);
					this.$canvas.refreshAll();
				}
			});
		}

		_decoratePoint(tp) {
            const ev = $.isTouchCapable && $.isTouchCapable() ?
				  "doubletap" : "dblclick";
			const $row = $(`<tr></tr>`);
			$row.data("point", tp);
			const $time = $(`<td name="time">${Time.formatHMS(tp.time)}</td>`);
			const i = this.timeline.getIndexOf(tp);
			if (tp.time > 0 && i < this.timeline.nPoints - 1) {
				$time.attr("title", "Double-click to edit");
				$time.on(ev, () => this.editTime($row));
			}
			$row.append($time);
			const $temp = $(`<td name="temp">${tp.value}</td>`);
			$temp.attr("title", "Double-click to edit");
			$temp.on(ev, () => this.editTemperature($row));
			$row.append($temp);
			const $controls = $("<td></td>");
			if (tp.time > 0) {
				const $delete = $('<img class="image_button" src="/browser/images/wastebin.svg" />');
				$delete.on('click', () => this.removePoint(tp));
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
            console.log("Send timeline update to server");
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
    }
    return TimelineView;
});
