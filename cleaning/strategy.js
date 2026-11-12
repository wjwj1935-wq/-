/* 청소용품 상세페이지 전략 (전략 1 · 2026-11-11)
   ─────────────────────────────────────────────
   이 파일이 '전략'이에요. 구역 순서, 글 쓰는 규칙, 장면 사진 지시문이 모두 여기 있어요.
   전략을 고칠 때는 이 파일을 고치고, app.js 의 VER 와 version.json 숫자를 하나 올려요.
   (손잡이·도어는 전략이 달라서 handle/ 폴더에 따로 있어요. 여기 것을 가져다 쓰지 않아요.)

   왜 이 순서인가
   청소용품은 '써 보면 편하다'가 사는 이유예요. 규격보다 쓰는 장면이 먼저 보여야 해요.
   그래서 ① 한눈에 보여 주고 ② 불편에 공감하고 ③ 해결을 보여 준 뒤
   ④ 가까이·쓰는 모습·집 안 곳곳 순서로 장면을 쌓고, 마지막에 ⑤ 구성품·확인할 점·질문으로 망설임을 없애요. */
window.STRATEGY={
  id:'cleaning',name:'청소용품',ver:1,updated:'2026-11-11',

  /* 구역 순서. 순서를 바꾸려면 이 줄의 순서만 바꾸면 돼요. why 는 그 구역이 하는 일이에요. */
  sections:[
    {key:'hero',    name:'첫 화면',        why:'3초 안에 무엇이고 왜 좋은지'},
    {key:'pain',    name:'불편했던 점',    why:'"이런 불편 있으셨죠" 공감 · 진짜 제품 사진을 여기서 보여 줘요'},
    {key:'solve',   name:'먼저 해결했어요', why:'불편 하나에 해결 하나씩 짝지어 보여 줘요'},
    {key:'material',name:'가까이 본 모습', why:'재질과 질감을 눈으로 확인'},
    {key:'craft',   name:'만듦새',         why:'어두운 배경으로 분위기를 바꿔 지루하지 않게'},
    {key:'perform', name:'쓸어 보면',      why:'쓰고 난 결과를 보여 줘요'},
    {key:'easy',    name:'쓰기 편해요',    why:'사람이 쓰는 모습으로 "나도 쓰겠다"'},
    {key:'check',   name:'살펴볼 것들',    why:'재질·크기·구성 — 적어 준 사실만 표로'},
    {key:'places',  name:'집 안 곳곳',     why:'여러 곳에서 쓰는 모습 네 칸'},
    {key:'set',     name:'구성품',         why:'받으면 무엇이 오는지'},
    {key:'caution', name:'확인할 점',      why:'아쉬운 점을 먼저 말해 믿음을 줘요'},
    {key:'faq',     name:'자주 묻는 질문', why:'마지막 망설임 없애기'},
    {key:'foot',    name:'안내',           why:'연출 이미지 안내 · 판매자 정보'}
  ],

  /* 판매자가 적는 사실. 여기 적은 것만 사실로 써요(AI가 지어내지 않아요). */
  facts:[
    {key:'material',label:'재질',      ph:'예: 갈대, 손잡이는 나무'},
    {key:'size',    label:'크기·무게', ph:'예: 길이 85cm, 약 300g'},
    {key:'origin',  label:'만든 곳',   ph:'예: 국내 제조'},
    {key:'parts',   label:'구성품',    ph:'예: 빗자루 1개, 쓰레받기 1개'},
    {key:'memo',    label:'알리고 싶은 점', ph:'예: 머리카락이 잘 모여요. 가벼워요.', long:true, hidden:true},
    {key:'caution', label:'손님이 미리 알 점', ph:'예: 천연 소재라 색이 조금씩 달라요.', long:true, hidden:true}
  ],

  /* 글 쓰는 규칙. AI에게 그대로 전해요. */
  copyRules:[
    '쉬운 우리말로, "~해요" 말투로 씁니다. 영어·어려운 한자어는 쓰지 않습니다.',
    '제목(title)은 두 줄, 한 줄에 12자 안쪽으로 쓰고 줄 사이는 \\n 으로 나눕니다. 둘째 줄이 가장 중요한 말입니다.',
    '본문(body, sub)은 두 문장 안쪽으로 짧게 씁니다.',
    '사실(재질, 원산지·만든 곳, 크기·무게, 수량, 인증, 숫자)은 [판매자가 확인해 준 사실]에 있는 것만 씁니다. 거기 없는 사실은 지어내지 말고, 사진에서 눈으로 분명히 보이는 것(색, 구성품 종류)만 말합니다.',
    '후기, 판매량, 1위, 할인, 무료배송, 효능 숫자(예: 99.9%)는 쓰지 않습니다. 다른 회사 제품을 깎아내리지 않습니다.',
    'pain.items 는 이 제품을 사려는 사람이 평소 겪는 불편 3가지(각 16자 안쪽)입니다. solve.rows 는 그 불편과 이 제품의 해결을 짝지은 2~3줄입니다.',
    'caution.items 는 사기 전에 알아야 할 솔직한 점 2~3가지입니다. [손님이 미리 알 점]이 있으면 그것을 먼저 넣습니다.',
    'faq.items 는 이 제품을 살 때 실제로 궁금해할 질문 2~3개입니다. 답에도 지어낸 사실을 넣지 않습니다.',
    'scene 의 값은 이미지 생성용이라 영어로 씁니다. subject 는 제품을 본 그대로(색·재질·부품 수) 적습니다.'
  ],

  /* 장면 사진. 모든 장면에 원본 사진을 함께 보내서 같은 제품으로 그리게 해요.
     h = AI가 제품을 보고 적은 말(subject 제품, action 쓰는 동작, part 일하는 부분, places 네 곳, setItems 구성품) */
  sceneBase:'The attached photo(s) show the exact product to depict. Keep the product identical to the photo: the same shape, proportions, colors, materials and the same number of parts. Do not redesign it and do not add or remove parts. Photorealistic photograph, soft natural daylight, bright and tidy Korean apartment interior with warm neutral tones. No text, letters, numbers, logos, watermarks, borders or collage.',
  scenes:[
    {key:'hero',  label:'첫 화면',       aspect:'4:5',
     prompt:h=>'Scene: the product ('+h.subject+') resting naturally in a bright living room with a clean light wooden floor, sheer curtains and morning light. The whole product is visible, not cropped, and is the clear focus in the lower two-thirds of the frame. Keep the top third calm and bright (plain wall or soft light) with no objects.'},
    {key:'use1',  label:'쓰는 손',       aspect:'4:3',
     prompt:h=>'Scene: a close view of hands '+h.action+'. Show only hands and forearms, no face. The product is in sharp focus and fully recognizable.'},
    {key:'detail',label:'가까이 본 모습', aspect:'4:3',
     prompt:h=>'Scene: a macro close-up of the '+h.part+' of the product, showing the real material texture in sharp detail. Shallow depth of field, soft side light, simple light background.'},
    {key:'craft', label:'만듦새',        aspect:'4:3',
     prompt:h=>'Scene: a close-up of how the product is put together (joints, binding, finish) on a dark charcoal background with low-key studio light. Natural, not exaggerated. Product only, no hands.'},
    {key:'floor', label:'쓰고 난 모습',  aspect:'4:3',
     prompt:h=>'Scene: a low-angle close-up near the floor showing the product in use, '+h.action+', with the result clearly visible. No people, at most a hand at the edge of the frame.'},
    {key:'use2',  label:'쓰는 사람',     aspect:'3:4',
     prompt:h=>'Scene: a person in comfortable home clothes easily using the product beside a bright window. Show the person from behind or from the shoulders down, with no visible face. The product is fully visible and in focus.'},
    {key:'places',label:'집 안 곳곳 (4칸)', aspect:'1:1', sheet:4,
     prompt:h=>'Create ONE image divided into a 2x2 grid of four equal square photos separated by thin white lines. Each square shows the same product in a different place of a home: top-left '+h.places[0]+', top-right '+h.places[1]+', bottom-left '+h.places[2]+', bottom-right '+h.places[3]+'. The product must look identical in all four squares.'},
    {key:'set',   label:'구성품',        aspect:'4:3',
     prompt:h=>'Scene: all parts of the product ('+h.setItems+') laid out neatly side by side on a plain warm-white background, seen straight on, with soft even studio light and gentle shadows. Show each part once, complete and not cropped.'}
  ],
  /* AI가 장면 말을 못 적었을 때 쓰는 기본값 */
  sceneDefault:{subject:'the cleaning product in the photo',action:'using the product to clean a light wooden floor',part:'working part',
    places:['an apartment entrance','a kitchen floor near the counter','a sunny balcony','a bedroom floor beside the bed'],setItems:'every part shown in the photo'},

  /* 예시 글. '예시로 보기'를 누르면 이 글이 들어가요(키 없이 흐름만 볼 때). */
  sample:{
    kind:'빗자루 세트',
    hero:{eyebrow:'가볍게, 깔끔하게',title:'쓱 한 번이면\n바닥이 말끔해요',sub:'꺼내기 쉬워서 자주 쓰게 되는 빗자루와 쓰레받기 세트예요.'},
    pain:{title:'청소할 때마다\n이런 점 불편하셨죠?',items:['청소기 꺼내기 번거로워요','머리카락이 자꾸 남아요','세워 둘 곳이 마땅치 않아요']},
    solve:{eyebrow:'그래서 이렇게 만들었어요',title:'불편했던 점부터\n먼저 해결했어요',rows:[
      {pain:'꺼내기 번거로워요',fix:'가벼워서 한 손으로 바로 들어요'},
      {pain:'머리카락이 남아요',fix:'촘촘한 솔이 한 번에 모아요'},
      {pain:'둘 곳이 없어요',fix:'쓰레받기에 끼워 세워 두세요'}]},
    material:{eyebrow:'가까이 보면',title:'솔 한 올 한 올이\n촘촘해요',body:'솔 끝이 고르고 촘촘해요. 가까이에서 찍은 모습으로 확인해 보세요.'},
    craft:{eyebrow:'만듦새',title:'자주 쓰는 물건이라\n꼼꼼하게 만들었어요',body:'이음새와 마감을 먼저 살폈어요.',badges:['이음새','마감','쓰임새']},
    perform:{eyebrow:'쓸어 보면',title:'먼지와 머리카락이\n한곳에 모여요',body:'솔이 바닥에 고르게 닿아서 지나간 자리가 깔끔해요.'},
    easy:{eyebrow:'매일 써도',title:'가벼워서\n손목이 편해요',body:'생각날 때 바로 들고 쓱쓱. 힘을 주지 않아도 돼요.'},
    check:{title:'사기 전에\n살펴볼 것들'},
    places:{eyebrow:'어디서나',title:'집 안 곳곳에서\n가까이 두고 써요',body:'현관 모래부터 주방 부스러기까지, 보일 때 바로 치우세요.',labels:['현관','주방','베란다','방']},
    set:{eyebrow:'구성',title:'받으면 바로\n쓸 수 있어요',items:[{name:'빗자루',desc:'가볍고 촘촘한 솔'},{name:'쓰레받기',desc:'바닥에 딱 붙는 입구'}]},
    caution:{eyebrow:'솔직하게',title:'이런 점은\n확인해 주세요',items:['모니터에 따라 색이 조금 다르게 보일 수 있어요','처음에는 솔에서 잔털이 조금 빠질 수 있어요']},
    faq:{title:'자주 묻는 질문',items:[
      {q:'젖은 바닥에도 써도 되나요?',a:'마른 바닥에서 쓰는 것을 권해요. 젖었다면 그늘에서 말려 주세요.'},
      {q:'어떻게 보관하나요?',a:'쓰레받기에 끼워 세워 두면 솔이 눌리지 않아요.'}]},
    foot:{seller:''},
    scene:{subject:'a broom and dustpan set',action:'sweeping dust and hair on a light wooden floor with the broom',part:'broom bristles',
      places:['an apartment entrance with shoes','a kitchen floor near the counter','a sunny balcony','a bedroom floor beside the bed'],setItems:'the broom and the dustpan'}
  }
};
