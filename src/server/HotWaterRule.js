import debug from "debug";
const trace = debug("Rules");
import { Rule } from "./Rule.js";

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
          trace("HW is overheating %d°C so turning off",
                thermostat.temperature);
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
          trace("HW is %d°C so turning off", thermostat.temperature);
          pin.reason = "Hot enough";
        }
        // Use setPromise rather than Pin.setState() because setPromise
        // handles the interaction between HW and CH in Y-plan systems
        return controller.setPromise("HW", 0);
      }

      if (thermostat.temperature < target - PRECISION) {
        if (state === 0) {
          trace("HW only %d°C, so on", thermostat.temperature);
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

export { HotWaterRule }
