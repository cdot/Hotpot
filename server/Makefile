# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	Hotpot.js \
	Server.js\
	Controller.js\
	PinController.js\
	Thermostat.js

%.esl : %.js
	eslint $^

release: $(MIN)
	@echo "Done"

eslint: $(subst .js,.esl,$(SOURCES))

clean:
	find . -name '*~' -exec rm \{\} \;
