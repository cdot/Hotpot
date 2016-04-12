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

The controller uses rules defined in a set of javascript functions to control
the temperature of the different services offered by the central heating
system. It can operate either as a stand-alone controller or as an HTTP
server that supports querying and changing the configuration of the system.

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

The server is initially configured from the command-line. After the
initial setup, the HTTP interface can be used to query and modify the
configuration.

Example command-line:
```
node Control.js -p 13126 --gpio HW=4 -i HW=28-00010474b79a --rules HW=hot_water.rules
```
# Rules files

Rules files are Javascript files that contain an array of functions
definitons. Each function is called in turn, and it it returns true,
the evaluation will stop. Functions can set the configuration of the
thermostat they are called on. The "Time" class is provided to make
comparing times easier. Example, hot_water.rules:
```Javascript
[
    function() {
        if (Time.between("06:30", "07:30")) {
            this.set_target(60);
            return true;
        }
    },
    function() {
        if (Time.between("17:30", "18:30")) {
            this.set_target(55);
            return true;
        }
    },
    function() {
        this.set_target(0);
    }
]
```
This will set the temperature to 60 degrees between 06:30 and 07:30 for your morning shower, then to 55 degreees between 17:30 and 18:30 for the washing up and evening showers. At any other time the temperature is set to 0, which turns the hot water off.

Rules functions can also interrogate other thermostats using the controller. For example,
```
[
    function() {
        // Turn on hot water if CH temp falls below 5 degrees
        if (controller.thermostat.CH.temperature < 5)
           this.set_target(40);
    }
]
```
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
