/*@preserve Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */

import { Expectation } from "../Expectation.js";
import { Server } from "../../src/server/Server.js";
import chai from "chai";
const assert = chai.assert;
import chaiHttp from "chai-http";
chai.use(chaiHttp);
import Path from "path";
import { fileURLToPath } from "url";
const __dirname = Path.dirname(fileURLToPath(import.meta.url));

describe("Server", () => {

	const config = {
		port: 13198,
		docroot: __dirname,
    privacy: { session_secret: "brilliant shine" }
	};

  let server;

  afterEach(() => {
    process.removeAllListeners("unhandledRejection");
  });

  function UNit() {}
  
	it("GET /nogo",() => {
		const server = new Server(config);
		server.start();
		return chai.request(server.express)
		.get('/nogo')
		.then(res => {
			assert.equal(res.status,404);
      server.stop();
		});
	});

	it("GET /",() => {
		const server = new Server(config);
		server.start();
		return chai.request(server.express)
		.get('/')
		.then(res => {
			assert.equal(res.status, 200, res);
      // should be index.html
      assert(/^<!DOCTYPE/.test(res.text));
      server.stop();
		});
	});

	it("GET /test/server/test.txt", () => {
		const server = new Server(config);
		server.start();
    return chai.request(server.express)
		.get("/test/server/test.txt")
		.then(res => {
			assert.equal(res.status, 200);
			assert.equal(`'${res.text}'`, "'Test Data for UnitTestServer\n'");
      server.stop();
		});
	});

/*
  it("GET /log/:type/:name", () => {
		const server = new Server(config);
		server.start();
    return chai.request(server.express)
		.get("/log/thermostat/HW")
		.then(res => {
			assert.equal(res.status, 200);
      console.log(res.body);
      server.stop();
		});    
  });

  it("GET /config?path=", () => {
		const server = new Server(config);
		server.start();
    return chai.request(server.express)
		.get("/config?path=/server/port")
		.then(res => {
			assert.equal(res.status, 200);
      console.log(res.body);
      server.stop();
		});    
  });

  it("POST /config?path=", () => {});

  it("GET /request?source=;service=;target=;until=", () => {
  });

  it ("POST /calendar/add", () => {});

  it("POST /calendar/remove/:id", () => {});
*/
});


