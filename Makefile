# Copyright (C) 2016-2021 Crawford Currie http://c-dot.co.uk / MIT

# Just used to manage linting and tidying.
#
# None of the targets here are actually required to build.
# We don't bother compressing the node.js code, and there is no
# great advantage to compressing the browser code.

JS := $(shell find . \( -name node_modules -o -name doc -o -name test \) -prune -false -o \( -type f -name '*.js' \) )

TESTS := $(shell find . \( -name node_modules -o -name doc \) -prune -false -o \( -type f -name '*.ut' \) )

tests: $(TESTS: .ut=.utr)

%.utr: %.ut
	node $^

# Lint all JS
lint:
	node node_modules/.bin/eslint $(JS)

# Make HTML source-code documentation
doc: doc/index.html

doc/index.html: $(JS) doc/config.json
	node_modules/.bin/jsdoc -c doc/config.json -d doc $(JS)

tests: $(TESTS)
	find . -name node_modules -prune -o -name '*.ut' -exec node \{\} \;

# Clean up
clean:
	find '*~' -exec rm \{\} \;
	find '*.min.js' -exec rm \{\} \;
	rm -rf doc

# Dependencies (link for dev)
%.dependencies : %/package.json
	$(shell cat $^ | \
   perl -e 'use JSON;$$/=undef;$$d=decode_json(<>);print join(";", map { "npm link $$_" } keys %{$$d->{dependencies}});')

dependencies: GetIP.dependencies server.dependencies

# Update package.json with latest packages
# using npm-check-update (npm install -g npm-check-updates)
update:
	ncu -u
