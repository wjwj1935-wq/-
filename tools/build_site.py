# src/index.fragment.html (Claude 게시용 조각) -> index.html (인터넷 주소용 완성 파일) + version.json
import pathlib,re
d=pathlib.Path(__file__).resolve().parent.parent
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
(d/'.nojekyll').write_text('',encoding='utf8')
print('index.html',len(out)//1024,'KB · version',ver)
