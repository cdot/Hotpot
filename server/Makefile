# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

MODULES := \
	Config.js \
	Controller.js \
	MetOffice.js \
	Mobile.js \
	Pin.js \
	Rule.js \
	Server.js \
	Thermostat.js

SOURCES := \
	Hotpot.js

MMODULES := $(patsubst %,node_modules/%,$(MODULES))

%.esl : %.js
	eslint --no-ignore $^
	touch $*.esl

lint: $(subst .js,.esl,$(SOURCES) $(MMODULES))

doc:
	~/.node_modules/.bin/jsdoc -d ../doc $(SOURCES) $(MMODULES)

clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
	echo $(patsubst %.js,../doc/%.*,$(SOURCES) $(MODULES))
