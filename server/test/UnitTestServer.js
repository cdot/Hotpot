/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

let nextPort = 13198;

requirejs(["chai-http", "test/TestRunner", "test/Expectation", "common/js/Utils", "server/js/Server"], function(chaiHttp, TestRunner, Expectation, Utils, Server) {

    /**
     * Simple test program to create an HTTP server
     * on nextPort
     */

    let tr = new TestRunner("Server");
    let assert = tr.assert;
    tr.chai.use(chaiHttp);

	function newServerConfig() {
		return {
			port: nextPort++,
			docroot: __dirname,
			auth: {
				user: "test",
				pass: "x",
				realm: "Test Server"
			}
		};
	}
	
    function makeServer(config) {
        let server = new Server(config);
        return server.start().then(() => server);
    }

    tr.addTest("404",() => {
		let server_config = newServerConfig();
		return makeServer(server_config).then((server) => {
            tr.chai
            .request('http://localhost:' + server_config.port)
            .get('/') // should try to open index.html, which doesn't exist
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                assert.equal(res.status,404);
				server.stop();
            });
        });
    });

    tr.addTest("simple-ajax", () => {
		let server_config = newServerConfig();
        return makeServer(server_config).then((server) => {
            server.setDispatch((path, params) => {
                assert.equal(path.length, 2);
                assert.equal(path[0], "blah");
                assert.equal(path[1], "doh");
                assert.equal("bat", params.fruit);
                return Promise.resolve({fnar:65});
            });
            tr.chai
            .request('http://localhost:' + server_config.port)
            .get('/ajax/blah/doh?fruit=bat')
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                assert.equal(err, null);
                assert.equal(res.status,200);
                assert.equal(res.text,'{"fnar":65}');
                server.setDispatch();
                return server.stop();
            });
        });
    });

    tr.addTest("simple-file", () => {
		let server_config = newServerConfig();
        return makeServer(server_config).then((server) => {
            tr.chai
            .request('http://localhost:' + server_config.port)
            .get('/' + "test.txt")
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                assert.equal(err, null);
                assert.equal(res.status,200);
                assert.equal(res.text,"Test Data for UnitTestServer\n");
                return server.stop();
            });
        });
    });

    tr.addTest("should stop the server", () => {
		let server_config = newServerConfig();
        return makeServer(server_config).then((server) => {
            return server.stop();
        });
    });

    tr.run();
});


