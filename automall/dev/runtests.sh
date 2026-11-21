#!/bin/bash
# 사용법: AM_DEV=/tmp/am_dev bash automall/dev/runtests.sh 이름1 이름2 ...   (test_ 접두어 없이, 한꺼번에 돌려요)
# 기록은 $AM_DEV/out_이름.log, 결과 한 줄: 이름 exit=0 PASS=n FAIL=n
HERE="$(cd "$(dirname "$0")" && pwd)"
export AM_DEV="${AM_DEV:-/tmp/am_dev}"
cd "$AM_DEV" || exit 1
for t in "$@"; do
  ( timeout 560 node "$HERE/tests/test_$t.js" > "out_$t.log" 2>&1; echo "$t exit=$? PASS=$(grep -c '^PASS' out_$t.log) FAIL=$(grep -c '^FAIL' out_$t.log)" ) &
done
wait
