## Development
The Hotpot software is designed to be extended through the addition of new rules, calendars, and weather agents. You are very welcome to submit any code you develop
as a pull request on github.

### Known Issues

Issues encountered during the last 6 years of continuous use include:

#### Problems with 1-wire
We have had problems with the system "losing" sensors on the 1-wire bus. This problem first emerged after some 4 years of problem-free usage. It was resolved as follows:
- Use a 5V Vdd to supply the DS18b20s. The signal line must still be pulled up to 3.3V, however (don't pull it to 5V or you'll fry the GPIO)
- Disabling IRQs in the `wire` module (`sudo sh -c "echo options wire disable_irqs=1 >> /etc/modprobe.d/wire.conf"` and reboot)
- Reducing the frequency with which UIs (browser or Android) poll the server.
Alternatively, allocating a different GPIO pin for each sensor might work.

#### Mains voltage spikes
On two separate occasions, a problem with the mains power supply (AFAICT as a result of lightning) has resulted in a power cut, which may have been preceded by a voltage spike? Both times the SD card has been "fried". We now have a surge protector, though it has yet to be tested. Note that this appears to be a problem with the Pi rather than a Hotpot-specific issue. You might consider using a [more robust storage solution](https://blog.mivia.dk/solved-sd-card-corrupted-raspberry-pi/), especially if your Pi provides other services besides Hotpot.

### Running a Debug Server
```
$ cd Hotpot/server/test
$ node ../js/Hotpot.js --debug --trace all -c simulated_hotpot.cfg
```
This will start a debug server listening on localhost:13196 with full tracing.
In a web browser on localhost, load http://localhost:13196/

Trace output is written to STDOUT by default. You can also configure it to
write tracing to a file by setting a `tracefile` in `hotpot.cfg`.

All trace and debug statements are tagged with the time and the module e.g 
```
2016-08-13T08:37:08.694Z Server: HTTP starting on port 13196
```
You can choose just to monitor just particular modules e.g. `--trace=Server`,
or you can enable `all` and then choose which modules to *ignore* by prepending a minus sign e.g. `--trace=all,-Historian,-Server`

### Unit Tests

There are a number of unit test module scattered around the code; these are all
named using the `UnitTest` prefix. They can all be run stand-alone; e.g.
```
$ cd ~/Hotpot/common/test
$ node install # make sure required test modules are installed
$ node UnitTestDataModel.js 

DataModel
  ✓ remodel simple
  ✓ remodel bad simple
  ✓ remodel builtIns
  ✓ remodel bad builtIns
  ✓ remodel toady
  ✓ remodel amphibian
  ✓ serialise simple
  ✓ serialise builtIns
  ✓ serialise toady
  ✓ saveload simple
  ✓ saveload builtIns
  ✓ simple proto, simple data
  ✓ help
  ✓ require

  14 passing (19ms)
```
### AJAX interface

The browser interface uses an AJAX interface to the server to gain access
to the functions of the controller.

#### `/ajax/getconfig`
Will retrieve the configuration of the controller (JSON)

#### `/ajax/setconfig`
Set a configuration item. The usage of this is risky and complex, you
are recommended to read the code to understand it. It is used to write
new timelines from the browser UI, but could potnetially be used to write
other configuration.

#### `/ajax/state`
Retrieves the current state of the controller (JSON)

### `/ajax/trace?trace=`
Set the trace level of the server (see the description of `--trace` above)

#### `/ajax/log`
Retrieve all logs. Add `/{thermostat|pin|weather}` to retrieve logs for those service types. Add `/{thermostat|pin|weather}/{name}` to retrieve logs for a specific service e.g. `/ajax/log/thermostat/CH`.

#### `/ajax/request?source=;service=;target=;until=`
Adds a request on behalf of the given `source` (an arbitrary string) for the given `service`, asking for the given `target` temperature. The request will remain active until the time given in `until` (epoch seconds). Passing `until=boost` will make it a boost request (see "Controlling Hotpot from the calendar" above for more about boost requests).

#### `/ajax/refresh_calendars`
Force a calendar refresh from the calendar server(s), useful if an event has been added/removed from the calendar (there is no support for push notifications)

### Code Layout
+ The code is written for node.js 11.15.0, which is ECMA 2017
+ Use `eslint` with `server/package.json` to provide the configuration
+ 4-space tabs
+ Code layout as per Emacs `js-mode`
