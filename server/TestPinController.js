const PinController = require("./PinController.js");
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var pins = {};
rl.setPrompt("Pin: ");
rl.on("line", function(p) {
    var pin = parseInt(p);
    if (p > 0 && p < 28) {
        if (typeof pins[pin] == "undefined") {
            pins[pin] = new PinController("P" + pin, pin);
        }
        pins[pin].set(!pins[pin].state);
    } else {
        console.log("Pin " + p + " out of range 1..27");
    }
    rl.prompt();
}).on('close', function() {
    process.exit(0);
}).prompt();


