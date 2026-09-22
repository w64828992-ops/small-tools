#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src/main.swift"
DIST="$ROOT/dist"
APP="$DIST/DRC控制开关.app"
BUILD="$ROOT/.build"
ICONSET="$BUILD/Banana.iconset"

rm -rf "$DIST" "$BUILD"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$ICONSET"

VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"

swiftc -O -framework AppKit "$SRC" -o "$APP/Contents/MacOS/DRCControl"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>DRC控制开关</string>
<key>CFBundleDisplayName</key><string>DRC控制开关</string>
<key>CFBundleIdentifier</key><string>com.huiyun.drc.controlpanel</string>
<key>CFBundleVersion</key><string>$VERSION</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>DRCControl</string>
<key>CFBundleIconFile</key><string>Banana.icns</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

cat > "$BUILD/icon.swift" <<'SWIFT'
import AppKit
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()
NSColor.clear.setFill()
NSRect(origin: .zero, size: size).fill()
let style = NSMutableParagraphStyle()
style.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 760),
    .paragraphStyle: style
]
NSAttributedString(string: "🍌", attributes: attrs)
    .draw(in: NSRect(x: 0, y: 80, width: 1024, height: 840))
image.unlockFocus()
guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
    exit(1)
}
try png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
SWIFT

swift "$BUILD/icon.swift" "$BUILD/banana1024.png"

function resize_icon() {
  /usr/bin/sips -z "$1" "$1" "$BUILD/banana1024.png" --out "$ICONSET/$2" >/dev/null
}
resize_icon 16 icon_16x16.png
resize_icon 32 icon_16x16@2x.png
resize_icon 32 icon_32x32.png
resize_icon 64 icon_32x32@2x.png
resize_icon 128 icon_128x128.png
resize_icon 256 icon_128x128@2x.png
resize_icon 256 icon_256x256.png
resize_icon 512 icon_256x256@2x.png
resize_icon 512 icon_512x512.png
cp "$BUILD/banana1024.png" "$ICONSET/icon_512x512@2x.png"

/usr/bin/iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Banana.icns"
/usr/bin/plutil -lint "$APP/Contents/Info.plist"
/usr/bin/codesign --force --deep --sign - "$APP"
/usr/bin/codesign --verify --deep --strict "$APP"

echo "BUILD_OK: $APP"
