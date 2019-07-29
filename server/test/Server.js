/*@preserve Copyright (C) 2016-2019 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

let requirejs = require('requirejs');
requirejs.config({
    baseUrl: "../.."
});

requirejs(["chai-http", "test/TestRunner", "common/js/Utils", "server/js/Server"], function(chaiHttp, TestRunner, Utils, Server) {

    /**
     * Simple test program to create an HTTP server
     * on 13198
     */

    let tr = new TestRunner("Historian");
    let assert = tr.assert;
    tr.chai.use(chaiHttp);

    let server_config = {
        port: 13198,
        docroot: __dirname,
        auth: {
            user: "test",
            pass: "x",
            realm: "Test Server"
        }
    };

    function makeServer() {
        let server = new Server(server_config);
        return server.start().then(function() {
            return server;
        });
    }

    tr.addTest("simple-request",function() {
        makeServer().then(() => {
            tr.chai
            .request('http://localhost:13198')
            .get('/')
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                server.stop();
            });
        });
    });

    tr.addTest("simple-ajax",function() {
        makeServer().then((server) => {
            server.setDispatch(function(path, params) {
                assert.equal(path.length, 2);
                assert.equal(path[0], "blah");
                assert.equal(path[1], "doh");
                assert.equal("bat", params.fruit);
                return Promise.resolve();
            });
            tr.chai
            .request('http://localhost:13198')
            .get('/ajax/blah/doh?fruit=bat')
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                server.setDispatch();
                server.stop();
            });
        });
    });

    tr.addTest("simple-file",function() {
        makeServer().then(() => {
            tr.chai
            .request('http://localhost:13198')
            .get('/' + "test.txt")
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                expect(res.text).to.be("Test Data");
                server.stop();
            });
        });
    });

    tr.addTest("should stop the server", function() {
        makeServer().then((server) => {
            server.stop();
        });
    });

    tr.run();
});


