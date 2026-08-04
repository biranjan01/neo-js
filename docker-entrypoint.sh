#!/bin/bash
set -e

Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp &
XVFB_PID=$!

sleep 2

export DISPLAY=:99

exec gunicorn server:app --bind 0.0.0.0:${PORT:-5000} --timeout 600 --workers 1 --preload
