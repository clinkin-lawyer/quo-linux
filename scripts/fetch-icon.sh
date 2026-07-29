#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
curl -sf https://cdn.quo.com/favicon/android-chrome-512x512.png -o build/icon.png
echo "Fetched icon to build/icon.png"
