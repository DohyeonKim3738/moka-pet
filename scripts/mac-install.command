#!/bin/bash
#
#  Moka Pet — macOS 설치
#
#  이 스크립트가 하는 일은 세 가지뿐입니다.
#    1. 옆에 있는 .dmg 를 열어 앱을 응용 프로그램 폴더로 옮깁니다
#    2. macOS 가 붙여 둔 "인터넷에서 받은 파일" 표시를 뗍니다
#    3. 앱을 실행합니다
#
#  ※ 이 스크립트는 앱에 서명을 하지 않습니다. 서명은 애플이 발급한
#     인증서가 있어야 하고, 이 앱에는 없습니다. 다만 그 표시 때문에
#     macOS 가 앱을 막는 것이라, 표시를 떼면 정상적으로 열립니다.
#     내용이 궁금하시면 이 파일을 텍스트 편집기로 열어 보세요. 전부 보입니다.
#

set -u
cd "$(dirname "$0")" || exit 1

APP="Moka Pet.app"
DEST="/Applications"
say() { printf '%s\n' "$*"; }

say ""
say "  Moka Pet 설치"
say "  ─────────────────────────────"
say ""

# ── 옆에 있는 dmg 찾기 ────────────────────────────────────────────
DMG="$(ls -1 Moka-Pet-*.dmg 2>/dev/null | head -1)"

if [ -n "$DMG" ]; then
  say "  · $DMG 를 엽니다"
  MNT="$(mktemp -d /tmp/moka-install.XXXXXX)"
  if ! hdiutil attach -nobrowse -quiet -mountpoint "$MNT" "$DMG"; then
    say "  ✕ 디스크 이미지를 열지 못했습니다."
    say "    파일이 완전히 내려받아졌는지 확인해 주세요."
    say ""
    read -r -p "  창을 닫으려면 Enter" _
    exit 1
  fi

  if [ ! -d "$MNT/$APP" ]; then
    say "  ✕ 디스크 이미지 안에서 앱을 찾지 못했습니다."
    hdiutil detach "$MNT" -quiet 2>/dev/null
    rmdir "$MNT" 2>/dev/null
    read -r -p "  창을 닫으려면 Enter" _
    exit 1
  fi

  # 이미 실행 중이면 덮어쓸 수 없다
  if pgrep -f "$DEST/$APP/Contents/MacOS" >/dev/null 2>&1; then
    say "  · 실행 중인 Moka Pet 을 닫습니다"
    pkill -f "$DEST/$APP/Contents/MacOS" 2>/dev/null
    sleep 2
  fi

  say "  · 응용 프로그램 폴더로 옮깁니다"
  rm -rf "$DEST/$APP" 2>/dev/null
  if ! cp -R "$MNT/$APP" "$DEST/"; then
    say "  ✕ 복사하지 못했습니다. 관리자 계정으로 다시 시도해 주세요."
    hdiutil detach "$MNT" -quiet 2>/dev/null
    rmdir "$MNT" 2>/dev/null
    read -r -p "  창을 닫으려면 Enter" _
    exit 1
  fi

  hdiutil detach "$MNT" -quiet 2>/dev/null
  rmdir "$MNT" 2>/dev/null
elif [ -d "$DEST/$APP" ]; then
  say "  · 이미 설치된 앱을 찾았습니다"
else
  say "  ✕ 같은 폴더에 Moka-Pet-*.dmg 가 없고, 설치된 앱도 없습니다."
  say "    압축을 푼 폴더 안에서 이 파일을 실행해 주세요."
  say ""
  read -r -p "  창을 닫으려면 Enter" _
  exit 1
fi

# ── 격리 표시 제거 ────────────────────────────────────────────────
say "  · \"인터넷에서 받은 파일\" 표시를 뗍니다"
xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null

# 복사 과정에서 서명이 어긋났을 수 있으니 한 번 더 맞춰 준다
if ! codesign --verify --deep --strict "$DEST/$APP" >/dev/null 2>&1; then
  say "  · 앱 서명을 정리합니다"
  codesign --force --deep --sign - "$DEST/$APP" >/dev/null 2>&1
fi

say ""
say "  ✓ 끝났습니다. Moka Pet 을 실행합니다."
say ""
open -a "$DEST/$APP" 2>/dev/null

sleep 1
exit 0
