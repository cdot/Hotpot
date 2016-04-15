/*@preserve Copyright (C) 2015 Crawford Currie http://c-dot.co.uk license MIT*/

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

        var $this = $(this);
        var opt = {
            height: options.height || $this.height(),
            width: options.width || $this.width(),
            changed: options.changed ||
                function(text) {
                    $this.text(text);
                },
            area: false
        };
        
        var data = $this.data("editable");
        if (typeof data === "string") {
            try {
                eval("data={" + data + "}");
            } catch (e) {
                throw "Unparseable data-editable: " + data + ": " + e.message;
            }
            for (var o in opt)
                if (typeof data[o] !== "undefined")
                    opt[o] = data[o];
        }

        var $editor;

        var destroy = function() {
            $editor.remove();
            $this.show();
        };

        var commit = function() {
        };

        if (opt.area) {
            var $tick, $cross, $controls, $ta;

            $editor = $("<div></div>")
                .css("height", opt.height)
                .css("width", opt.width);
            var $error = $("<div></div>")
                .css("color", "white")
                .css("background-color", "red")
                .css("font-weight", "bold");

            $tick = $("<div>&#9745;</div>")
                .addClass("editable_button")
                .on("click", function() {
                    var fn = $ta.val();
                    if (fn !== $this.text()) {
                        try {
                            // Does it compile?
                            var ok;
                            eval("ok=" + fn);
                            destroy();
                            opt.changed.call($this, fn);
                        } catch (e) {
                            $error.text("Error: " + e.message);
                        }
                    } else
                        destroy();
                });
            $cross = $("<div>&#9746;</div>")
            .addClass("editable_button")
                .css("float", "right")
                .on("click", function() {
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
                .css("height", opt.height - $controls.height())
                .css("width", opt.width);
            $ta.val($this.text());
            $editor.append($ta);

            $editor.append($error);
        } else {
            $editor = $("<input/>")
                .on("keydown", function(e) {
                    // Escape means cancel, Enter means commit
                    if (e.keyCode === 27
                        || (e.keyCode === 13
                            && $editor.val() === $this.text())) {
                        destroy();
                        return false;
                    } else
                        return true;
                })
                .on("change", function() {
                    var val = $editor.val();
                    destroy();
                    if (val !== $this.text())
                        opt.changed.call($this, val);
                });
            $editor.val($this.text());
         }

        $this.hide();

        $editor
            .insertBefore($this)
            .addClass("in_place_editor")
            .css("height", opt.height)
            .css("width", opt.width)

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
