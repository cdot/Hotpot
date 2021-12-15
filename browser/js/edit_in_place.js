/*@preserve Copyright (C) 2015-2019 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */

define("browser/js/edit_in_place", ["jquery", "jquery-ui"], () => {

	/**
	 * Simple in-place editing jQuery widget. Creates an edit box in place
	 * over a span. 
	 * ```
	 * $span.edit_in_place({
	 *     text: text,
	 *     onClose: function (s) {
	 *         if (s !== text)
	 *             console.log("New text:", text);
	 *     }
	 * });
	 * ```
	 * @namespace $.edit_in_place
	 */
    $.fn.edit_in_place = function (options) {

        const $this = $(this);
        const h = options.height || $this.height() || "1em";
        const $input = $(document.createElement("input"));
        const text = options.text || $this.text();
        let w = options.width || $this.width() || "15em";

        function close() {
            const v = $input.val();
            $input.remove();
            $this.show();
            if (options.onClose)
                options.onClose.call($this, v);
        }

        $this.hide();

        $input
		.addClass("in_place_editor")
        .insertBefore($this)
        .val(text)
        .height(h)
		// Adjust for padding and border
        .width(w - ($input.outerWidth() - $input.width()))
		.addClass("in_place_editor")
        .on("change", close)
        .blur(close)
        .on("keydown", function (e) { // Escape means cancel
            if (e.keyCode === 27 ||
                (e.keyCode === 13 && $(this).val() === text)) {
                close();
                return false;
            } else
                return true;
        })
        .select();
    };
});
