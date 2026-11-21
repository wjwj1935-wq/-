#!/usr/bin/env python3
"""시험용 가짜 그림 만들기(대표님 사진·영상은 저장소에 없어요). 사용: AM_DEV=/tmp/am_dev python3 -I make_fixtures.py
 - up/white_prod.png    흰 바탕에 짙은 회색 레버 손잡이(원본 제품 사진 대신)
 - up/white_prod_R.png  좌우로 뒤집은 것
 - up/crop_orig.png     같은 그림(일부 시험이 쓰는 이름)
 - real_in/{white,walnut,gray,black}.jpg  문 색 느낌의 단색 사진(문에 단 사진 대신)
 진짜 사진이 필요한 시험(글-사진 일치 검수 등)은 가짜로는 안 돌 수 있어요."""
import os, pathlib
from PIL import Image, ImageDraw, ImageFilter
B = pathlib.Path(os.environ.get('AM_DEV', '/tmp/am_dev'))
(B / 'up').mkdir(parents=True, exist_ok=True)
(B / 'real_in').mkdir(parents=True, exist_ok=True)

W, H = 1600, 1200
im = Image.new('RGB', (W, H), (255, 255, 255))
g = ImageDraw.Draw(im)
cx, cy = 1180, 600
g.ellipse((cx - 150, cy - 150, cx + 150, cy + 150), fill=(72, 74, 80))
g.ellipse((cx - 108, cy - 108, cx + 108, cy + 108), fill=(88, 90, 98))
g.rounded_rectangle((330, cy - 40, cx - 40, cy + 40), radius=40, fill=(72, 74, 80))
im = im.filter(ImageFilter.GaussianBlur(1.2))
im.save(B / 'up' / 'white_prod.png')
im.save(B / 'up' / 'crop_orig.png')
im.transpose(Image.FLIP_LEFT_RIGHT).save(B / 'up' / 'white_prod_R.png')

for name, col in {'white': (240, 240, 236), 'walnut': (110, 78, 52), 'gray': (170, 172, 176), 'black': (28, 29, 32)}.items():
    d = Image.new('RGB', (1024, 1024), col)
    dd = ImageDraw.Draw(d)
    dd.rounded_rectangle((520, 470, 900, 530), radius=30, fill=(200, 200, 204))
    dd.ellipse((860, 440, 960, 560), fill=(190, 190, 194))
    d.save(B / 'real_in' / (name + '.jpg'), quality=88)
print('만들었어요 →', B)
