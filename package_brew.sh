#!/bin/bash

# package_brew.sh
# 로컬에서 빌드된 macOS 패키지를 기준으로 Homebrew Cask 포뮬러(Ruby) 명세를 자동 생성합니다.

set -e

# 터미널 색상 정의
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}==> Homebrew Cask 템플릿 생성기 가동...${NC}"

# 버전 정보 가져오기 (Cargo.toml에서 파싱)
VERSION=$(grep -m 1 '^version = ' pdf-presenter/src-tauri/Cargo.toml | sed 's/version = "\(.*\)"/\1/')
ZIP_PATH="$HOME/Desktop/PROK PDF STUDIO-macOS.zip"

# 만약 데스크톱에 zip 파일이 없으면 빌드 후 패키징 진행 유도
if [ ! -f "$ZIP_PATH" ]; then
    echo -e "${YELLOW}[!] 데스크톱에서 PROK PDF STUDIO-macOS.zip 파일을 찾을 수 없습니다.${NC}"
    echo -e "${BLUE}==> macOS 앱 빌드 및 패키징 스크립트(package_mac.sh)를 먼저 가동합니다...${NC}"
    chmod +x package_mac.sh
    ./package_mac.sh
fi

# SHA256 체크섬 계산
echo -e "${BLUE}==> macOS 배포 패키지 체크섬 계산 중...${NC}"
SHA256=$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')

# Cask 루비 코드 생성 및 출력
CASK_CONTENT=$(cat <<EOF
cask "pdfmonitor" do
  version "${VERSION}"
  sha256 "${SHA256}"

  url "https://github.com/saintpbh/PDFMonitor/releases/download/v#{version}/PROK%20PDF%20STUDIO-macOS.zip"
  name "PROK PDF STUDIO"
  desc "High-performance presentation prompter and dual-screen PDF overlay presenter"
  homepage "https://github.com/saintpbh/PDFMonitor"

  app "PROK PDF STUDIO.app"

  zap trash: [
    "~/Library/Application Support/PROK PDF STUDIO",
    "~/Library/Preferences/com.prok.pdf.studio.plist",
  ]
end
EOF
)

# Cask 파일 로컬 저장 (출력용 및 로컬 보관용)
mkdir -p homebrew-formula
echo "$CASK_CONTENT" > homebrew-formula/pdfmonitor.rb

echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}[✔] Homebrew Cask Formula 생성이 완료되었습니다!${NC}"
echo -e "저장된 경로: ${YELLOW}homebrew-formula/pdfmonitor.rb${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "${BLUE}이 파일 내용을 복사하여 본인의 탭 리포지토리(Casks/pdfmonitor.rb)에 등록하세요:${NC}"
echo ""
echo -e "${YELLOW}$CASK_CONTENT${NC}"
echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "Tip: 본인의 GitHub에 ${YELLOW}homebrew-tap${NC} 이라는 이름의 퍼블릭 저장소를 생성한 후,"
echo -e "그 안에 ${YELLOW}Casks/pdfmonitor.rb${NC} 경로로 이 스크립트를 추가하면,"
echo -e "사용자들은 ${YELLOW}brew install --cask saintpbh/tap/pdfmonitor${NC} 명령어로 바로 설치할 수 있습니다!"
echo -e "${GREEN}======================================================${NC}"
