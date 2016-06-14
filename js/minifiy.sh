#!/bin/sh

rm js.js && uglifyjs *.js --compress -m -r '$,require,exports,clippy' -o js.js
