#!/usr/bin/env bash
# Builds the AshTec Wear OS APK with the Android build tools directly (aapt2 +
# javac + d8 + zipalign + apksigner) — no Gradle, no Play Store account.
# Needs a JDK and the Android SDK build-tools + platform.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk}"
PATH="$JAVA_HOME/bin:$PATH"
# d8 in build-tools 34 (R8 8.2.2) crashes under a modern JDK; 37 is fine.
if [ -d "$ANDROID_HOME/build-tools/37.0.0" ]; then
  BT="$ANDROID_HOME/build-tools/37.0.0"
else
  BT="$ANDROID_HOME/build-tools/34.0.0"
fi
PLATFORM="$ANDROID_HOME/platforms/android-34/android.jar"

for f in "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner" "$PLATFORM"; do
  [ -e "$f" ] || { echo "Missing $f — set ANDROID_HOME or install the SDK build-tools/platform."; exit 1; }
done

out="$here/build"
rm -rf "$out"; mkdir -p "$out/gen" "$out/classes" "$out/dex"

echo "==> Compiling resources"
"$BT/aapt2" compile --dir "$here/res" -o "$out/res.zip"

echo "==> Linking resources"
"$BT/aapt2" link \
  -o "$out/base.apk" \
  -I "$PLATFORM" \
  --manifest "$here/AndroidManifest.xml" \
  --java "$out/gen" \
  --min-sdk-version 26 \
  --target-sdk-version 34 \
  "$out/res.zip"

echo "==> Compiling Java"
find "$here/src" "$out/gen" -name '*.java' > "$out/sources.txt"
# JDK 27 refuses -bootclasspath, so compile against android.jar on the classpath
# and pin the language level with --release.
javac --release 11 -nowarn -classpath "$PLATFORM" -d "$out/classes" @"$out/sources.txt"

echo "==> Dexing"
( cd "$out/classes" && jar cf "$out/classes.jar" . )
"$BT/d8" --lib "$PLATFORM" --min-api 26 --output "$out/dex" "$out/classes.jar"

echo "==> Packaging"
cp "$out/base.apk" "$out/unsigned.apk"
( cd "$out/dex" && zip -q "$out/unsigned.apk" classes.dex )
"$BT/zipalign" -f 4 "$out/unsigned.apk" "$out/aligned.apk"

echo "==> Signing"
KS="$here/debug.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US"
fi
mkdir -p "$root/public/downloads"
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --v4-signing-enabled false --out "$root/public/downloads/AshTec-wear.apk" "$out/aligned.apk"

echo "==> Done: public/downloads/AshTec-wear.apk"
ls -lh "$root/public/downloads/AshTec-wear.apk"
