# 바로가기(홈 화면·바탕화면) 아이콘 만들기: python3 -I tools/make_icons.py
# 남색 바탕 + 금색 문 손잡이. 둥근 모서리 없이 꽉 채우고(휴대폰이 알아서 둥글게 잘라요) 그림은 가운데 안전 구역 안에만 둡니다.
import pathlib
from PIL import Image, ImageDraw

NAVY = (16, 28, 59)
GOLD = (217, 180, 94)

d = pathlib.Path(__file__).resolve().parent.parent / 'icons'
d.mkdir(exist_ok=True)

N = 1024  # 크게 그린 뒤 줄여서 가장자리를 매끈하게
im = Image.new('RGB', (N, N), NAVY)
g = ImageDraw.Draw(im)

cx, cy = 380, 512
g.ellipse((cx - 200, cy - 200, cx + 200, cy + 200), fill=GOLD)    # 손잡이 받침(로제트)
g.ellipse((cx - 128, cy - 128, cx + 128, cy + 128), fill=NAVY)    # 안쪽 홈
g.ellipse((cx - 74, cy - 74, cx + 74, cy + 74), fill=GOLD)        # 가운데 축
g.rounded_rectangle((cx, cy - 46, 800, cy + 46), radius=46, fill=GOLD)  # 레버 손잡이

for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')):
    im.resize((size, size), Image.LANCZOS).save(d / name, optimize=True)
    print(name, size)
