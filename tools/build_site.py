# 손잡이 제작기: handle/src/index.fragment.html (Claude 게시용 조각) -> handle/index.html (인터넷 주소용 완성 파일) + handle/version.json
# 쓰는 법: python3 -I tools/build_site.py
import pathlib,re
d=pathlib.Path(__file__).resolve().parent.parent
h=d/'handle'
s=(h/'src'/'index.fragment.html').read_text(encoding='utf8')
i=s.index('<div id="app">')
head,body=s[:i],s[i:]
out=('<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">'
     '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
     '<style>:root{color-scheme:light}html,body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>\n'
     +head+'</head><body>\n'+body+'\n</body></html>\n')
(h/'index.html').write_text(out,encoding='utf8')
ver=int(re.search(r"VER=(\d+)",s).group(1))
(h/'version.json').write_text('{"v":%d}\n'%ver,encoding='utf8')
# 예전 주소(맨 위)에서 열어 둔 화면이 '새 버전' 단추를 보고 새로고침하도록, 맨 위 version.json도 같이 올려요
(d/'version.json').write_text('{"v":%d}\n'%ver,encoding='utf8')
(d/'.nojekyll').write_text('',encoding='utf8')
print('handle/index.html',len(out)//1024,'KB · version',ver)
