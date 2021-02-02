/**
 * This class is part of UnitTestDataModel. It is intended to be instantiated
 * on demand from configuration data.
 */
define("common/test/Instantiable", () => {

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
