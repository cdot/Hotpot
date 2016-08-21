# Hotpot

Central heating controller for a Y-plan central heating system, using
node.js on Raspberry Pi. Piggybacks on the existing system so that the existing
controller can still be used (though not at the same time).

The controller collates data from a number of sources to support rules that
decide if the heating needs to come on.
- Any number of DS18x20 temperature sensors, usually one for heating (CH) and one for hot water (HW), connected to GPIO.
- Any number of mobile devices running the 'Hotpot' Android app,
- Any number of Google calendars,
- Any number of web browsers talking directly to the controller,
- Weather information from the UK Meteorological Office data service.

The controller supports user-defined rules that use this information to set the state of RPi GPIO pins to turn on the relevant heating control.

# Hardware

Aside from the Raspberry Pi, the only additional hardware required are two DS18x20 temperature sensors, and two relays. A dual SRD-05VDC-SL-C relay module is ideal for this. The wiring capitalises on the fact that when the controller for a Y system is powered on, but set to "off", the "Hot water off" control line is held high (at 250V). See Mains.svg for details of the mains level wiring.

The wiring of the temperature sensors and the control side of the relays is shown in 5V-3.5V control.svg

## Configuring the Hardware

The included diagram "5V-3.5V control.svg" shows the wiring I use. Note that the
pin used for the temperature sensors has to be changed in /boot/config.txt,
thus:

```
# 1-wire settings
dtoverlay=w1-gpio,gpiopin=18
```
You can see what sensors are configured using 
```
ls /sys/bus/w1/devices/w1_bus_master1
```
Expect to see devices such as 28-0316027f81ff

# Server Software

The controller uses rules defined in javascript functions to control
the temperature of the different services offered by the central heating
system. It runs a HTTP(S) server that supports querying and changing the
configuration of the system via AJAX requests from a browser or mobile
device.

The server is implemented using node.js. RPi will require an upgrade to the latest version, thus
```
sudo npm cache clean -f
sudo npm install -g n
sudo n stable
```

## Configuring the Server

The server is run as follows:
```
$ cd server
$ node Hotpot.js
```
The server supports command-line options as follows:
```
  -h, --help        Show this help
  -c, --config=ARG  Configuration file (default ./hotpot.cfg)
  -d, --debug=ARG   Run in debug mode e.g. --debug all
```
All debug statements are tagged with the time and the module e.g 
```
2016-08-13T08:37:08.694Z Server: HTTP starting on port 13196
```
You can choose just to monitor just particular modules e.g. `--debug=Server`,
or you can enable `all` and then choose which modules to *ignore* by prepending a minus sign e.g. `--debug=all,-Historian,-Server`

The server is configured by Javascript read from a file (default `./hotpot.cfg`)After the initial setup, the HTTP interface can be used to query and modify
the configuration. Every time the server configuration is changed, it will
automatically save the configuration file.

An example configuration file is given in `example.hotpot.cfg`. The
configuration file contains a structured Javascript object with fields
as follows:
* `server` - sets up the HTTP(S) server
  * `ssl` (optional) HTTPS key server private key `key` and certificate `cert`.
   If no private key and certificate are given, an HTTP server will be used.
  * `port` - the network port to use (default is 13196)
  * `location` - sets the latitude and longitude of the home location
* `apis` - access keys etc. for public API keys
  * `weather` - sets up access to the weather server (see **Weather** below).
  * `google_maps` - sets up access to Google maps (see **Routing** below).
