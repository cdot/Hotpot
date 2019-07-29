function () {
    let self = this;
    let thermostat = self.thermostat.HW;
    let pin = self.pin.HW;

    return pin.getStatePromise()
    .then(function(state) {
        if (thermostat.temperature > thermostat.getMaximumTemperature()) {
            // Hot enough, so switch off regardless of other rules
            if (state === 1) {
                Utils.TRACE("Rules", "HW is overheating ", thermostat.temperature,
                            "°C so turning off");
                pin.reason = "Overheat";
            }
            // Use setPromise rather than pins.set() because setPromise
            // handles the interaction between HW and CH in Y-plan systems
            return self.setPromise("HW", 0);
        }
        
        // Otherwise respect the timeline
        let target = thermostat.getTargetTemperature();
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
