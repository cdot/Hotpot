/*@preserve Copyright (C) 2015-2019 Crawford Currie http://c-dot.co.uk license MIT*/

if (typeof requirejs === "undefined") {
    throw new Error(__filename + " is not runnable stand-alone");
}

/**
 * Common code for running mocha tests.
 * Look at one of the UnitTest* files to understand the pattern.
 * Command-line parameters are interpreted as names of tests to run.
 * '*' wildcard.
 * --keep will prevent tmp files from being deleted
 */
define(["mocha", "chai", "fs"], (maybeMocha, chai, fs) => {

    if (typeof Mocha === "undefined")
        Mocha = maybeMocha; // node.js

    class TestRunner extends Mocha {
        constructor(title, debug) {
			super({ reporter: (typeof global === "undefined") ? 'html' : 'spec' });
            this.chai = chai;
            this.assert = chai.assert;
            if (typeof title === "string")
                this.suite.title = title;
            this.debug = debug;

			this.matches = [];
			this.keepTmpFiles = false;
			for (let i = 2; i < process.argv.length; i++) {
				let arg = process.argv[i];
				if (arg === "--keep")
					this.keepTmpFiles = true;
				else {
					let expr = arg.replace('*', '.*');
					this.matches.push(new RegExp(`^${expr}$`));
				}
			}
        }

        static samePath(a, b) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++)
                if (a[i] !== b[i])
                    return false;
            return true;
        }

		/**
		 * Defuse test. Use command-line params instead.
		 */
        deTest(title, fn) {
        }

		/**
		 * Return the path to a temporary file for the test to use
		 */
		tmpFile(name) {
			if (!this.tmpFileDir) {
				this.tmpFileDir = fs.mkdtempSync("/tmp/TestRunner-");
				if (!this.keepTmpFiles) {
					this.suite.afterEach("testdirs", () => {
						this.rm_rf(this.tmpFileDir);
					});
				}
			}
			return `${this.tmpFileDir}/${name}`;
		}

        addTest(title, fn) {
			if (this.matches.length > 0) {
				let matched = false;
				for (let i = 0; i < this.matches.length; i++) {
					if (this.matches[i].test(title)) {
						matched = true;
						break;
					}
				}
				if (!matched)
					return;
			}

            let test = new Mocha.Test(title, () => fn.call(this));
            this.suite.addTest(test);
        }

		rm_rf(path) {
			return fs.promises.readdir(path)
			.then((files) => {
				let promises = [];
				files.forEach((file, index) => {
					var curPath = `${path}/${file}`;
					promises.push(fs.promises.lstat(curPath)
					.then((stat) => {
						if (stat.isDirectory())
							return this.rm_rf(curPath);
						else
							return fs.promises.unlink(curPath);
					}));
				});
				return Promise.all(promises);
			})
			.then(() => {
				return fs.promises.rmdir(path);
			});
		}

        run() {
            return new Promise((resolve) => {
                this.timeout(10000);
                super.run(resolve);
            });
        }
    }

    return TestRunner;
});
