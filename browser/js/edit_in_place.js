/*@preserve Copyright (C) 2015-2016 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Simple in-place editing widget. If the editable thingy has class textarea,
 * will use a textarea. Options may be passed in the call or set in
 * data-editable (which takes precedence).
 * Options:
 *    width, height: these come by default from the element being edited.
 *    changed: callback for when the edit finishes. Default is to call
 *             .text() on the thing being edited. 'this' is set to the
 *             jQuery element being edited.
 *    area: if true, use a textarea instead of an input.
 * data-editable is parsed as the internals of a JS structure i.e. it is
 * encased in {} and evalled.
 */
(function($) {
    "use strict";
    $.fn.edit_in_place = function(options) {

        let $elf = $(this);
        options = $.extend({
            height: $elf.height(),
            width: $elf.width(),
            changed: function(text) {
                $elf.text(text);
            },
            area: false
        }, options);

        let data = $elf.data("editable");
        if (typeof data === "string") {
            try {
                eval("data={" + data + "}");
            } catch (e) {
                throw new Utils.exception(
                    TAG, "Unparseable data-editable: ", data, ": ", e.message);
            }
            for (let o in options)
                if (typeof data[o] !== "undefined")
                    options[o] = data[o];
        }

        let $editor;

        let destroy = function() {
            $editor.remove();
            $elf.show();
        };

        if (options.area) {
            let $tick, $cross, $controls, $ta;
            let h = Math.max($elf.outerHeight(), options.height);
            let w = Math.max($elf.outerWidth(), options.width);

            $editor = $("<div></div>")
                .css("height", h + "px")
                .css("width", w + "px")
                .height(h)
                .width(w);
            let $error = $("<div></div>")
                .css("color", "white")
                .css("background-color", "red")
                .css("font-weight", "bold");

            $tick = $("<div>&#9745;</div>")
                .addClass("editable_button")
                .on("click", function() {
                    let fn = $ta.val();
                    if (fn !== $elf.text()) {
                        try {
                            // Does it compile?
                            let ok;
                            eval("ok=" + fn);
                            destroy();
                            options.changed.call($elf, fn);
                        } catch (e) {
                            $error.text("Error: " + e.message);
                        }
                    } else {
                        destroy();
                        if (options.cancel)
                            options.cancel.call($elf);
                    }
                });
            $cross = $("<div>&#9746;</div>")
                .addClass("editable_button")
                .css("float", "right")
                .on("click", function() {
                    if (options.cancel)
                        options.cancel.call($elf);
                    destroy();
                });

            $controls = $("<div></div>")
                .append($tick)
                .append($cross);
            $controls.find(".editable_button")
                .css("display", "inline")
                .hover(
                    function() {
                        $(this)
                            .css("background-color", "yellow")
                            .css("color", "black");
                    },
                    function() {
                        $(this)
                            .css("background-color", "")
                            .css("color", "");
                    });
            $editor.append($controls);
            $ta = $("<textarea></textarea>")
                .css("height", h)
                .css("width", options.width);
            $ta.val($elf.text());
            $editor.append($ta);

            $editor.append($error);
        } else {
            $editor = $("<input/>")
                .on("keydown", function(e) {
                    // Escape means cancel, Enter means commit
                    if (e.keyCode === 27
                        || (e.keyCode === 13
                            && $editor.val() === $elf.text())) {
                        if (options.cancel)
                            options.cancel.call($elf);
                        destroy();
                        return false;
                    } else
                        return true;
                })
                .on("change", function() {
                    let val = $editor.val();
                    destroy();
                    if (val !== $elf.text()) {
                        options.changed.call($elf, val);
                    } else if (options.cancel) {
                        options.cancel.call($elf);
                    }
                });
            $editor.val($elf.text());
         }

        $elf.hide();

        $editor
            .insertBefore($elf)
            .addClass("in_place_editor")
            .css("height", options.height)
            .css("width", options.width)

            .on("mouseup", function(e) {
                // Override the parent click handler
                e.stopPropagation();
            })

            .on("mousedown", function(e) {
                // Override the parent click handler
                e.stopPropagation();
            })

            .blur(destroy)
            .select();
    };
})(jQuery);
