function (thermostats, pins) {
    var self = this;
    var thermostat = thermostats.CH;
    var pin = pins.CH;
    
    return pin.getStatePromise()
    .then(function(state) {
        var upper_bound = thermostat.getTargetTemperature();
        var lower_bound = upper_bound - 2;
        
        if (thermostat.temperature > upper_bound) {
            // Warm enough inside, so switch off regardless of other rules
            if (state === 1)
                Utils.TRACE("Rules", "CH is ", thermostat.temperature,
                            "°C so turning off");
            // Cancel any boost requests
            pin.purgeRequests(2);
            // setPromise is a NOP if already in the right state
            return self.setPromise("CH", 0, "Warm enough");
        }

        // See if there's any demand from requests
        var req = pin.getActiveRequest();
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

        if (thermostat.temperature < lower_bound) {
            if (state === 0)
                Utils.TRACE("Rules", "CH only ",
                            thermostat.temperature,
                            "°C, so on");
            return self.setPromise("CH", 1, "Too cold");
        }
    });
}
