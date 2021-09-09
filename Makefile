# Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk / MIT

# Just used to manage linting and tidying.
#
# None of the targets here are actually required to build.
# We don't bother compressing the node.js code, and there is no
# great advantage to compressing the browser code.

JS := $(shell find . \( -name node_modules -o -name doc -o -name test -o -name '*.min.*' -o -name release -o -name Android \) -prune -false -o \( -type f -name '*.js' \) )

%.esl : %.js
	eslint --no-ignore $^
	touch $*.esl

# Tidy
%.js.tidy : %.js
	js-beautify -j --good-stuff -o $^ $^

tidy: $(patsubst %.js,%.js.tidy,$(JS))

# Lint all JS
lint: $(subst .js,.esl,$(JS))

# Make HTML source-code documentation
doc: doc/index.html

doc/index.html: $(JS)
	node_modules/.bin/jsdoc -c jsdoc_config.json -d doc $(JS)

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
