/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

let nextPort = 13198;

requirejs(["chai-http", "test/TestRunner", "common/js/Utils", "server/js/Server"], function(chaiHttp, TestRunner, Utils, Server) {

    /**
     * Simple test program to create an HTTP server
     * on nextPort
     */

    let tr = new TestRunner("Historian");
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
        return server.start().then(function() {
            return server;
        });
    }

    tr.addTest("simple-request",function() {
		let server_config = newServerConfig();
        return makeServer(server_config).then((server) => {
            tr.chai
            .request('http://localhost:' + server_config.port)
            .get('/')
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                assert.equal(err, null);
                assert.equal(res.status,200);
                return server.stop();
            });
        });
    });

    tr.addTest("simple-ajax", function() {
		let server_config = newServerConfig();
        return makeServer(server_config).then((server) => {
            server.setDispatch(function(path, params) {
                assert.equal(path.length, 2);
                assert.equal(path[0], "blah");
                assert.equal(path[1], "doh");
                assert.equal("bat", params.fruit);
                return Promise.resolve();
            });
            tr.chai
            .request('http://localhost:' + server_config.port)
            .get('/ajax/blah/doh?fruit=bat')
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                assert.equal(err, null);
                assert.equal(res.status,200);
                server.setDispatch();
                return server.stop();
            });
        });
    });

    tr.addTest("simple-file", function() {
		let server_config = newServerConfig();
        return makeServer(server_config).then((server) => {
            tr.chai
            .request('http://localhost:' + server_config.port)
            .get('/' + "test.txt")
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
				console.error(err);
                assert.equal(err, null);
                assert.equal(res.status,200);
                assert.equal(res.text,"Test Data\n");
                return server.stop();
            });
        });
    });

    tr.addTest("should stop the server", function() {
		let server_config = newServerConfig();
        return makeServer(server_config).then((server) => {
            return server.stop();
        });
    });

    tr.run();
});


