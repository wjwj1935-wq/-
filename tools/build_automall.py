# automall/src/index.fragment.html (자동몰 게시용 조각) -> automall/index.html (인터넷 주소용 완성 파일) + automall/version.json
# 손잡이 상세페이지 제작기(루트, tools/build_site.py)와는 따로 작동합니다. 주소: /-/automall/
import pathlib,re
d=pathlib.Path(__file__).resolve().parent.parent/'automall'
s=(d/'src'/'index.fragment.html').read_text(encoding='utf8')
i=s.index('<div id="app">')
head,body=s[:i],s[i:]
out=('<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">'
     '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
     '<style>:root{color-scheme:light}html,body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>\n'
     +head+'</head><body>\n'+body+'\n</body></html>\n')
(d/'index.html').write_text(out,encoding='utf8')
ver=int(re.search(r"VER=(\d+)",s).group(1))
(d/'version.json').write_text('{"v":%d}\n'%ver,encoding='utf8')
print('automall/index.html',len(out)//1024,'KB · version',ver)
