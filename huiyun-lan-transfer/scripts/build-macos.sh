#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(tr -d '\r\n' < VERSION)"
MANIFEST="$ROOT/src-tauri/Cargo.toml"
DIST="$ROOT/dist"
APP="$DIST/汇云局域网跨传.app"
BIN="$APP/Contents/MacOS/huiyun-lan-transfer"
RES="$APP/Contents/Resources"

rustup target add x86_64-apple-darwin aarch64-apple-darwin
cargo build --release --manifest-path "$MANIFEST" --target x86_64-apple-darwin
cargo build --release --manifest-path "$MANIFEST" --target aarch64-apple-darwin

rm -rf "$DIST"
mkdir -p "$APP/Contents/MacOS" "$RES"
lipo -create \
  "$ROOT/src-tauri/target/x86_64-apple-darwin/release/huiyun-lan-transfer" \
  "$ROOT/src-tauri/target/aarch64-apple-darwin/release/huiyun-lan-transfer" \
  -output "$BIN"
chmod +x "$BIN"
cp "$ROOT/build/icon.icns" "$RES/icon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>zh_CN</string>
  <key>CFBundleDisplayName</key><string>汇云局域网跨传</string>
  <key>CFBundleExecutable</key><string>huiyun-lan-transfer</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>CFBundleIdentifier</key><string>com.huiyun.lantransfer</string>
  <key>CFBundleName</key><string>汇云局域网跨传</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>10.15</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

codesign --force --deep --sign - "$APP"
ZIP="$DIST/Huiyun-LAN-Transfer-$VERSION-mac-universal.zip"
DMG="$DIST/Huiyun-LAN-Transfer-$VERSION-mac-universal.dmg"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
hdiutil create -volname "汇云局域网跨传" -srcfolder "$APP" -ov -format UDZO "$DMG" >/dev/null

echo "MAC_APP=$APP"
du -h "$ZIP" "$DMG"
