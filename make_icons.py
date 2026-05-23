import os
import sys
import subprocess
import shutil
from PIL import Image

src_img_path = "/Users/bongpark/.gemini/antigravity/brain/9a6b1893-eeba-4a1f-bdeb-d6eae2f9ee74/pdfmonitor_logo_1779535395099.png"
icon_dir = "/Users/bongpark/타이머/pdf-presenter/src-tauri/icons"

print(f"Opening source image: {src_img_path}")
img = Image.open(src_img_path)
if img.mode != 'RGBA':
    img = img.convert('RGBA')

# 1. macOS .icns를 위한 temp_icon.iconset 생성
temp_iconset = "temp_icon.iconset"
if not os.path.exists(temp_iconset):
    os.makedirs(temp_iconset)

# 규격 목록 (파일명, 크기)
icns_sizes = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for filename, size in icns_sizes:
    out_path = os.path.join(temp_iconset, filename)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    # Ensure it's saved as RGBA with png format
    resized.save(out_path, "PNG")
    print(f"Generated {out_path} ({size}x{size}) in RGBA")

# iconutil 실행하여 .icns 생성
print("Running iconutil to generate icon.icns...")
subprocess.run(["iconutil", "-c", "icns", temp_iconset, "-o", os.path.join(icon_dir, "icon.icns")], check=True)

# 임시 폴더 삭제
shutil.rmtree(temp_iconset)

# 2. Tauri용 개별 PNG 아이콘들 생성 (전부 RGBA 명시)
png_sizes = {
    "icon.png": 512,
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "StoreLogo.png": 50,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310
}

for filename, size in png_sizes.items():
    out_path = os.path.join(icon_dir, filename)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(out_path, "PNG")
    print(f"Generated {out_path} ({size}x{size}) in RGBA")

# 3. Windows .ico 생성
ico_path = os.path.join(icon_dir, "icon.ico")
icon_sizes = [(16,16), (32, 32), (48, 48), (64,64), (128, 128), (256, 256)]
img.save(ico_path, format='ICO', sizes=icon_sizes)
print(f"Generated {ico_path} in RGBA")

# 4. 루트 디렉토리에 복사
shutil.copy(os.path.join(icon_dir, "icon.icns"), "AppIcon.icns")
shutil.copy(os.path.join(icon_dir, "icon.ico"), "AppIcon.ico")

print("All premium icons successfully generated in pure RGBA mode!")
