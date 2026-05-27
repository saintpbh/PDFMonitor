#!/bin/bash
set -e

APP_NAME="PDFMonitor"
DEST_DIR="$HOME/Desktop"

echo "Vite & Tauri 2.0 빌드 환경(pdf-presenter 디렉토리)으로 진입합니다..."
cd pdf-presenter

echo "Building release version using Tauri CLI..."
# Clean old build artifacts to be absolutely sure
rm -rf src-tauri/target/release

# Use Tauri CLI to build the app
npx -y @tauri-apps/cli build

# The built app bundle will be located at:
# pdf-presenter/src-tauri/target/release/bundle/macos/PDFMonitor.app
BUILT_APP="src-tauri/target/release/bundle/macos/PDFMonitor.app"

if [ -d "$BUILT_APP" ]; then
    echo "Applying ad-hoc code signing to the bundled app..."
    codesign --force --deep --sign - "$BUILT_APP"
    
    echo "Moving to Desktop..."
    rm -rf "$DEST_DIR/${APP_NAME}.app"
    cp -R "$BUILT_APP" "$DEST_DIR/"
    
    # 깃허브 배포용 Zip 압축본 생성
    echo "배포용 Zip 압축 파일 생성 중..."
    cd "$DEST_DIR"
    zip -r "${APP_NAME}-macOS.zip" "${APP_NAME}.app" > /dev/null
    cd - > /dev/null
    
    echo "Successfully built, signed, and moved ${APP_NAME}.app to Desktop!"
    echo "배포용 zip 아카이브가 바탕화면에 완료되었습니다: ${DEST_DIR}/${APP_NAME}-macOS.zip"
    
    echo "바탕화면에 복사된 앱을 즉시 실행합니다..."
    open "$DEST_DIR/${APP_NAME}.app"
else
    echo "Error: Could not find the built app bundle at $BUILT_APP"
    exit 1
fi
