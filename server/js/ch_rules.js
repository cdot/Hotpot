function () {
    let self = this;
    let thermostat = self.thermostat.CH;
    let pin = self.pin.CH;

    return pin.getState()
    .then(function(state) {
        if (thermostat.temperature > thermostat.getMaximumTemperature()) {
            if (state === 1) {
                Utils.TRACE("Rules", "CH is overheating ", thermostat.temperature,
                            "°C so turning off");
                pin.reason = "Overheat";
            }
            // setPromise is a NOP if already in the right state
            return self.setPromise("CH", 0);
        }

        // Otherwise respect the timeline
        let target = thermostat.getTargetTemperature();
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
