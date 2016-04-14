/*@preserve Copyright (C) 2015 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Simple in-place editing widget
 */
(function($) {
    "use strict";
    $.fn.edit_in_place = function(options) {

        var $this = $(this);
        var h = options.height || $this.height();
        var w = options.width || $this.width();
        var changed = options.changed ||
            function(/*text*/) {
                $this.text();
            };
        var $input = $("<input/>"),
        blurb = function() {
            $input.remove();
            $this.show();
        };

        $this.hide();

        $input
            .insertBefore($this)
            .addClass("in_place_editor")
            .val($this.text())
            .css("height", h)
            .css("width", w)

            .on("change", function() {
                var val = $(this).val();
                blurb();
                if (val !== $this.text())
                    changed.call($this, val);
            })

            .on("mouseup", function(e) {
                // Override the parent click handler
                e.stopPropagation();
            })

            .on("mousedown", function(e) {
                // Override the parent click handler
                e.stopPropagation();
            })

            .on("keydown", function(e) { // Escape means cancel
                if (e.keyCode === 27
                    || (e.keyCode === 13
                        && $(this).val() === $this.text())) {
                    blurb();
                    return false;
                } else
                    return true;
            })

            .blur(blurb)
            .select();
    };
})(jQuery);
