function (thermostats, pins) {
    // Get the current state of the HW pin
    var self = this;
    var thermostat = thermostats.HW;
    var pin = pins.HW;
    
    return pin.getStatePromise()
    .then(function(state) {
        var upper_bound = thermostat.getTargetTemperature();
        var lower_bound = upper_bound - 10;

        // Check the temperature of the HW thermostat
        if (thermostat.temperature > upper_bound) {
            // Hot enough, so switch off regardless of other rules
            if (state === 1)
                Utils.TRACE("Rules", "HW is ", thermostat.temperature,
                            "°C so turning off");
            // Purge boost requests (state 2)
            pin.purgeRequests(2);
            // Use setPromise rather than pins.set() because setPromise
            // handles the interaction between HW and CH in Y-plan systems
            return self.setPromise("HW", 0, "Hot enough");
        }

        // See if there's any request from a mobile device or calendar
        var req = pin.getActiveRequest();
        if (req) {
            var restate = req.state === 0 ? 0 : 1;
            if (restate !== state)
                Utils.TRACE("Rules", "active request for HW, ", req.state,
                            " from ", req.source);
            return self.setPromise(
                "HW", restate, req.source + " requested " + req.state);
        }

        if (thermostat.temperature < lower_bound) {
            if (state === 0)
                Utils.TRACE("Rules", "HW only ",
                            thermostat.temperature,
                            "°C, so on");
            return self.setPromise("HW", 1, "Too cold");
        }
    });
}
