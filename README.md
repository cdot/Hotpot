# Hotpot

Hotpot is a controller for a Y-plan central heating system, using
node.js on Raspberry Pi. It piggybacks on the existing system so that the existing
controller can still be used (though not at the same time).

The controller collates data from a number of sources to support user-defined
rules to decide whether the heating needs to come on.
- Any number of DS18x20 temperature sensors, usually one for heating (CH) and one for hot water (HW), connected to GPIO
- A detailed timeline that allows fine control over target temperatures
- Any number of Google calendars
- Weather information from the UK Meteorological Office data service.

The controller can also be accessed and manually controlled from a web browser.

# Installation

## Hardware

Aside from the Raspberry Pi, the only additional hardware required are two
DS18x20 temperature sensors, and two relays. A dual SRD-05VDC-SL-C relay module
is ideal for this. The wiring capitalises on the fact that when the controller
for a Y system is powered on, but set to "off", the "Hot water off" control line
is held high (at 250V). See the [wiring diagram](Hardware/Mains.svg) for details
of the mains level wiring.

The wiring of the temperature sensors and the control side of the relays is
the [[pinout diagram](Hardware/5V-3.5V control.svg).

If you follow my wiring, it is safe to continue to use the existing controller
and thermostats. It is designed such that if the relays are left unpowered, the
system defaults to the existing controller.

Note that if your existing thermostats are set to a lower temperature than
required by Hotpot, then the thermostats will always win. 

I recommend either switching the existing controller to an "always on" state, 
or programming in a simple schedule that ensures hot water and central heating
are "on" during the time Hotpot is likely to be managing the temperature. This
way if Hotpot fails for any reason, the original controller takes over. Ensure
that existing thermostats are kept at sensible levels.

## Software

### Enable OS support for 1-wire

DS18x20 temperature sensors use a 1-wire bus that allows multiple sensors
to be daisy-chained on a single GPIO pin. I use GPIO 18 (header pin 12) for
this. Configure the operating system as follows.

First, the pin used for the 1-wire temperature sensors has to be set in
`/boot/config.txt`:

```
# 1-wire settings
dtoverlay=w1-gpio,gpiopin=18
```
Add the following to `/etc/modules-load.d/modules.conf`
(or the appropriate alternative on your distribution) to load the drivers.
```
w1-gpio
w1-therm
```
Reboot your Pi and log in. You should now be able to see what 1-wire sensors
are attached to the system using:
```
$ ls /sys/bus/w1/devices/w1_bus_master1
```
Expect to see devices such as '28-0316027f81ff'.

### Set up a user

Select a user to run the server. This could be the `root` user on your Pi, or the default user (usually e.g. `pi` or `dietpi`), or you can create a special user to run the server software (recommended). In the following we will assume you have created a special user `hotpot`.

You can check if your user has access to the gpio by logging in as them and:
```
cat /sys/bus/w1/devices/28-0316027f81ff/w1_slave
```
(substitute the id of one of your sensors for `28-0316027f81ff`). This should tell you the temperature currently being reported by the sensor.

If your user doesn't have access, you can add them to the gpio group.
```
sudo adduser hotpot gpio
```
The Hotpot server is implemented using node.js, version 11.15.0 (at time of
writing this is the most recent version available for the RPi). This is
the ony version that has been tested. If you have a different version of
`node.js` installed, you can always use `nvm` to switch between versions.

### Service startup script

If you are using a Debian-based OS, you can customise the included 'environment/init.d_hotpot' script to assist with starting and stopping the service. The script is placed in /etc/init.d and will automatically start the service after every reboot.
```
chmod +x /etc/init.d/hotpot 
update-rc.d hotpot defaults
```
Other distributions will offer similar functionailty.

### Configure Hotpot

The controller uses rules written as Javascript functions to control
the temperature of the different services offered by the central heating
system. It runs a HTTP(S) server that supports querying and changing the
configuration of the system from a browser.

The easiest way to install the software is to clone the git repository
direct from github, then run the server install:
```
git clone https://github.com/cdot/Hotpot.git
(cd Hotpot/server; npm install)
```
The server can then be run as follows:
```
node Hotpot/server/js/Hotpot.js <options>
```
Pass --help on the command-line to see options e.g.
```
$ node Hotpot/server/js/Hotpot.js --help
  -h, --help        Show this help
  -c, --config=ARG  Configuration file (default ./hotpot.cfg)
  -C, --confhelp    Configuration file help
  -t, --trace[=ARG] Trace module e.g. --trace all
  -d, --debug       Run in debug mode - uses stubs for missing hardware
```
Note that the server can only be run on platforms that do not have gpio hardware if you have enabled the `--debug` option. In this case the missing sensors will be simulated.

The server is configured by Javascript read from a file (default `./hotpot.cfg`). You can find an annotated example in `Hotpot/hotpot.cfg`.

Once the server is running, the HTTP interface can be used to query and modify
the configuration. If the server configuration is changed from the browser interface, the configuration file will be automatically saved.

# Configuration

## Histories

System change events, such as temperature and pin state, can be logged to files
for later analysis. There is no limit on the size of these files, and you are
recommended to rotate them on a regular basis. When a log is rotated make sure the old log is deleted - you don't want to leave an empty file behind.

Histories can either be sampling - such as temperatures - or logging, such as pin states or weather agents. Sampling histories require an interval to be specified to set how often the item is sampled. Logging histories rely on the caller explicitly logging events.

## Weather

Weather information can be retrieved from the UK Meteorological Office data service, via a simple API that can easily be overridden with your own weather service provider. The class "MetOffice" is the reference implementation.

An API key is required to access weather information from the Met Office. These
are available for free.

The weather feature is considered experimental, and is likely to change.

## Rules

Rules are Javascript functions that are able to adjust settings via the
controller.

Rule functions can interrogate any part of the system using the internal APIs.
Default rules are given for Hot Water `server/js/HotWaterRule.js` and
Central Heating `server/js/CentralHeatingRule.js`. You can derive your own
rules and point your hotpot.cfg at them.

Rules should always contain conditions to stop runaway temperature rises
and freezing.

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
Paste the copied fields from `client_secret` into the `secrets` object. The `primary` id will access your main calendar. The `node TestCalendars.js` command-line program in the `test` subdirectory can be used to list all the available calendars.

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

`ALL` is a meta-themostat that will apply the request to all thermostats. It is
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

A recommended option is to create a specific calendar for Hotpot control, in
which case all event in the calendar are assumed to relate to Hotpot. This is
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
cd Hotpot/server/test
node ../js/Hotpot.js --debug --trace all -c simulated_hotpot.cfg
```
This will start a debug mini-web-server listening on port 13196 with full tracing

In a web browser on localhost, load http://localhost:13196/

You can control tracing statements so you can follow the activity in
the server on the console. All trace and debug statements are tagged with the
time and the module e.g 
```
2016-08-13T08:37:08.694Z Server: HTTP starting on port 13196
```
You can choose just to monitor just particular modules e.g. `--trace=Server`,
or you can enable `all` and then choose which modules to *ignore* by prepending a minus sign e.g. `--trace=all,-Historian,-Server`

There are a number of unit test module scattered around the code; these are all
named using the `UnitTest` prefix. They can all be run stand-alone; e.g.
```
hotpot@pi:~/Hotpot/common/test$ node UnitTestDataModel.js 

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

The AJAX interface to the server gives access to the functions of the controller.
It can be used to review temperature logs, and perform simple overrides such as
boosting temperature. Requests are sent to the server as GET requests.

### `/ajax/config`
Will retrieve the configuration of the controller (JSON)

### `/ajax/reconfig`
Will write a new config. Doesn't restart the server, just saves the current configiuration to `hotpot.cfg`

### `/ajax/state`
Retrieves the current state of the controller (JSON)

### `/ajax/log`
Retrieve all logs. Add `/{thermostat|pin|weather}` to retrieve logs for those service types. Add `/{thermostat|pin|weather}/{name}` to retrieve logs for a specific service e.g. `/ajax/log/thermostat/CH`.

### `/ajax/request?source=;service=;target=;until=`
Adds a request on behalf of the given `source` (an arbitrary string) for the given `service`, asking for the given `target` temperature. The request will remain active until the time given in `until` (epoch seconds). Passing `until=boost` will make it a boost request (see "Controlling Hotpot from the calendar" above for more about boost requests).

### `/ajax/refresh_calendars`
Force a calendar refresh from the calendar server(s), useful if an event has been added/removed from the calendar (there is no support for push notifications)

### `/ajax/restart`
Restarts the server.


perl -e 'print `date +%s`*1000 - 48*60*60*1000;'
