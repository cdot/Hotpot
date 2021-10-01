define("browser/js/Spinner", ["jquery"], function () {
    (function ($) {
        $.fn.Spinner = function () {
            let $inputs = $(this);

            // Stop people from typing
            $inputs.keydown(function (e) {
                e.preventDefault();
                return false;
            });

            function build($input) {
                let $ig = $('<div class="spinner"></div>');
                $input.replaceWith($ig);
                $ig.append($input);

                let $up = $('<div class="btn btn-default">▲</div>');
                $up.on('click', function () {
                    $input.trigger("spin_up");
                });

                let $down = $('<div class="btn btn-default">▼</div>');
                $down.on('click', function () {
                    $input.trigger("spin_down");
                });

                let $vg = $('<div class="input-group-btn-vertical"></div>');
                $vg.append($up);
                $vg.append($down);

                $ig.append($vg);

                return $ig;
            }
            for (let i = 0; i < $inputs.length; i++) {
                build($($inputs[i]));
            }
        };
    })(jQuery);
});