function (thermostats, pins) {
    // Get the current state of the HW pin
    var self = this;
    var thermostat = thermostats.HW;
    var pin = pins.HW;

    return pin.getStatePromise()
    .then(function(state) {
        // Keep HW below 40C regardless
        if (thermostat.temperature > thermostat.getMaximumTemperature()) {
            // Hot enough, so switch off regardless of other rules
            if (state === 1) {
                Utils.TRACE("Rules", "HW is overheating ", thermostat.temperature,
                            "°C so turning off");
                pin.reason = "Overheat";
            }
            // Purge boost requests (state 2)
            pin.purgeRequests(2);
            // Use setPromise rather than pins.set() because setPromise
            // handles the interaction between HW and CH in Y-plan systems
            return self.setPromise("HW", 0);
        }
        
        // See if there's any request from a mobile device or calendar
        var req = pin.getActiveRequest();
        if (req) {
            var restate = req.state === 0 ? 0 : 1;
            if (restate !== state) {
                Utils.TRACE("Rules", "active request for HW, ", req.state,
                            " from ", req.source);
                pin.reason = req.source + " requested " +
                    pin.STATE_NAMES[req.state];
            }
            return self.setPromise("HW", restate);
        }

        // Otherwise respect the timeline
        var target = thermostat.getTargetTemperature();
        if (thermostat.temperature > target) {
            // Hot enough, so switch off regardless of other rules
            if (state === 1) {
                Utils.TRACE("Rules", "HW is ", thermostat.temperature,
                            "°C so turning off");
                pin.reason = "Hot enough";
            }
            // Use setPromise rather than pins.set() because setPromise
            // handles the interaction between HW and CH in Y-plan systems
            return self.setPromise("HW", 0);
        }

        // Stay within 5 degrees of the target
        if (thermostat.temperature < target - 5) {
            if (state === 0) {
                Utils.TRACE("Rules", "HW only ",
                            thermostat.temperature,
                            "°C, so on");
                pin.reason = "Too cold";
            }
            return self.setPromise("HW", 1);
        }
    });
}
