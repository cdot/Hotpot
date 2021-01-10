/*@preserve Copyright (C) 2015-2019 Crawford Currie http://c-dot.co.uk license MIT*/

if (typeof requirejs === "undefined") {
    throw new Error(__filename + " is not runnable stand-alone");
}

/**
* Common code for running mocha tests
*/
define(["mocha", "chai"], (maybeMocha, chai) => {
	
    if (typeof Mocha === "undefined")
        Mocha = maybeMocha; // node.js

    class TestRunner {
        constructor(title, debug) {
            this.chai = chai;
            this.assert = chai.assert;
            if (typeof global !== "undefined")
                this.mocha = new Mocha({ reporter: 'spec' });
            else
                this.mocha = new Mocha({ reporter: 'html' });
            if (typeof title === "string")
                this.mocha.suite.title = title;
            this.debug = debug;
			this.testDataDirs = [];
        }

        static samePath(a, b) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++)
                if (a[i] !== b[i])
                    return false;
            return true;
        }

        beforeEach(before) {
            this.before = before;
        }

        afterEach(after) {
            this.after = after;
        }

        deTest(title, fn) {
        }

        addTest(title, fn) {
            let self = this;
            let test = new Mocha.Test(title, function() {
                if (typeof self.before === "function")
                    self.before();
                let res = fn.call(this);
                if (res instanceof Promise) {
                    return res.then(() => {
                        if (typeof self.after === "function")
                            self.after();
                    });
                }
                else if (typeof self.after === "function")
                    self.after()
            });
            this.mocha.suite.addTest(test);
        }

		rm_rf(path) {
			let fs = requirejs("fs");
			let Fs = fs.promises;
			let self = this;
			return Fs.readdir(path)
			.then((files) => {
				let promises = [];
				files.forEach((file, index) => {
					var curPath = path + "/" + file;
					promises.push(Fs.lstat(curPath)
					.then((stat) => {
						if (stat.isDirectory())
							return self.rm_rf(curPath);
						else
							return Fs.unlink(curPath);
					}));
				});
				return Promise.all(promises);
			})
			.then(() => {
				return Fs.rmdir(path);
			});
		}

        run() {
            return new Promise((resolve) => {
                this.mocha.timeout(10000);
                this.mocha.run(resolve);
            })
			.then(() => {
				for (let i in self.testDataDirs) {
					rmdir(self.testDataDirs[i]);
				}
			});
        }
    }

    return TestRunner;
});
