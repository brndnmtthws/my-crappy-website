#!/bin/sh

rm css.css && cat *.css | cleancss -o css.css
