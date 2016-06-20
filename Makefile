# Copyright (C) 2016 Crawford Currie http://c-dot.co.uk / MIT

SOURCES := \
	node_modules/Time.js \
	node_modules/Utils.js

%.esl : %.js
	eslint $^
	touch $*.esl

lint: $(subst .js,.esl,$(SOURCES))

doc:
	~/.node_modules/.bin/jsdoc -d doc -a public $(SOURCES)

clean:
	find . -name '*~' -exec rm \{\} \;
	find . -name '*.esl' -exec rm \{\} \;
	rm -rf doc
