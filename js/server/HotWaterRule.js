define([ "js/common/Utils", "js/server/Rule" ], (Utils, Rule) => {

  // How close to the target temperature we want to be. Water will
  // be turned on if temp drops lower than this below the target. You
  // could set this to 0, but there is the risk of the system oscillating.
  const PRECISION = 2;

  class HotWaterRule extends Rule {

    constructor(proto, name) {
      super(proto, name);
    }

    test(controller) {
      let thermostat = controller.thermostat.HW;
      let pin = controller.pin.HW;

      return pin.getState()
      .then(function (state) {
        if (thermostat.temperature > thermostat.getMaximumTemperature()) {
          // Hot enough, so switch off regardless of other rules
          if (state === 1) {
            Utils.TRACE("Rules", "HW is overheating ", thermostat.temperature,
                        "°C so turning off");
            pin.reason = "Overheat";
          }
          // Use setPromise rather than Pin.setState() because setPromise
          // handles the interaction between HW and CH in Y-plan systems
          return controller.setPromise("HW", 0);
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
          // Use setPromise rather than Pin.setState() because setPromise
          // handles the interaction between HW and CH in Y-plan systems
          return controller.setPromise("HW", 0);
        }

        if (thermostat.temperature < target - PRECISION) {
          if (state === 0) {
            Utils.TRACE("Rules", "HW only ",
                        thermostat.temperature,
                        "°C, so on");
            pin.reason = "Too cold";
          }
          return controller.setPromise("HW", 1);
        }

        return Promise.resolve();
      });
    }
  }

  HotWaterRule.Model = {
    $class: HotWaterRule
  };

  return HotWaterRule;
});
