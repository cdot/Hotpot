# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	Config.js \
	Hotpot.js \
	Server.js\
	Controller.js\
	PinController.js\
	Rule.js\
	Time.js\
	Thermostat.js

%.esl : %.js
	eslint $^
	touch %.esl

release: $(MIN)
	@echo "Done"

eslint: $(subst .js,.esl,$(SOURCES))

clean:
	find . -name '*~' -exec rm \{\} \;
