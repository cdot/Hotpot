/*@preserve Copyright (C) 2016-2023 Crawford Currie http://c-dot.co.uk license MIT*/

/*eslint-env node */
/* global HOTPOT_DEBUG*/
global.HOTPOT_DEBUG = undefined;

/**
 * Main program for heating control server
 */
import getopt from "posix-getopt";
import Path from "path";
import { Utils } from "../src/common/Utils.js";
import { DataModel } from "../src/common/DataModel.js";
import { Location } from "../src/common/Location.js";
import { Server } from "../src/server/Server.js";
import { Controller } from "../src/server/Controller.js";

const TAG = "Hotpot";

const HOTPOT_MODEL = {
  tracefile: {
    $doc: "Full path to the trace file",
    $class: String,
    $optional: true
  },
  server: Server.Model,
  controller: Controller.Model
};

const go_parser = new getopt.BasicParser(
  "h(help)c:(config)C(confhelp)t:(trace)d(debug)",
  process.argv);

const DESCRIPTION = [
  "DESCRIPTION",
  "A Raspberry PI central heating control server.",
  "See README.md for details",
  "",
  "OPTIONS",
	"\th, help - Show this help",
	"\tc, config - Configuration file (default ./hotpot.cfg)",
	"\tC, confhelp - Configuration file help",
	"\tt, trace - Trace modules e.g. --trace=Rules",
	"\td, debug - Run in debug mode, using stubs for missing hardware"
].join("\n");

const cliopt = {
  config: "./hotpot.cfg"
};
let option;
while ((option = go_parser.getopt())) {
  switch (option.option) {
  default: console.log(DESCRIPTION); process.exit(0);
  case 'c': cliopt.config = option.optarg; break;
  case 't': cliopt.trace = option.optarg; break;
  case 'C': cliopt.confhelp = true; break;
  case 'd': cliopt.debug = true; break;
  }
}

let preamble;

if (cliopt.debug) {
  // Debug for missing hardware
  preamble = import("../src/server/DebugSupport.js")
  .then(mod => HOTPOT_DEBUG = new mod.DebugSupport());
}
else
  preamble = Promise.resolve();

if (cliopt.trace && cliopt.trace !== "")
  Utils.TRACEfilter(cliopt.trace);

let config, controller, server;

if (cliopt.confhelp) {
  console.log(DataModel.help(HOTPOT_MODEL));
  process.exit(0);
}

preamble

.then(() => DataModel.loadData(cliopt.config, HOTPOT_MODEL))

.then(cfg => {
  if (cfg.tracefile)
    Utils.TRACEto(cfg.tracefile.getPath());

  Utils.TRACE(TAG, "Configuration loaded");
  config = cfg;
  controller = config.controller;
  server = config.server;
  server.basePath = Path.dirname(cliopt.config);
  Utils.sendMail = (subj, mess) => server.sendMailToAdmin(subj, mess);
  controller.addRoutes(server.express);
})
.then(() => controller.initialise())
.then(() => controller.setLocation(new Location(server.location)))
.then(() => {
  // Default error handler
  server.express.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    console.error(err);
    return res.status(err.status || 500).end();
  });
  return server.start();
})

.then(() => {
  // Save config when it changes, so we restart to the
  // same state
  controller.on(
    "config_change",
    () => {
      DataModel.saveData(config, HOTPOT_MODEL, cliopt.config)
      .then(() => {
        Utils.TRACE(TAG, cliopt.config, " updated");
      });
    });
})
.catch(e => {
  console.error("Controller initialisation failed: ",
                typeof e.stack !== "undefined" ? e.stack : e);
  process.exit(1);
});
