function () {
    var self = this;
    return this.pin.CH.getStatePromise()
    .then(function(state) {
        var upper_bound = self.thermostat.CH.getTargetTemperature();
        var lower_bound = upper_bound - 2;
        
        if (self.thermostat.CH.temperature > upper_bound) {
            // Warm enough inside, so switch off regardless of other rules
            if (state === 1)
                Utils.TRACE("Rules", "CH is ", self.thermostat.CH.temperature,
                            "°C so turning off");
            // Cancel any boost requests
            self.pin.CH.purgeRequests(2);
            // setPromise is a NOP if already in the right state
            return self.setPromise("CH", 0, "Warm enough");
        }

        // See if there's any demand from requests
        var req = self.pin.CH.getActiveRequest();
        if (req) {
            var restate;
            if (req.state === 0 || req.state === 3)
                restate = 0;
            else
                restate = 1;
            if (restate !== state)
                Utils.TRACE("Rules", "active request for CH, ", req.state,
                            " from ", req.source);
            return self.setPromise("CH", restate,
                                  "Requested by " + req.source);
        }

        if (self.thermostat.CH.temperature < lower_bound) {
            if (state === 0)
                Utils.TRACE("Rules", "CH only ",
                            self.thermostat.CH.temperature,
                            "°C, so on");
            return self.setPromise("CH", 1, "Too cold");
        }
    });
}
