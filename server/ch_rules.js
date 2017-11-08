function (thermostats, pins) {
    var self = this;
    var thermostat = thermostats.CH;
    var pin = pins.CH;

    return pin.getStatePromise()
    .then(function(state) {
        if (thermostat.temperature > thermostat.getMaximumTemperature()) {
            if (state === 1) {
                Utils.TRACE("Rules", "CH is overheating ", thermostat.temperature,
                            "°C so turning off");
                pin.reason = "Overheat";
            }
            // Cancel any boost requests
            pin.purgeRequests(2);
            // setPromise is a NOP if already in the right state
            return self.setPromise("CH", 0);
        }

        // See if there's any demand from requests
        var req = pin.getActiveRequest();
        if (req) {
            var restate;
            if (req.state === 0 || req.state === 3)
                restate = 0;
            else
                restate = 1;
            if (restate !== state) {
                Utils.TRACE("Rules", "active request for CH, ", req.state,
                            " from ", req.source);
                pin.reason = req.source + " requested " +
                    pin.STATE_NAMES[req.state];
            }
            return self.setPromise("CH", restate);
        }

        // Otherwise respect the timeline
        var target = thermostat.getTargetTemperature();
        if (thermostat.temperature > target) {
            // Warm enough inside, so switch off even if 
            if (state === 1) {
                Utils.TRACE("Rules", "CH is ", thermostat.temperature,
                            "°C so turning off");
                pin.reason = "Warm enough";
            }
            // setPromise is a NOP if already in the right state
            return self.setPromise("CH", 0);
            
        }
        if (thermostat.temperature < target - 1) {
            if (state === 0) {
                Utils.TRACE("Rules", "CH only ",
                            thermostat.temperature,
                            "°C, so on");
                pin.reason = "Too cold";
            }
            return self.setPromise("CH", 1);
        }
    });
}
