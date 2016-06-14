#!/bin/sh

rm -f css.css && cat *.css | cleancss -o css.css
