# Hotpot

Central heating controller for a Y-plan central heating system, using
node.js on Raspberry Pi. Piggybacks on the existing system so that the existing
controller can still be used (though not at the same time).

The controller collates data from a number of sources to support rules that
decide if the heating needs to come on.
- Any number of DS18x20 temperature sensors, usually one for heating (CH) and one for hot water (HW), connected to GPIO.
- Any number of mobile devices running the 'Hotpot' Android app, reporting their location,
- Any number of web browsers talking to the controller,
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
    * `fences` - list of geofences. See **GeoFences**, below.
  * `calendar` - sets up calendars
    * `id` - work this out
  * `rule` - list of rules that are used to control state of the system. Rules can be specified inline in a function, or can be specified as a filename that is to be compiled. Rules are executed in the order they are specified. See **Rules**, below.

See server/example.hotpot.cfg for a complete example.

## Weather
Weather information is retrieved from the UK Meteorological Office data service, via a simple API that can easily be overridden with your own weather service provider. The class "MetOffice" is the reference implementation.

An API key is required to access weather information from the Met Office. These
are available for free.

## Routing

Routing support allows a more accurate estimate to be made of the time a mobile device will arrive back home.When a mobile device triggers a fence (see **Fences**, below) then an estimate is made of the earliest time that the device will return home. If routing is enabled, then the Google Maps routing API will be used to improve the accuracy of that estimate. Otherwise a simple `crow-flies-distance / speed` estimate is used.

To enable the routing API:
* Go to the Google API console
* Click on "Credentials"
* Add a server key, with your server's IP address
(If your server changes IP address on a regular basis e.g. your IP provider
uses DHCP, you can set a random IP address and then set Hotpot up to use
that random IP address in requests)
* Go to "Overview" and enable the Maps Directions API
* Set the API key in your server's Hotpot configuration

## GeoFences

GeoFences are used by mobile devices to signal to the server when the device has come within a specific distance of the home. The server uses these signals to estimate the likely return time of a mobile device. Each fence is given as a name, and a number of metres from the home server to set the fence.

Use of fences means that the minimum of power and network bandwidth is used by the mobile device to report its location.

## Rules

Rules are Javascript functions associated with thermostats.
```Javascript
function rule()
'this' is the Controller object
```
Each function is called in in a polling loop, and it it returns true,
the evaluation will stop. Rule functions are called with 'this' set to
the Controller.

Rule functions can interrogate any part of the system using the internal APIs. A full list of APIs can be generated using `make doc`.

Annotated example rules are given for Hot Water `server/hw_rules.json` and Central Heating `server/ch_rules.json`.

# Browser interface

The browser interface is a low-level debugging tool that gives access to the
functions of the controller using AJAX requests to the server. It can also
be used to review temperature logs and mobile status.

# Mobiles

Hotpot includes an Android app that can be run on a mobile device to report
the location of that device back to the Hotpot server. 
Mobile devices report their location to the server, which then uses the
Google maps routing API to estimate when the mobile will get home, based on
the location, speed and direction of the device.

The Hotpot server rules can use the estimated return time to decide whether
to enable services or not. Mobiles can also demand an override, if the rules
allow it.

# Calendars

