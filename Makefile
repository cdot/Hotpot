# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	Control.js \
	Server.js\
	PinController.js\
	Thermostat.js

%.esl : %.js
	eslint $^
	touch $@

release: $(MIN)
	@echo "Done"

eslint: $(subst .js,.esl,$(SOURCES))

clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
