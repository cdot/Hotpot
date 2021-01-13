define("server/js/CentralHeatingRule", ["common/js/Utils", "server/js/Rule"], (Utils, Rule) => {

	// How close to the target temperature we want to be. Heating will
	// be turned on if temp drops lower than this below the target. You
	// could set this to 0, but there is the risk of the system oscillating.
	const PRECISION = 0.5;
	
	class CentralHeatingRule extends Rule {

		constructor(proto, name) {
			super(proto, name);
		}

		test(controller) {
			let thermostat = controller.thermostat.CH;
			let pin = controller.pin.CH;

			return pin.getState()
			.then(function(state) {
				if (thermostat.temperature > thermostat.getMaximumTemperature()) {
					if (state === 1) {
						Utils.TRACE("Rules", "CH is overheating ", thermostat.temperature,
									"°C so turning off");
						pin.reason = "Overheat";
					}
					// setPromise is a NOP if already in the right state
					return controller.setPromise("CH", 0);
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
					return controller.setPromise("CH", 0);
					
				}
				if (thermostat.temperature < target - PRECISION) {
					if (state === 0) {
						Utils.TRACE("Rules", "CH only ",
									thermostat.temperature,
									"°C, so on");
						pin.reason = "Too cold";
					}
					return controller.setPromise("CH", 1);
				}
			});
		}
	}

	CentralHeatingRule.Model = {
        $class: CentralHeatingRule
    };

	return CentralHeatingRule;
});
