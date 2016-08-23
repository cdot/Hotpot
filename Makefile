# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	server/AuthoriseCalendars.js \
	server/Calendar.js \
	server/Config.js \
	server/Controller.js \
	server/GetIP.js \
	server/Historian.js \
	server/Hotpot.js \
	server/MetOffice.js \
	server/Pin.js \
	server/Rule.js \
	server/Server.js \
	server/Thermostat.js \
	common/BrowserStubs.js \
	common/Location.js \
	common/Time.js \
	common/Utils.js \
	browser/js/autoscale_graph.js \
	browser/js/browser.js \
	browser/js/edit_in_place.js

%.esl : %.js
	eslint --no-ignore $^
	touch $*.esl

lint: $(subst .js,.esl,$(SOURCES))

doc: $(SOURCES)
	~/.node_modules/.bin/jsdoc -c jsdoc_config.json -d doc $(SOURCES)

clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
	rm -rf doc
