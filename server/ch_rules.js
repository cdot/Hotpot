function () {
    var self = this;
    return this.pin.CH.getStatePromise()
    .then(function(state) {
        if (self.thermostat.CH.temperature > 18) {
            // Warm enough inside, so switch off regardless of other rules
            if (state === 1)
                Utils.TRACE("Rules", "CH is ", self.thermostat.CH.temperature,
                            "°C so turning off");
            // Cancel any boost requests
            self.pin.CH.purgeRequests(2);
            // setPromise is a NOP if already in the right state
            return self.setPromise("CH", 0);
        }

        // See if it's warm enough outside not to bother with heating
        if (self.weather.MetOffice.get("Feels Like Temperature") > 14) {
            if (state === 1)
                Utils.TRACE("CH", "Weather is ",
                            self.weather("Feels Like Temperature"),
                            " so CH off");
            return self.setPromise("CH", 0);
        }

        // See if there's any demand from requests
        var req = self.pin.CH.getActiveRequest();
        if (req) {
            var restate = req.state === 0 ? 0 : 1;
            if (restate !== state)
                Utils.TRACE("Rules", "active request for CH, ", req.state,
                            " from ", req.source);
            return self.setPromise("CH", restate);
        }

        // Consider the time
        if (Time.between('22:00', '06:40')) { // night
            if (state === 1)
                Utils.TRACE("Rules", "out of time band, so CH off");
            return self.setPromise("CH", 0);
        }

        // Daytime lower limit is lower than morning and evening
        var lower_bound = Time.between('08:00', '18:00')
            ? 14 : 16;

        // we are in time band
        if (self.thermostat.CH.temperature < lower_bound) {
            if (state === 0)
                Utils.TRACE("Rules", "CH only ",
                            self.thermostat.CH.temperature,
                            "°C, so on");
            return self.setPromise("CH", 1);
        }
    });
}
