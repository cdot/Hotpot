# Hotpot

Central heating controller for a Y-plan central heating system, using
nodejs on Raspberry Pi. Piggybacks on the existing system so that the existing
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

# Software

The controller uses rules defined in javascript functions to control
the temperature of the different services offered by the central heating
system. It runs a HTTP(S)
server that supports querying and changing the configuration of the system
via AJAX requests.

## Configuring the Server

The server is run as follows:
```
$ cd server
$ nodejs Hotpot.js
```
The server is configured by Javascript read from the file
./hotpot.cfg. After the initial setup, the HTTP interface
can be used to query and modify the configuration.

The server is configured from a configuration file
in ./hotpot.cfg (you can change this using a command-line option). This contains a structured Javascript object
with contents as follows:
- server - sets up the HTTP(S) server
  - ssl (optional) HTTPS key server private key and certificate. If no key and cert are given, an HTTP server will be used, otherwise it will be HTTPS.
  - port - the network port to use (default is 13196)
  - location - sets the latitude and longitude of the home location
- apis - sets up public API keys
  - weather - sets up access to the weather server (see "Weather" below).
  - google_maps - sets up access to Google maps (see "Routing" below).
- controller
  - thermostat - sets up the DS18X20 thermostats available to the system. Each thermostat is named, and has:
    - id - used to communicate with the sensor
    - poll_interval - (optional) gap between polls, in ms (1000)
    - history (optional)
      - file - (required) pathname to file to store history for this thermostat
      - interval - gap between history snapshots, in s (60 i.e. once every minute)
      - limit (optional, if not given then maxbytes is required) number of snapshots to keep in history file. At least this many, and on occasion up to 2X as many, snapshots will be stored (24 * 60)
      - maxbytes (optional, if not specified then limit and interval are required) can be specified to limit the size of the history file to a certain number of bytes. If not given, history is limited by 'limit' and 'interval'.
  - pin - sets up the GPIO pins, mapping the pin name to the GPIO pin number
    - history (optional) sets up a history log recording the pin state. See thermostat->history above for details.
  - mobile - sets up the mobiles, each name maps to the unique ID of the mobile
  - rule - list of rules that are used to control state of the system

See server/example.hotpot.cfg for a complete example.

Note that the pin names "HW" and "CH" are predefined, as Y-plan systems have
some dependencies between them.

## Rules

Rules are Javascript functions associated with thermostats.
```Javascript
function rule()
'this' is the Controller object
```
Each function is called in in a polling loop, and it it returns true,
the evaluation will stop. Rule functions are called with 'this' set to
the Controller.

Rule functions can interrogate any part of the system using the internal APIs. A full list of APIs can be generated using the enclosed Makefile.

# Browser interface

The browser interface is a low-level debugging tool that gives access to the
functions of the controller using AJAX requests to the server.

# Mobiles

Hotpot includes an Android app that can be run on a mobile device to report
the location of that device back to the Hotpot server. 
Mobile devices report their location to the server, which then uses the
Google maps routing API to estimate when the mobile will get home, based on
the location, speed and direction of the device.

The Hotpot server rules can use the estimated return time to decide whether
to enable services or not. Mobiles can also demand an override, if the rules
allow it.

# Routing

For routing to work, the server has to have access to the Google Maps API.

* Go to the Google API console
* Click on "Credentials"
* Add a server key, with your server's IP address
(If your server changes IP address on a regular basis e.g. your IP provider
uses DHCP, you can set a random IP address and then set Hotpot up to use
that random IP address in requests)
* Go to "Overview" and enable the Maps Directions API
* Set the API key in your server's Hotpot configuration

# Weather
Weather information is retrieved from the UK Meteorological Office data service, via a simple API that can easily be overridden with your own weather service provider. The class "MetOffice" is the reference implementation.

An API key is required to access weather information from the Met Office. These
are available for free.
