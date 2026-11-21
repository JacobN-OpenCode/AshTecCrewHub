#!/usr/bin/env bash
# Builds AshTec.app from the Swift package and drops a downloadable zip into
# public/downloads/. Needs only the Command Line Tools (no Xcode, no paid account).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="$root/public/downloads"
app="$here/dist/AshTec.app"
bin="$here/.build/release/AshTec"

# The version lives here and nowhere else. The Info.plist the app reports, the
# zip and public/downloads/latest.json all read these two, so the site can never
# advertise a build that was not uploaded (which is what went wrong before:
# latest.json said 1.1 while the zip was still 1.0).
version="1.1"
build="2"

echo "==> Building (release)"
swift build -c release --package-path "$here"

echo "==> Assembling $app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin" "$app/Contents/MacOS/AshTec"
cp "$root/public/cat.png" "$app/Contents/Resources/cat.png"

echo "==> App icon"
iconset="$here/dist/AppIcon.iconset"
rm -rf "$iconset"; mkdir -p "$iconset"
for s in 16 32 64 128 256 512; do
  sips -z $s $s "$root/public/cat.png" --out "$iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d "$root/public/cat.png" --out "$iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/AppIcon.icns"

cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>AshTec</string>
  <key>CFBundleDisplayName</key><string>AshTec</string>
  <key>CFBundleIdentifier</key><string>uk.navaratne.ashtec.mac</string>
  <key>CFBundleExecutable</key><string>AshTec</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${build}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>Ashford School Tech Crew</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>uk.navaratne.ashtec.mac</string>
      <key>CFBundleURLSchemes</key>
      <array><string>ashtec</string></array>
    </dict>
  </array>
</dict>
</plist>
PLIST

echo "==> Ad-hoc signing"
codesign --force --deep --sign - "$app" 2>/dev/null || echo "   (codesign skipped)"

echo "==> Zipping"
mkdir -p "$out"
rm -f "$out/AshTec-macOS.zip"
( cd "$here/dist" && zip -qry "$out/AshTec-macOS.zip" "AshTec.app" )

echo "==> Version file"
# The downloads page reads this to tell the crew (and the app's own "Check for
# Updates…" menu item) whether the copy they have is old. It reads $version, so
# it cannot drift from the Info.plist above.
cat > "$out/latest.json" <<JSON
{
  "version": "$version",
  "url": "/downloads/AshTec-macOS.zip",
  "releasedAt": "$(date -u +%Y-%m-%d)",
  "notes": "Check for Updates in the AshTec menu."
}
JSON

echo "==> Done: public/downloads/AshTec-macOS.zip"
ls -lh "$out/AshTec-macOS.zip"
