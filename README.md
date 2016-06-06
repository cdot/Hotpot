# Hotpot

Central heating controller for a Y-plan central heating system, using
nodjs on Raspberry Pi. Piggybacks on the existing system so that the existing
controller can still be used (though not at the same time).

The controller assumes the Pi is configured with a number of DS18x20
temperature sensors, usually one for heating (CH) and one for hot water (HW), connected to GPIO.

It sets the state of GPIO pins to turn on the relevant heating control. It
then works to keep the temperatures sensed on the DS18x20's to within defined
ranges.

# Hardware

Aside from the Raspberry Pi, the only additional hardware required are two DS18x20 temperature sensors, and two relays. A dual SRD-05VDC-SL-C relay module is ideal for this. The wiring capitalises on the fact that when the controller for a Y system is powered on, but set to "off", the "Hot water off" control line is held high (at 250V). See Mains.svg for details of the mains level wiring.

The wiring of the temperature sensors and the control side of the relays is shown in 5V-3.5V control.svg

# Software

The controller uses rules defined in javascript functions to control
the temperature of the different services offered by the central heating
system. It can operate either as a stand-alone controller or as an HTTPS
server that supports querying and changing the configuration of the system.
w
For example, we might have a DS18x20 called "HW" that senses the hot water
temperature. A GPIO pin also called "HW" is used to control whether the
central heating is providing hot water. We set a target temperature of
60 degrees and a window of 5 degrees on HW. When the temperature falls
below 57.5 degrees, the HW GPIO will go high. When the temperature rises above
62.5 degrees, it will go low. the combination of a temperature sensor and
a GPIO pin is referred to as a "Thermostat".

Thermostats may also be controlled by rules. A rule is a Javascript
function that is called with 'this' set to the Thermostat. A rules
function is expected to test conditions such as time and
temperature, and set the target temperature accordingly.

The server is initially configured from options read from a file in
$HOME/.config/Hotpot/config.json. After the initial setup, the HTTP interface
can be used to query and modify the configuration.

# HTTP interface
The HTTP interface supports GET and POST requests.

# Configuring the Hardware

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

# Configuring software

The server is configured from the command-line and from a configuration file
in ~/.config/Hotpot/config.json

Example configuration file:
```Javascript
{
  server: {
      key: "$HOME/.config/Hotpot/hotpot.key",
      cert: "$HOME/.config/Hotpot/hotpot.crt",
      port: 13196
  },
  controller: {
     location: {
        // Private API key, used for accessing google maps
        api_key: "Abd0982354",
        // This is no IP in particular
        server_ip: "123.45.67.89"
        home: {
            latitude: 53.2479773,
            longitude: -2.504296
        }
    },
    thermostats: {
      HW: {
          id: "28-0115914ff5ff",
          rules: "$HOME/.config/Hotpot/hw_rules.json",
          target: 55,
          window: 3
      },
      CH: {
          id: "28-0316027f81ff",
          rules: "$HOME/.config/Hotpot/ch_rules.json",
          target: 15,
          window: 3
      }
    },
    pins: {
      CH: {
          gpio: 23
      },
      HW: {
          gpio: 25
      }
    },
    mobiles: {
      "7f673fe4926": {
        name: "Roamer's Phone"
      }
    }
  }
}
```
- server - sets up the HTTP(S) server
  - key server private key
  - cert server certificate. If no key and cert are given, an HTTP server will be used, otherwise it will be HTTPS.
  - port the network port to use (default is 13196)
- location - sets the latitude and longitude of the home location
- thermostats - sets up the DS18X20 thermostats available to the system. Each thermostat has:
  - id - used to communicate with the sensor
  - rules - (optional) name of a rules file that contains the rules for the thermostat
  - target (optional) starting target temperature, before any rules are applied. Defaults to 0K (-273 degress C)
  - window (optional) window over the target temperature.
- pins - sets up the pins used to control the system.
  - gpio - the GPIO pin number
- mobiles - sets the unique ID of roaming devices

Note that the pin names "HW" and "CH" are predefined, as Y-plan systems have
some dependencies between them.

# Rules

Rules are Javascript functions associated with thermostats.
```Javascript
function rule(Controller controller)
'this' is the Thermostat object
```
Each function is
called in turn each time the temperature is polled, and it it returns true,
the evaluation will stop. Rule functions are called with 'this' set to
the thermostat object and the controller. The simplest
rules set the configuration of the thermostat by adjusting e.g. the target
temperature and window. For example,
```Javascript
[
  {
    name: "morning",
    test: function() {
      if (Time.between("06:30", "07:30")) {
        this.set_target(55);
        return true;
      }
    }
  },
  {
    name: "otherwise",
    test: function() {
      this.set_target(0);
      this.set_window(10);
    }
  }
]
```
This will set the temperature to 55 degrees between 06:30 and 07:30 for your morning shower, then switch off the hot water at any other time. The "Time" class is provided to make comparing times easier. All time comparisons are done in system time.

You can interrogate the status of the thermostat using the methods described in the documentation. You can also interrogate other thermostats by using the controller. For example, you might have a rule for the central heating thermostat as follows:
```Javascript
{
  name: "Turn on heating if CH temp falls below 5 degrees",
  test: function(controller) {
    if (controller.thermostat.CH.temperature() < 5)
      this.set_target(40);
  }
}
```
A rule can also remove itself from the rule set (for example, a rule may
be set to expire after a certain time) by returning the string "remove".
```Javascript
{
  name: "One hour pulse for hot water",
  test: function() {
    if (Time.after("10:35"))
      return "remove";
    this.set_target(55);
  }
}
```

# Browser interface

The browser interface is a low-level debugging tool that gives access to the
functions of the controller using AJAX requests to the controller.

# Maps
Setting up to access the API
* Go to the API console
* Click on "Credentials"
* Add a server key, with your server's IP address
(you can add a userIp parameter to requests if it isn't stable)
* Go to "Overview" and enable the Maps Directions API
Getting directions:

