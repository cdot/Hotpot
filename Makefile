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
	common/DataModel.js \
	common/Location.js \
	common/Time.js \
	common/Timeline.js \
	common/Utils.js \
	common/Vec.js \
	browser/js/require.js \
	browser/js/browser.js \
	browser/js/Spinner.js \
	browser/js/TimelineEditor.js

FIND := find . \
	-name node_modules -prune \
	-o -name android -prune \
	-o -name

%.esl : %.js
	eslint --no-ignore $^
	touch $*.esl

# Tidy
%.js.tidy : %.js
	js-beautify -j --good-stuff -o $^ $^

tidy: $(patsubst %.js,%.js.tidy,$(SOURCES))

# Lint all JS
lint: $(subst .js,.esl,$(SOURCES))

# Make HML source-code documentation
doc: $(ALL_SOURCES)
	jsdoc -c jsdoc_config.json -d doc $(SOURCES)

test:
	$(FIND) browser -prune -o -name test -type d -exec mocha \{\}/*.js \;

# Clean up
clean:
	$(FIND) '*~' -exec rm \{\} \;
	$(FIND) '*.min.js' -exec rm \{\} \;
	$(FIND) '*.esl' -exec rm \{\} \;
	rm -rf doc

# Dependencies (link for dev)
%.dependencies : %/package.json
	$(shell cat $^ | \
   perl -e 'use JSON;$$/=undef;$$d=decode_json(<>);print join(";", map { "npm link $$_" } keys %{$$d->{dependencies}});')

dependencies: GetIP.dependencies server.dependencies
