# 자동몰 바로가기 아이콘 만들기: python3 -I tools/make_icons_automall.py
# 손잡이 제작기(남색 + 금색 손잡이)와 한눈에 구분되게: 짙은 초록 바탕 + 크림색 문 + 금색 손잡이.
# 둥근 모서리 없이 꽉 채우고(휴대폰이 알아서 둥글게 잘라요) 그림은 가운데 안전 구역 안에만 둡니다.
import pathlib
from PIL import Image, ImageDraw

GREEN = (14, 74, 68)
DOOR = (246, 240, 224)
PANEL = (225, 216, 192)
GOLD = (217, 180, 94)

d = pathlib.Path(__file__).resolve().parent.parent / 'automall' / 'icons'
d.mkdir(parents=True, exist_ok=True)

N = 1024  # 크게 그린 뒤 줄여서 가장자리를 매끈하게
im = Image.new('RGB', (N, N), GREEN)
g = ImageDraw.Draw(im)

x0, y0, x1, y1 = 322, 190, 702, 834                                   # 문
g.rounded_rectangle((x0, y0, x1, y1), radius=34, fill=DOOR)
g.rounded_rectangle((x0 + 48, y0 + 50, x1 - 48, y0 + 270), radius=18, fill=PANEL)   # 위 판넬
g.rounded_rectangle((x0 + 48, y0 + 330, x1 - 48, y1 - 50), radius=18, fill=PANEL)   # 아래 판넬
hx, hy = x1 - 74, (y0 + y1) // 2 + 10
g.ellipse((hx - 46, hy - 46, hx + 46, hy + 46), fill=GOLD)             # 손잡이 받침
g.rounded_rectangle((hx - 150, hy - 20, hx, hy + 20), radius=20, fill=GOLD)   # 레버

for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')):
    im.resize((size, size), Image.LANCZOS).save(d / name, optimize=True)
    print(name, size)
