#!/usr/bin/env bash
# Build React app and sync to repo root for GitHub Pages (ptia0004.github.io/sensepath/)
set -euo pipefail
cd "$(dirname "$0")/.."
cd frontend
npm run build
cd ..
rm -rf assets
cp frontend/dist/index.html ./index.html
cp -R frontend/dist/assets ./assets
echo "GitHub Pages files updated: ./index.html and ./assets/"
echo "Commit and push to deploy."
