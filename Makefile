# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

# None of the targets here are actually required to build.
# We don't bother compressing the node.js code, and there is no
# great advantage to compressing the browser code.

SOURCES := \
	GetIP/GetIP.js \
	GetIP/GetTime.js \
	server/AuthoriseCalendars.js \
	server/Calendar.js \
	server/Controller.js \
	server/Historian.js \
	server/Hotpot.js \
	server/MetOffice.js \
	server/Pin.js \
	server/Rule.js \
	server/Server.js \
	server/Thermostat.js \
	common/Config.js \
	common/Location.js \
	common/Time.js \
	common/Timeline.js \
	common/Utils.js \
	common/Vec.js \
	browser/js/require.js \
	browser/js/autoscale_graph.js \
	browser/js/browser.js \
	browser/js/edit_in_place.js \
	browser/js/TimelineEditor.js

%.esl : %.js
	eslint --no-ignore $^
	touch $*.esl

# Lint all JS
lint: $(subst .js,.esl,$(SOURCES))

# Make HML source-code documentation
doc: $(ALL_SOURCES)
	jsdoc -c jsdoc_config.json -d=doc $(SOURCES)

# Clean up
clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.min.js' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
	rm -rf doc
