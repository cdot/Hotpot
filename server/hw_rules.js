function () {
    // Get the current state of the HW pin
    var self = this;
    return this.pin.HW.getStatePromise()
    .then(function(state) {
        var upper_bound = self.thermostat.HW.getTargetTemperature();
        var lower_bound = upper_bound - 10;

        // Check the temperature of the HW thermostat
        if (self.thermostat.HW.temperature > upper_bound) {
            // Hot enough, so switch off regardless of other rules
            if (state === 1)
                Utils.TRACE("Rules", "HW is ", self.thermostat.HW.temperature,
                            "°C so turning off");
            // Purge boost requests (state 2)
            self.pin.HW.purgeRequests(2);
            // Use setPromise rather than self.pin.set() because setPromise
            // handles the interaction between HW and CH in Y-plan systems
            return self.setPromise("HW", 0, "Hot enough");
        }

        // See if there's any request from a mobile device or calendar
        var req = self.pin.HW.getActiveRequest();
        if (req) {
            var restate = req.state === 0 ? 0 : 1;
            if (restate !== state)
                Utils.TRACE("Rules", "active request for HW, ", req.state,
                            " from ", req.source);
            return self.setPromise(
                "HW", restate, req.source + " requested " + req.state);
        }

        if (self.thermostat.HW.temperature < lower_bound) {
            if (state === 0)
                Utils.TRACE("Rules", "HW only ",
                            self.thermostat.HW.temperature,
                            "°C, so on");
            return self.setPromise("HW", 1, "Too cold");
        }
    });
}
