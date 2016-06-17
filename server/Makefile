# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	Config.js \
	Controller.js \
	Hotpot.js \
	MetOffice.js \
	Mobile.js \
	Pin.js \
	Rule.js \
	Server.js \
	Thermostat.js \
	Time.js \
	Utils.js \
	getip.js

%.esl : %.js
	eslint $^
	touch $*.esl

doc/%.js.html : %.js
	./node_modules/.bin/jsdoc -d doc $^

lint: $(subst .js,.esl,$(SOURCES))

doc: $(patsubst %.js,doc/%.js.html,$(SOURCES))

clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
