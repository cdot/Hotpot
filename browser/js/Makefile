# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	autoscale_graph.js \
	browser.js \
	edit_in_place.js

%.esl : %.js
	eslint $^
	touch $*.esl

eslint: $(subst .js,.esl,$(SOURCES))

clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
