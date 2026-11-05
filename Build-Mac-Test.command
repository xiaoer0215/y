#!/usr/bin/env bash
set -u
SCRIPT_ROOT="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_ROOT/scripts/build-macos-test.sh" universal-apple-darwin
BUILD_EXIT=$?
if [[ $BUILD_EXIT -eq 0 ]]; then
  open "$SCRIPT_ROOT/release/macos-test"
else
  echo "Build failed. Read the message above and MACOS-TEST.md."
fi
if [[ -t 0 ]]; then
  read -r -p "Press Enter to close this window..." _answer
fi
exit "$BUILD_EXIT"
