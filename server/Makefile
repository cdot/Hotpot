# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	Config.js \
	Controller.js \
	getip.js \
	Hotpot.js \
	Mobile.js \
	Pin.js \
	Rule.js \
	Server.js \
	Thermostat.js \
	Time.js

%.esl : %.js
	eslint $^
	touch $*.esl

eslint: $(subst .js,.esl,$(SOURCES))

clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
