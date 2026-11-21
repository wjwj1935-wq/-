#!/bin/bash
# 자동몰 시험 환경 만들기: AM_DEV=/tmp/am_dev bash automall/dev/setup_dev.sh
# - 작업 폴더 만들기 · jszip/html2canvas 설치 · 가짜 시험 그림 · 시험할 파일(w/am_work.html)과 직원용 단일 파일 만들기
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
export AM_DEV="${AM_DEV:-/tmp/am_dev}"
mkdir -p "$AM_DEV"/{w,staff,up,real_in,jz,h2c,w/shots}
[ -d "$AM_DEV/jz/node_modules/jszip" ] || (cd "$AM_DEV/jz" && npm init -y >/dev/null 2>&1 && npm install jszip@3.10.1 >/dev/null 2>&1)
[ -d "$AM_DEV/h2c/node_modules/html2canvas" ] || (cd "$AM_DEV/h2c" && npm init -y >/dev/null 2>&1 && npm install html2canvas@1.4.1 >/dev/null 2>&1)
python3 -I "$HERE/make_fixtures.py"
cp "$REPO/automall/index.html" "$AM_DEV/w/am_work.html"
VER=$(python3 -I -c "import re,sys;print(re.search(r'VER=(\d+)',open('$REPO/automall/index.html',encoding='utf-8').read()).group(1))")
python3 -I "$HERE/make_staff.py" "$AM_DEV/w/am_work.html" "$AM_DEV/staff/자동몰_상세페이지_제작기_v${VER}.html"
# 99(손잡이 제작기)와 안 섞이는지 보는 시험(am_separate)이 쓰는 99 단일 파일
cp "$REPO/index.html" "$AM_DEV/w/v99.html"
python3 -I "$HERE/make_staff.py" "$AM_DEV/w/v99.html" "$AM_DEV/staff/상세페이지_제작기_v99.html"
echo "준비 끝: AM_DEV=$AM_DEV · 자동몰 버전 $VER"
