/*@preserve Copyright (C) 2021-2022 Crawford Currie http://c-dot.co.uk license MIT*/

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

export { Instantiable }
