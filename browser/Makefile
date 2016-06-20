# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	autoscale_graph.js \
	browser.js \
	edit_in_place.js

%.esl : %.js
	eslint --no-ignore $^
	touch $*.esl

lint: $(subst .js,.esl,$(patsubst %.js,js/%.js,$(SOURCES)))

doc:
	~/.node_modules/.bin/jsdoc -d ../doc $(patsubst %.js,js/%.js,$(SOURCES))

clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
	echo $(patsubst %.js,../doc/%.*,$(SOURCES))
