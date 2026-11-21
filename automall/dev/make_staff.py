#!/usr/bin/env python3
"""직원 배포용 '파일 하나' 만들기.
 - 앱 본체(w/am_work.html)에서 인터넷 주소로 불러오던 도구 두 개(JSZip 3.10.1 · html2canvas 1.4.1)를 파일 안에 그대로 넣는다.
   → 파일 하나만 있으면 인터넷 없이도 열리고 저장(zip)·이미지로 저장이 된다(구글·클로드로 이미지·글을 만들 때만 인터넷이 필요).
 - 글꼴(Noto Sans KR)은 인터넷이 있으면 받고, 없으면 컴퓨터에 있는 한글 글꼴(맑은 고딕 등)로 보인다.
 - 사장님 키·메일·개인 정보는 들어 있지 않다(검사로 확인).
 - 앱 본체는 한 글자도 바꾸지 않는다(도구를 안에 넣는 것만 다르다)."""
import sys, re
import os
B = os.environ.get('AM_DEV', '/tmp/am_dev').rstrip('/') + '/'
src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
libs = [
    ('html2canvas', B + 'h2c/node_modules/html2canvas/dist/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
    ('jszip', B + 'jz/node_modules/jszip/dist/jszip.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'),
]
for name, path, url in libs:
    code = open(path, encoding='utf-8').read()
    if '</script' in code.lower():
        code = re.sub(r'</script', r'<\\/script', code, flags=re.I)
    pat = re.compile(r'<script src="' + re.escape(url) + r'"[^>]*></script>')
    m = pat.findall(s)
    if len(m) != 1:
        sys.exit('%s 불러오는 줄이 %d번 나옴(1번이어야 함)' % (name, len(m)))
    s = pat.sub(lambda _m: '<script>/* ' + name + ' (파일 안에 넣어 둔 도구) */\n' + code + '\n</script>', s)
# 남은 바깥 주소 확인: 글꼴 하나만 남아야 한다
left = re.findall(r'<(?:script|link)[^>]*(?:src|href)="(https?://[^"]+)"', s)
print('남은 바깥 주소:', left)
assert left == ['https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;800&display=swap'], left
for bad in ['AIza', 'sk-ant', '@gmail', '@naver']:
    assert bad not in s, bad
open(out, 'w', encoding='utf-8').write(s)
print('저장:', out, len(s.encode('utf-8')), 'bytes')
