function() {
    var state = this.pin.CH.getState();

    if (this.thermostat.CH.temperature > 20) {
        // Warm enough inside, so switch off regardless of other rules
        if (state === 1) {
            this.setPin("CH", 0);
            // Cancel any boost requests
            this.pin.CH.purgeRequests("boost");
        }
        return;
    }

    // See if it's warm enough outside not to bother with heating
    if (this.weather.MetOffice.get("Feels Like Temperature") > 14) {
        if (state === 1) {
            Utils.TRACE("CH", "Weather is ",
                          this.weather("Feels Like Temperature"),
                          " so CH off");
            this.setPin("CH", 0);
        }
        return;
    }

    // See if there's any demand from requests
    var req = this.pin.CH.getActiveRequest();
    if (req) {
        Utils.TRACE("Rules", "active request for CH, ", req.state,
                      " from ", req.source);
        this.setPin("CH", req.state === 0 ? 0 : 1);
        return;
    }

    // Consider the time
    if (Time.between('08:00', '18:00') // day
        || Time.between('22:00', '06:40')) { // night
        if (state === 1) {
             Utils.TRACE("Rules", "out of time band, so CH off");
           this.setPin("CH", 0);
        }
        return;
    }

    // Demand is away from home, or we are in time band
    if (state === 0 && this.thermostat.CH.temperature < 16) {
        Utils.TRACE("Rules", "CH only ", this.thermostat.CH.temperature,
                    "°C, so on");
        this.setPin("CH", 1);
    }
}