* `controller`
  * `thermostat` - sets up the DS18X20 thermostats available to the system. This object is indexed by the (user-assigned) name of the thermostat. Each thermostat has:
    * `id` - used to communicate with the sensor
    * `poll_interval` - (optional) gap between polls, in ms (default 1000)
    * `history` (optional)
      * `file` - (required) pathname to file to store history for this thermostat
      * `interval` - gap between history snapshots, in seconds (default 60 i.e. once every minute)
      * `limit` (optional, if not given then maxbytes is required) number of snapshots to keep in history file. At least this many, and on occasion up to 2X as many, snapshots will be stored (24 * 60)
      * `maxbytes` (optional, if not specified then `limit` and `interval` are required) can be specified to limit the size of the history file to a certain number of bytes.
  * `pin` - sets up the GPIO pins, mapping the pin name to the GPIO pin number. The pin names `HW` and `CH` have special support to take account of a subtle dependency in Y-plan systems, but otherwise pin names are up to the user.
    * `history` - (optional) sets up a history log recording the pin state. See `thermostat.history` above for details.
  * `mobile` - sets up the mobiles, each name maps to:
    * `id` - the unique ID of the mobile e.g. the Android device identifier. `debug` is used for browsers.
  * `calendar` - sets up calendars
    * `id` - name of th calendar e.g. `primary`
    * `auth_cache`: pathname of a file on the server used to cache the authentication for this calendar
    * `secrets` - secrets used by Google calendar (see Setting up calendars, below)
  * `rule` - list of rules that are used to control state of the system. Rules can be specified inline in a function, or can be specified as a filename that is to be compiled. Rules are executed in the order they are specified. See **Rules**, below.

See server/example.hotpot.cfg for a complete example.

## Weather
Weather information is retrieved from the UK Meteorological Office data service, via a simple API that can easily be overridden with your own weather service provider. The class "MetOffice" is the reference implementation.

An API key is required to access weather information from the Met Office. These
are available for free.

## Rules

Rules are Javascript functions associated with thermostats.
```Javascript
function rule()
'this' is the Controller object
```
Each function is called in in a polling loop, and it it returns true,
the evaluation will stop. Rule functions are called with 'this' set to
the Controller.

Rule functions can interrogate any part of the system using the internal APIs. Annotated example rules are given for Hot Water `server/hw_rules.json` and Central Heating `server/ch_rules.json`.

# Browser interface

The browser interface is a low-level debugging tool that gives access to the
functions of the controller using AJAX requests to the server. It can also
be used to review temperature logs and mobile status. The following URL requests
are available:

* `/config` - retrieve the configuration of the server (JSON)
* `/state` - retrieve the current state of the server (JSON)
* `/log/{type}/{name}` - retrieve type `pin`, `thermostat`, or `weather` logs, or all logs if `{type}/{name}` is not given (or all `{type}` logs if `{name}` is not given)
* `/apis` - retrieve all the apis (JSON)
* `/remove_rule/{index}` - remove the rule at {index}
* `/move_up/{index}` - move the rule at {index} up one place
* `/move_down/{index}` - move the rule at {index} down one place
* `/set/pin/{name}?value=` - set the pin state/ Not very useful, as this setting
  will quickly be overridden by rules / requests.
* `/set/rule/{index}/name?value=` - set a rule name
* `/set/rule/{index}/test?value=` - set a rule test function
* `/request?source={name};pin={name};state={1|1|2};until={epoch}` - set a request on behalf of the given source for the given pin, asking for the given state. The request will (optionally) remain active until the given date.
* `/refresh_calendars` - force a calendar refresh from google

# Calendars

Hotpot can be controlled by any number of Google calendars linked to the app.

## Setting up a calendar
Follow the instructions in https://developers.google.com/google-apps/calendar/quickstart/nodejs for configuring the calendar API.

Open the downloaded `client_secret` file and copy the following fields:
```
     clientid: "738956347299-catel312312sdfafj546754ajfghph3n.apps.googleusercontent.com",
     clientsecret: "XAfsu6askjhqweo391d6s6ZD",
     redirecturis: [ "urn:ietf:wg:oauth:2.0:oob", "http://localhost" ]
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
Paste the copied fields from `client_secret` into the `secrets` object.

Run the command-line program `node authorise_calendar.js` and follow the instructions.

Calendars are cached and updated every 24 hours. An update can be forced by visiting `/refresh_calendars` to the server.

## Controlling Hotpot from the Calendar
Hotpot is controlled by events in the calendar which contain special commands in the event summary or description. For example, `Hotpot:HW=on` will raise a request for Hotpot to turn the hot water on for the duration of the event. Requests are handled in the rules - see `hw_rules.json` for an example.

The format of commands is `Hotpot:PIN=STATE` where `PIN` can be the name of a pin in `hotpot.cfg` (e.g. `HW` or `CH`) and `STATE` can be a number (0=off, 1=on, 2=boost) or one of the commands `on`, `off` or `boost`. `ALL` is special pin that will apply the command to all pins.

Note that calendar events are only used to generate requests. It is up to the
rules whether and how those requests are interpreted.
