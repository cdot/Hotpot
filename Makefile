# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	server/Apis.js \
	server/Config.js \
	server/Controller.js \
	server/Historian.js \
	server/Hotpot.js \
	server/MetOffice.js \
	server/Mobile.js \
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

DOC := $(patsubst %.js,doc/%.js.html,$(subst /,_,$(SOURCES)))

%.esl : %.js
	eslint --no-ignore $^
	touch $*.esl

lint: $(subst .js,.esl,$(SOURCES))

doc: $(DOC)

$(DOC): $(SOURCES)
	~/.node_modules/.bin/jsdoc -d doc $(SOURCES)

clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
	rm -rf doc
