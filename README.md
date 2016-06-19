# Hotpot

Central heating controller for a Y-plan central heating system, using
nodejs on Raspberry Pi. Piggybacks on the existing system so that the existing
controller can still be used (though not at the same time).

The controller collates data from a number of sources to support rules that
decide if the heating needs to come on.
- Any number of DS18x20 temperature sensors, usually one for heating (CH) and one for hot water (HW), connected to GPIO.
- Any number of mobile devices running the 'Hotpot' Android app, reporting their location,
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
system. It can operate either as a stand-alone controller or as an HTTPS
server that supports querying and changing the configuration of the system.

The server is initially configured from options read from a file in
$HOME/.config/Hotpot/config.json. After the initial setup, the HTTPS interface
can be used to query and modify the configuration.

## Configuring software

The server is configured from a configuration file
in ~/.config/Hotpot/config.json

Example configuration file:
```Javascript
{
  "server": {
    key: "$HOME/.config/Hotpot/hotpot.key",
    cert: "$HOME/.config/Hotpot/hotpot.crt",
    "port": 13196,
    "favicon": "$HOME/Hotpot/browser/images/favicon.ico",
    "google_maps": {
      "api_key": "Aizg4asuu0982343jkjk--qwiuoie3rfui12jd",
      "ip": "46.208.108.90"
    },
    "weather": {
      "class" : "MetOffice",
      "api_key": "f6234ca5-e643-4333-8fdf-59f2123446ed",
    },
    "location": {
      "latitude": 52.2479773,
      "longitude": -1.504296
    }
  },
  "controller": {
    "thermostat": {
      "HW": {
        "id": "28-0113414ef5ff"
      },
      "CH": {
        "id": "28-0eee027581ff"
      }
    },
    "pin": {
      "CH": {
        "gpio": 23
      },
      "HW": {
        "gpio": 25
      }
    },
    "mobile": {
      "Crawford": {
        "id": "3e19118c5e36d420"
      }
    }
    "rule": [
      {
          "name" : "normal",
          "test":
function () {
    var ch = this.pin.CH.getState(), hw = this.pin.HW.getState();
    if (this.mobile.George.isReporting()
        && this.mobile.George.arrivesIn() > 30 * 60) {
        ch = 0; hw = 0; // more than 30 minutes away
    }
    if (this.weather("Feels Like Temperature") > 14) {
        ch = 0; // warm enough
    }
    if (Time.between('22:00', '06:30')) {
        ch = 0; // night
    }
    if (Time.between('20:00', '06:30')) {
        hw = 0; // night
    }
    if (this.thermostat.CH.temperature > 18) {
        ch = 0; // warm enough
    }
    if (this.thermostat.HW.temperature > 50) {
        hw = 0; // hot enough
    }
    this.setPin("CH", ch);
    this.setPin("HW", hw);
}
      }
    ]
  }
}
```
- server - sets up the HTTP(S) server
  - HTTPS key server private key and certificate. If no key and cert are given, an HTTP server will be used, otherwise it will be HTTPS.
  - port the network port to use (default is 13196)
  - favicon icon to use in the browser
  - weather sets up access to the weather server, class "MetOffice" is the only one currently supported. You will need your own API key.
  - location - sets the latitude and longitude of the home location
- controller
  - thermostat - sets up the DS18X20 thermostats available to the system. Each thermostat is named, and has an id used to communicate with the sensor
  - pin - sets up the GPIO pins, mapping the pin name to the GPIO pin number
  - mobile - sets up the mobiles, each name maps to the unique ID of the mobile
  - rule - list of rules that are used to control state of the system

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
functions of the controller using AJAX requests to the controller.

# Mobiles

Hot pot includes an Android app that can be run on a mobile device to report
the location of that device back to the Hotpot server. 
Mobile devices report their location to the server, which then uses the
Google maps routing API to estimate when the mobile will get home, based on
the location, speed and direction of the device.

The Hotpot server rules can use the estimated return time to decide whether
to enable services or not.

For routing to work, the server has to have access to the Google Maps API.

* Go to the Google API console
* Click on "Credentials"
* Add a server key, with your server's IP address
(If your server changes IP address on a regular basis e.g. your IP provider
uses DHCP, you can set a random IP address and then set Hotpot up to use
that random IP address in requests)
* Go to "Overview" and enable the Maps Directions API
* Set the API key in your server's Hotpot configuration
