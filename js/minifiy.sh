#!/bin/sh

rm -f js.js && uglifyjs *.js --compress -m -r '$,require,exports,clippy' -o js.js
