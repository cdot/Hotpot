/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/

if (typeof requirejs === "undefined") {
	throw new Error(__filename + " is not runnable stand-alone");
}

define("common/test/Instantiable", () => {

	/**
	 * This class is part of UnitTestDataModel. It is intended to
	 *  be instantiated on demand from configuration data.
	 */
	class Instantiable {
		constructor(proto, name) {
			this.data = proto.data;
		}
	}

	Instantiable.Model = {
		data: { $class: String }
	};

	return Instantiable;
});
