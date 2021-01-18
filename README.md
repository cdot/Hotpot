# Hotpot

Hotpot is a controller for a Y-plan central heating system, using
node.js on Raspberry Pi. It piggybacks on the existing system so that
the existing controller acts as a backup.

The controller can collate data from a number of sources to support
user-defined rules to decide whether the heating needs to come on.
- Any number of thermostats, usually one for heating (CH) and one for hot water (HW)
- A detailed timeline that allows fine control over target temperatures
- Any number of Google calendars
- Any other sources you can think of

Because the system is controlled by rules written in Javascript, it is easy (and fun)
to derive and add new rules. Experiments have included rules using data from:
- location reports from household mobile devices
- weather information from the UK Meteorological Office data service

The controller can be used stand-alone without being connected to the
internet, though we have found the real power of Hotpot is in the ability is
control the system remotely from a web browser. This means the system
need never be heating the house when nobody is home, and it's easy to boost
the heating in anticipation of a warm house and a hot shower when you
are about to head home.

Unlike commercial alternatives, such as Google Nest, no third-party
servers are involved, and only simple low-cost hardware is required.
All the parts can be purchased for around £40.

# Installation

## Assumptions

The following assumes a [standard Y-plan](https://boilerboffin.com/how-does-a-y-plan-heating-system-work/)
central heating system. This used to be the most common type of system, though
there are more modern alternatives.

It's also assumed that you have some way to access your Pi from the
internet. This is simplest if you have a router with a fixed IP
address that can be programmed to forward incoming requests to the
Pi. There are so many possible hardware options and configurations
that you will have to work this bit out for yourself.

## Hardware

Aside from the Raspberry Pi, the only additional hardware required are
two DS18x20 one-wire temperature sensors, and a couple of relays -
SRD-05VDC-SL-C relays are ideal for this. See the
[general wiring diagram](https://raw.githubusercontent.com/cdot/Hotpot/master/Hardware/Mains.svg)
for details of the mains level wiring, and the [circuit diagram](https://raw.githubusercontent.com/cdot/Hotpot/master/Hardware/Circuit.svg) which gives a schematic overview.

The wiring of the temperature sensors and the control side of the relays
is shown in the [Pi pinout diagram](https://raw.githubusercontent.com/cdot/Hotpot/master/Hardware/5V-3.5V%20control.svg).

If you follow the described wiring the existing thermostats are kept
in series with the Hotpot relays. Hotpot is designed such that if the
relays are left unpowered, the existing thermostats are still in place.
This way the traditional controller remains as a backup. Make sure
the traditional thermostats are kept at sensible levels.

The wiring shown capitalises on the fact that when the controller for a
Y-plan system is powered on, but set to "off", the "Hot water off"
control line is held high (at 250V). This means we can draw the power
for the Pi from that line if the existing controller is set to "off".

Alternatively you can power the Pi from a separate power source if you
choose to do so. In this case you have the option of keeping the existing
controller "live" and using it as a backup in case the Pi fails. 

Note that the motorised valve in a Y-plan system is a very clever piece of
design that uses the minimum number of components to fulfil its function.
This does mean that [there is a state the valve can get into](https://raw.githubusercontent.com/cdot/Hotpot/master/Hardware/Mid%20position%20explanation.svg) which causes
the valve to draw power continuously when both hot water and heating are off.
While the valve is designed for it, and the power consumption is low (a few watts),
Hotpot is designed to eliminate this state.

Once your hardware is set up you can use the test programs in `server/test` to check hardware functionality: `testGpio.js` will let you query and set GPIO pins, while `testDS18x20` will let you query temperature sensors.

Note that there have been isolated cases where Raspbian has "frozen"
leaving the OS dead but the GPIO powered up. It can be resolved by power-cycling the Pi,
but there is nothing in the logs to indicate a problem. If anyone has a solution
to this, please raise an issue or a pull request on github.

## Software

### Enable OS support for 1-wire

The following assumes you are using a Linux distribution on your
Pi. At time of writing [DietPi](https://dietpi.com/) is a good choice
as it's small.

The Hotpot server is implemented using node.js, version 11.15.0 (at
time of writing this is the version installed with DietPi). This is
the only version that has been tested. If you have a different version
of `node.js` installed, you can always use `nvm` to switch between
versions.

DS18x20 temperature sensors use a 1-wire bus that allows multiple
sensors to be daisy-chained on a single GPIO pin. GPIO 18 (header pin
12) is the pin used in all the examples. Whatever pin you choose has
to be set in `/boot/config.txt` as follows:

```
# 1-wire settings
dtoverlay=w1-gpio,gpiopin=18
```
Add the following to `/etc/modules-load.d/modules.conf`
(or the appropriate alternative on your distribution) to load the drivers
on boot.
```
w1-gpio
w1-therm
```
Reboot your Pi and log in. You should now be able to see what 1-wire sensors
are attached to the system using:
```
$ ls /sys/bus/w1/devices/w1_bus_master1
```
Expect to see devices such as `28-0316027f81ff`

Note that there are issues with the 1-wire driver with multiple sensors
being asynchronously accessed. The w1 driver seems to get confused by
multiple overlapping requests. There are three things that can be done to
overcome this:
- Use a 5V Vdd to supply the DS18b20s. The signal line must still be pulled up to 3.3V, however (don't pull it to 5V or you'll fry the GPIO)
- Disable IRQs in the `wire` module (`sudo sh -c "echo options wire disable_irqs=1 >> /etc/modprobe.d/wire.conf"` and reboot)
- 

### Set up a user

Select a user to run the server. This could be the `root` user on your
Pi, or the default user (usually e.g. `pi` or `dietpi`), or
(recommended) you can create a special user to run the server
software. In the following we will assume you have created a
user `hotpot`.

You can check if your user has access to the gpio by logging in as them and:
```
$ cat /sys/bus/w1/devices/28-0316027f81ff/w1_slave
```
(substitute the id of one of your sensors for `28-0316027f81ff`). This
should tell you the temperature currently being reported by the sensor.

If your user doesn't have access, you can add them to the gpio group.
```
$ sudo adduser hotpot gpio
```

### Service startup script

On systems that use `systemd`, as root, create `/etc/systemd/system/hotpot.service` with
content:
```
[Unit]
Description=Hotpot
After=network.target

[Service]
Type=simple
Restart=always
LogsDirectory=hotpot
User=hotpot
WorkingDirectory=~
ExecStart=node Hotpot/server/js/Hotpot.js --config hotpot.cfg
Nice=2

[Install]
WantedBy=multi-user.target
```
Still as root,
```
# systemctl daemon-reload
# systemctl enable hotpot
```
You should see a link being created. Then
```
# systemctl start hotpot
```
should start the service.

### Configure Hotpot

The controller uses rules written as Javascript functions to control
the temperature of the different services offered by the central heating
system. It runs a HTTP(S) server that supports querying and changing the
configuration of the system from a browser.

The easiest way to install the software is to clone the git repository
direct from github, then run the server install:
```
$ git clone https://github.com/cdot/Hotpot.git
$ (cd Hotpot/server; npm install)
```
The server can then be run as follows:
```
node Hotpot/server/js/Hotpot.js <options>
```
Pass `--help` on the command-line to see the options e.g.
```
$ node Hotpot/server/js/Hotpot.js --help
  -h, --help        Show this help
  -c, --config=ARG  Configuration file (default ./hotpot.cfg)
  -C, --confhelp    Configuration file help
  -t, --trace[=ARG] Trace module e.g. --trace all
  -d, --debug       Run in debug mode - uses stubs for missing hardware
```
Note that the server can only be run on platforms that do not have
gpio hardware if you have enabled the `--debug` option. In this case
the missing sensors will be simulated.

The server is configured by Javascript read from a file (default
`./hotpot.cfg`). The repository has an
[annotated example](https://github.com/cdot/Hotpot/blob/master/hotpot.cfg).

Once the server is running, the HTTP interface can be used to query
and modify the configuration. If the server configuration is changed
from the browser interface, the configuration file will be
automatically saved.

# Configuration

## Rules

Rules are Javascript functions that are able to adjust settings via the
controller.

Rule functions can interrogate any part of the system using the internal APIs.
Default rules are given for [Hot Water](https://github.com/cdot/Hotpot/blob/master/server/js/HotWaterRule.js) and
[Central Heating](https://github.com/cdot/Hotpot/blob/master/server/js/CentralHeatingRule.js). You can derive your own
rules and point your hotpot.cfg at them.

Rules should always contain conditions to stop runaway temperature rises
and freezing.

## Histories

System change events, such as temperature and pin state, can be logged to files
for later analysis. There is no limit on the size of these files, and you are
recommended to rotate them on a regular basis. When a log is rotated make sure the old log is deleted - you don't want to leave an empty file behind.

Histories can either be sampling - such as temperatures - or logging, such as pin states or weather agents. Sampling histories require an interval to be specified to set how often the item is sampled. Logging histories rely on the caller explicitly logging events.

## Weather

Weather information can be retrieved from the UK Meteorological Office data service, via a simple API that can easily be overridden with your own weather service provider. The class "MetOffice" is the reference implementation.

An API key is required to access weather information from the Met Office. These
are available for free.

The weather feature is considered experimental, and is likely to change. It's
up to you how you use weather information in the rules; the default rules
don't use it.

## Calendars

Hotpot can interface to any number of Calendars. By default only Google Calendar
is supported, but the software is designed to make it easy to add alternatives.

### Setting up a Google calendar

Follow the instructions in https://developers.google.com/google-apps/calendar/quickstart/nodejs for configuring the calendar API.

Open the downloaded `client_secret` file and copy the following fields:
```
     client_id: "738956347299-catel312312sdfafj546754ajfghph3n.apps.googleusercontent.com",
     client_secret: "XAfsu6askjhqweo391d6s6ZD",
     redirect_uris: [ "urn:ietf:wg:oauth:2.0:oob", "http://localhost" ]
```
Create a calendar in `hotpot.cfg` e.g.
```
calendar: {
  "Example": {
   id: "primary",
   secrets: {
   },
   auth_cache: "./example.auth"
  }
}
```
Paste the copied fields from `client_secret` into the `secrets` object. The `primary` id will access your main calendar. The `testCalendars.js` command-line program in the `server/test` subdirectory can be used to list all the available calendars.

`cd` to the `server` subdirectory and run the command-line program `node AuthoriseCalendar.js` and follow the instructions. Note that this requires an existing `hotpot.cfg`.

Calendars are cached and updated as required. An update can be forced at any time by sending a `/refresh_calendars` request to the server.

### Controlling Hotpot from the calendar

The rules described above can be overridden by events in a calendar which
contain special requests in the event summary or description. The format of
requests is `hotpot: <thermostat> = <temperature>` where
`<thermostat>` is the name of a thermostat in `hotpot.cfg` (e.g. `HW` or `CH`) 
and `<temperature>` is a target temperature in °C. For example, `hotpot:CH=18`
instructs the server to set a target of 18°C for the CH thermostat for the duration
of the calendar event. Note that requests are case-sensitive.

`ALL` applies the request to all thermostats. It is
usually used to turn everything off, for example when away on holiday
e.g. `hotpot:ALL=0`.

You can also define an event to boost a thermostat up to a target temperature,
and then revert to the rules after it has been reached, by adding the keyword
`boost`. For example, `hotpot:CH=20 boost` will switch on the central heating
until the temperature reaches 20°C and then revert to the rules.

You can mix commands for different thermostats in a single event by separating
them with semiclons e.g. `hotpot:CH=16 boost;HW=45`

Calendar events are only used to generate requests. It is ultimately up to the
rules functions whether and how those requests are interpreted.

I recommend you create a specific calendar for Hotpot control, in
which case all events in the calendar are assumed to relate to Hotpot. This is
useful when yo uwant to share control over the system with other people.
In this case you can modify the `hotpot.cfg` to dispense with the `hotpot:`
prefix.

# Browser App

The browser app is served automatically when `/index.html` is loaded from
a browser. The app provides control and monitoring capabilities from a web
interface that can be used fom desktops, laptops, tablets and smartphones.

The interface includes full help information.

# Development

The Hotpot software is designed to be extended through the addition of new rules, calendars, and weather agents. You are very welcome to submit any code you develop
as a pull request on github.

## Running a Debug Server
```
$ cd Hotpot/server/test
$ node ../js/Hotpot.js --debug --trace all -c simulated_hotpot.cfg
```
This will start a debug server listening on localhost:13196 with full tracing.
In a web browser on localhost, load http://localhost:13196/

Trace output is written to STDOUT by default. You can also configure it to
write tracing to a file in `hotpot.cfg`.

All trace and debug statements are tagged with the time and the module e.g 
```
2016-08-13T08:37:08.694Z Server: HTTP starting on port 13196
```
You can choose just to monitor just particular modules e.g. `--trace=Server`,
or you can enable `all` and then choose which modules to *ignore* by prepending a minus sign e.g. `--trace=all,-Historian,-Server`

## Unit Tests

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
## AJAX interface

The browser interface uses an AJAX interface to the server to gain access
to the functions of the controller.

### `/ajax/getconfig`
Will retrieve the configuration of the controller (JSON)

### `/ajax/setconfig`
Set a configuration item. The usage of this is risky and complex, you
are recommended to read the code to understand it.

### `/ajax/state`
Retrieves the current state of the controller (JSON)

### `/ajax/trace?trace=`
Set the trace level of the server

### `/ajax/log`
Retrieve all logs. Add `/{thermostat|pin|weather}` to retrieve logs for those service types. Add `/{thermostat|pin|weather}/{name}` to retrieve logs for a specific service e.g. `/ajax/log/thermostat/CH`.

### `/ajax/request?source=;service=;target=;until=`
Adds a request on behalf of the given `source` (an arbitrary string) for the given `service`, asking for the given `target` temperature. The request will remain active until the time given in `until` (epoch seconds). Passing `until=boost` will make it a boost request (see "Controlling Hotpot from the calendar" above for more about boost requests).

### `/ajax/refresh_calendars`
Force a calendar refresh from the calendar server(s), useful if an event has been added/removed from the calendar (there is no support for push notifications)
