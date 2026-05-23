#!/bin/bash
set -e

SRC_IMG="/Users/bongpark/.gemini/antigravity/brain/9a6b1893-eeba-4a1f-bdeb-d6eae2f9ee74/pdfmonitor_logo_1779535395099.png"
ICON_DIR="/Users/bongpark/타이머/pdf-presenter/src-tauri/icons"

echo "Using source image: $SRC_IMG"
echo "Target icons directory: $ICON_DIR"

# 임시 iconset 디렉토리 생성
TEMP_ICONSET="temp_icon.iconset"
rm -rf "$TEMP_ICONSET"
mkdir -p "$TEMP_ICONSET"

# macOS .icns를 위한 개별 규격 png sips 변환
echo "Converting png sizes for macOS .icns..."
sips -s format png -z 16 16     "$SRC_IMG" --out "$TEMP_ICONSET/icon_16x16.png"
sips -s format png -z 32 32     "$SRC_IMG" --out "$TEMP_ICONSET/icon_16x16@2x.png"
sips -s format png -z 32 32     "$SRC_IMG" --out "$TEMP_ICONSET/icon_32x32.png"
sips -s format png -z 64 64     "$SRC_IMG" --out "$TEMP_ICONSET/icon_32x32@2x.png"
sips -s format png -z 128 128   "$SRC_IMG" --out "$TEMP_ICONSET/icon_128x128.png"
sips -s format png -z 256 256   "$SRC_IMG" --out "$TEMP_ICONSET/icon_128x128@2x.png"
sips -s format png -z 256 256   "$SRC_IMG" --out "$TEMP_ICONSET/icon_256x256.png"
sips -s format png -z 512 512   "$SRC_IMG" --out "$TEMP_ICONSET/icon_256x256@2x.png"
sips -s format png -z 512 512   "$SRC_IMG" --out "$TEMP_ICONSET/icon_512x512.png"
sips -s format png -z 1024 1024 "$SRC_IMG" --out "$TEMP_ICONSET/icon_512x512@2x.png"

# .icns 생성
echo "Generating icon.icns..."
iconutil -c icns "$TEMP_ICONSET" -o "$ICON_DIR/icon.icns"
rm -rf "$TEMP_ICONSET"

# 기타 png 아이콘 규격 개별 sips 변환
echo "Converting Tauri app png icons..."
sips -s format png -z 512 512   "$SRC_IMG" --out "$ICON_DIR/icon.png"
sips -s format png -z 32 32     "$SRC_IMG" --out "$ICON_DIR/32x32.png"
sips -s format png -z 128 128   "$SRC_IMG" --out "$ICON_DIR/128x128.png"
sips -s format png -z 256 256   "$SRC_IMG" --out "$ICON_DIR/128x128@2x.png"

# Windows Store 및 기타 스케일 로고 변환
sips -s format png -z 50 50     "$SRC_IMG" --out "$ICON_DIR/StoreLogo.png"
sips -s format png -z 30 30     "$SRC_IMG" --out "$ICON_DIR/Square30x30Logo.png"
sips -s format png -z 44 44     "$SRC_IMG" --out "$ICON_DIR/Square44x44Logo.png"
sips -s format png -z 71 71     "$SRC_IMG" --out "$ICON_DIR/Square71x71Logo.png"
sips -s format png -z 89 89     "$SRC_IMG" --out "$ICON_DIR/Square89x89Logo.png"
sips -s format png -z 107 107   "$SRC_IMG" --out "$ICON_DIR/Square107x107Logo.png"
sips -s format png -z 142 142   "$SRC_IMG" --out "$ICON_DIR/Square142x142Logo.png"
sips -s format png -z 150 150   "$SRC_IMG" --out "$ICON_DIR/Square150x150Logo.png"
sips -s format png -z 284 284   "$SRC_IMG" --out "$ICON_DIR/Square284x284Logo.png"
sips -s format png -z 310 310   "$SRC_IMG" --out "$ICON_DIR/Square310x310Logo.png"

# Windows .ico 변환 (python convert_ico.py 호출)
echo "Generating icon.ico for Windows..."
python3 convert_ico.py "$SRC_IMG" "$ICON_DIR/icon.ico"

# 타이머/AppIcon.icns 및 AppIcon.ico도 똑같이 덮어씌워줍니다.
cp "$ICON_DIR/icon.icns" AppIcon.icns
cp "$ICON_DIR/icon.ico" AppIcon.ico

echo "Icon synthesis successfully completed!"
