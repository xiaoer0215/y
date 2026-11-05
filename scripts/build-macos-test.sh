#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
BUILD_TARGET="${1:-universal-apple-darwin}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This build requires macOS and Xcode Command Line Tools. No Mac installer was generated." >&2
  exit 1
fi

case "$BUILD_TARGET" in
  universal-apple-darwin) RUST_TARGETS=(aarch64-apple-darwin x86_64-apple-darwin); ARCH_LABEL="universal" ;;
  aarch64-apple-darwin) RUST_TARGETS=(aarch64-apple-darwin); ARCH_LABEL="aarch64" ;;
  x86_64-apple-darwin) RUST_TARGETS=(x86_64-apple-darwin); ARCH_LABEL="x64" ;;
  *) echo "Unsupported target: $BUILD_TARGET" >&2; exit 1 ;;
esac

for tool in node npm rustup cargo xcrun codesign hdiutil ditto shasum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing build tool: $tool. See MACOS-TEST.md for setup." >&2
    exit 1
  fi
done
if ! xcrun --sdk macosx --show-sdk-path >/dev/null 2>&1; then
  echo "Install Xcode Command Line Tools first: xcode-select --install" >&2
  exit 1
fi
node -e 'if(Number(process.versions.node.split(".")[0])<22){console.error("Node.js 22 or newer is required");process.exit(1)}'

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  PNPM=(npm exec --yes --package=pnpm@10.12.3 -- pnpm)
fi

APP_VERSION="$(node -p 'require("./package.json").version')"
APP_PRODUCT="$(node -p 'require("./src-tauri/tauri.conf.json").productName')"
export AI_HELPER_BRAND_ID="${AI_HELPER_BRAND_ID:-uocode}"
export MACOSX_DEPLOYMENT_TARGET="11.0"
export CARGO_TARGET_DIR="$REPO_ROOT/src-tauri/target"
export CI=true
export APPLE_SIGNING_IDENTITY="-"
# A local test build does not require an Apple account or updater signing key.
unset APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_ID APPLE_PASSWORD
unset APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH

rustup target add "${RUST_TARGETS[@]}"
"${PNPM[@]}" install --frozen-lockfile
"${PNPM[@]}" typecheck
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib -- --skip status_board_live
"${PNPM[@]}" exec tauri build --ci --target "$BUILD_TARGET" \
  --config src-tauri/tauri.macos-test.conf.json -- --locked

BUILD_ROOT="$REPO_ROOT/src-tauri/target/$BUILD_TARGET/release"
APP_BUNDLE="$BUILD_ROOT/bundle/macos/$APP_PRODUCT.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/ai-helper"
if [[ ! -f "$APP_BINARY" ]]; then
  echo "Missing built application: $APP_BINARY" >&2
  exit 1
fi
for rust_target in "${RUST_TARGETS[@]}"; do
  case "$rust_target" in
    aarch64-apple-darwin) xcrun lipo "$APP_BINARY" -verify_arch arm64 ;;
    x86_64-apple-darwin) xcrun lipo "$APP_BINARY" -verify_arch x86_64 ;;
  esac
done
codesign --verify --deep --strict "$APP_BUNDLE"

DMG_FILES=("$BUILD_ROOT"/bundle/dmg/*.dmg)
if [[ ${#DMG_FILES[@]} -ne 1 || ! -f "${DMG_FILES[0]}" ]]; then
  echo "Expected exactly one DMG in $BUILD_ROOT/bundle/dmg; found ${#DMG_FILES[@]}" >&2
  exit 1
fi
hdiutil verify "${DMG_FILES[0]}"

ARTIFACT_ROOT="$REPO_ROOT/release/macos-test/$APP_VERSION/$ARCH_LABEL"
ASSET_NAME="AI-Helper-$APP_VERSION-macOS-$ARCH_LABEL-test"
mkdir -p "$ARTIFACT_ROOT"
cp "${DMG_FILES[0]}" "$ARTIFACT_ROOT/$ASSET_NAME.dmg"
ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE" "$ARTIFACT_ROOT/$ASSET_NAME.app.zip"
(
  cd "$ARTIFACT_ROOT"
  shasum -a 256 "$ASSET_NAME.dmg" "$ASSET_NAME.app.zip" > SHA256SUMS.txt
)
echo ""
echo "Mac test packages are ready: $ARTIFACT_ROOT"
cat "$ARTIFACT_ROOT/SHA256SUMS.txt"
