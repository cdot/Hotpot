function () {

    // Get the current state of the HW pin
    var state = this.pin.HW.getState();

    // Check the temperature of the HW thermostat
    if (this.thermostat.HW.temperature > 45) {
        // Hot enough, so switch off regardless of other rules
        if (state === 1) {
            Utils.TRACE("Rules", "HW is ", this.thermostat.HW.temperature,
                          "°C so turning off");
            this.setPin("HW", 0);
            // Purge boost requests (state 2)
            this.pin.HW.purgeRequests(2);
        }
        return;
    }

    // See if there's any request from a mobile device or calendar
    var req = this.pin.HW.getActiveRequest();
    if (req) {
        Utils.TRACE("Rules", "active request for HW, ", req.state,
                      " from ", req.source);
        // Use setPin rather than this.pin.set() because setPin handles
        // the interaction between HW and CH in Y-plan systems
        this.setPin("HW", req.state === 0 ? 0 : 1);
        return;
    }

    if (Time.between("08:30", "18:00") // day
        || Time.between("20:00", "06:30")) { // night
        if (state === 1) {
            Utils.TRACE("Rules", "out of time band, so HW off");
            this.setPin("HW", 0);
        }
        return;
    }

    // we are in time band
    if (state === 0 && this.thermostat.HW.temperature < 42) {
        Utils.TRACE("Rules", "HW only ", this.thermostat.HW.temperature,
                    "°C, so on");
        this.setPin("HW", 1);
    }
}