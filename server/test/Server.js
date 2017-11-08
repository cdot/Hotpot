/*@preserve Copyright (C) 2016 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

/**
 * Simple test program to create an HTTP server
 * on 13198
 */
const Q = require("q");
const Utils = require("../../common/Utils.js");
const Server = require("../Server.js");

const chai = require("chai");
const chaiHttp = require('chai-http')
chai.use(chaiHttp);
const assert = chai.assert;

var server_config = {
    port: 13198,
    docroot: __dirname,
    auth: {
        user: "test",
        pass: "x",
        realm: "Test Server"
    }
};

//Utils.setTRACE("all");

describe("Server", function() {

    var server;

    before(function() {
        server = new Server(server_config);
        server.start().then(function() {
            return server;
        });
    });

    it("simple-request",function() {
        chai
            .request('http://localhost:13198')
            .get('/')
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                done();
            });
    });

    it("simple-ajax",function() {
        server.setDispatch(function(path, params) {
            assert.equal(path.length, 2);
            assert.equal(path[0], "blah");
            assert.equal(path[1], "doh");
            assert.equal("bat", params.fruit);
            return Q();
        });
        chai
            .request('http://localhost:13198')
            .get('/ajax/blah/doh?fruit=bat')
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                server.setDispatch();
                done();
            });
    });

    it("simple-file",function() {
        chai
            .request('http://localhost:13198')
            .get('/' + "test.txt")
            .auth(server_config.auth.user, server_config.auth.pass)
            .send()
            .end(function(err, res) {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                expect(res.text).to.be("Test Data");
                done();
            });
    });

    it("should stop the server", function() {
        server.stop();
    });
});


