#!/bin/bash
set -e
echo "=== NeoPeptide Pipeline ==="
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000"
echo ""
docker compose up --build
