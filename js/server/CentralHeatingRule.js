define([
  "js/common/Utils",
  "js/server/Rule"
], (
  Utils,
  Rule
) => {

  // How close to the target temperature we want to be. Heating will
  // be turned on if temp drops lower than this below the target. You
  // could set this to 0, but there is the risk of the system oscillating.
  const PRECISION = 0.5;

  class CentralHeatingRule extends Rule {

    constructor(proto, name) {
      super(proto, name);
    }

    test(controller) {
      const thermostat = controller.thermostat.CH;
      const pin = controller.pin.CH;

      return pin.getState()
      .then(state => {
				const max = thermostat.getMaximumTemperature();
        if (thermostat.temperature > max) {
          const mess = (state === 1) ? "turning" : "keeping";
          Utils.TRACE("Rules", "CH is overheating ",
								      thermostat.temperature,
								      `°C > ${max} so ${mess} off`);
          pin.reason = "Overheat";
          // setPromise is a NOP if already in the right state
          return controller.setPromise("CH", 0);
        }

        // Otherwise respect the timeline
        const target = thermostat.getTargetTemperature();
        if (thermostat.temperature > target) {
          // Warm enough inside, so switch off even if
          const mess = (state === 1) ? "turning" : "keeping";
          Utils.TRACE("Rules", "CH is ", thermostat.temperature,
								      `°C > ${target} so ${mess} off`);
          pin.reason = "Warm enough";
          // setPromise is a NOP if already in the right state
          return controller.setPromise("CH", 0);
        }

        else if (thermostat.temperature < target - PRECISION) {
          const mess = (state === 0) ? "turning" : "keeping";
          Utils.TRACE("Rules",
								      `CH only ${thermostat.temperature}°C `,
								      `< ${target}`,
								      `so ${mess} on`);
          pin.reason = "Too cold";
          return controller.setPromise("CH", 1);
        }

        Utils.TRACE("Rules", "CH no change");
				return Promise.resolve();
      });
    }
  }

  CentralHeatingRule.Model = {
    $class: CentralHeatingRule
  };

  return CentralHeatingRule;
});
