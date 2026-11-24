#!/bin/sh
# Local equivalent of .github/workflows/build-ipa.yml.
# Requires macOS + Xcode command line tools. No Apple ID needed for the build.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUILD="$ROOT/build"
rm -rf "$BUILD"
mkdir -p "$BUILD/Payload"

echo "==> Building ARISE.app"
xcodebuild \
  -project ios/ARISE/ARISE.xcodeproj \
  -scheme ARISE \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$BUILD/derived" \
  -archivePath "$BUILD/ARISE.xcarchive" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  archive

echo "==> Adding HealthKit entitlement placeholder signature"
cp -R "$BUILD/ARISE.xcarchive/Products/Applications/ARISE.app" "$BUILD/Payload/ARISE.app"
codesign --force --sign - \
  --entitlements ios/ARISE/ARISE/ARISE.entitlements \
  "$BUILD/Payload/ARISE.app"

codesign -d --entitlements :- "$BUILD/Payload/ARISE.app"

echo "==> Zipping IPA"
cd "$BUILD"
zip -qry ARISE-HealthKit.ipa Payload
cp "$ROOT/ios/ARISE/ARISE/ARISE.entitlements" "$BUILD/ARISE.entitlements"
ls -lh ARISE-HealthKit.ipa
echo "Done: $BUILD/ARISE-HealthKit.ipa"
