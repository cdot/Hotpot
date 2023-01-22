/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import { Utils } from "../common/Utils.js";

/**
 * Abstract base class of rules governing when/if a function is to
 * be turned on/off based on the state of one or more thermostats.
 */
class Rule {
  /**
   * @param {object} proto object that configures this object
   * @param {string} name name of the rule
   */
  constructor(proto, name) {

    /**
     * Name of the rule
     * @member {string}
     */
    this.name = name;

    Utils.extend(this, proto);
  }

  /**
   * Test the rule.
   * @return {boolean} rule test result
   */
  test() {
    throw new Error("Subclasses must implement");
  };
}

export { Rule }
