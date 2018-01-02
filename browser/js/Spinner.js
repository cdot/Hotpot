(function ($) {
    "use strict";
    $.fn.Spinner = function () {
        var $inputs = $(this);

        // Stop people from typing
        $inputs.keydown(function (e) {
            e.preventDefault();
            return false;
        });

        function build($input) {
            var $ig = $('<div class="spinner"></div>');
            $input.replaceWith($ig);
            $ig.append($input);

            var $up = $('<div class="btn btn-default">▲</div>');
            $up.on('click', function () {
                $input.trigger("spin_up");
            });

            var $down = $('<div class="btn btn-default">▼</div>');
            $down.on('click', function () {
                $input.trigger("spin_down");
            });

            var $vg = $('<div class="input-group-btn-vertical"></div>');
            $vg.append($up);
            $vg.append($down);

            $ig.append($vg);

            return $ig;
        }
        for (var i = 0; i < $inputs.length; i++) {
            build($($inputs[i]));
        }
    };
})(jQuery);