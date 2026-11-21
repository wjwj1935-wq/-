/* 자동몰 상세페이지 제작기 v74 — '쇼핑몰에 올리기'(네이버 쇼핑 파일 묶음) 시험 */
const http = require('http');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const BASE = (process.env.AM_DEV || '/tmp/am_dev');
const JSZip = require(BASE + '/jz/node_modules/jszip');
const HTML = fs.readFileSync(BASE + '/w/am_work.html', 'utf8');
const H2C = fs.readFileSync(BASE + '/h2c/node_modules/html2canvas/dist/html2canvas.min.js');
const JZ = fs.readFileSync(BASE + '/jz/node_modules/jszip/dist/jszip.min.js');
const PHOTO = (process.env.AM_DEV || '/tmp/am_dev') + '/up/crop_orig.png';
const WHITE = BASE + '/up/white_prod.png', SCENE = BASE + '/up/scene_tile.png';
const OUT = BASE + '/mkt_out'; fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const SEED = { v: 3, name: '시험 손잡이',
  hero: { badge: '검정 레버 방문 손잡이', title: '문에 차분하게 어울리는\n검정 레버 손잡이', sub: '문에 달았을 때의 모습을 먼저 보고 고르세요.' },
  concept: { eyebrow: 'CONCEPT', title: '가는 결이 있는 긴 레버', body: '길고 얇은 레버에 가는 결이 얇게 나 있어요.', photo: null },
  cta: { title: '우리 집 문에 달아 보세요', sub: '궁금한 점은 판매자에게 물어보세요.' },
  size: { len: '150', wid: '20', cap: '', shape: 'rect', capW: '70', capH: '54', ref: 'card', extra: [], note: '' } };
let PORT = 0;
const server = http.createServer((req, res) => { if (req.url.split('?')[0] === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(HTML); } else { res.writeHead(404); res.end('no'); } });

async function open(browser, seed, extraInit) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url();
    if (/html2canvas\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: H2C });
    if (/jszip\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: JZ });
    if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) return r.continue(); return r.abort(); });
  await page.addInitScript((s) => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', s); } catch (e) {} }, JSON.stringify(seed || SEED));
  if (extraInit) await page.addInitScript(extraInit.fn, extraInit.arg);
  await page.goto('http://127.0.0.1:' + PORT + '/');
  await page.waitForSelector('#paper .sec', { state: 'attached' });
  await page.waitForTimeout(800);
  return { ctx, page, errors };
}
const waitMsg = (page, re, t) => page.waitForFunction((s) => new RegExp(s).test((document.querySelector('#msMsg') || {}).textContent || ''), re, { timeout: t || 120000 });
const imgInfo = (page, sel) => page.evaluate(async (s) => { const i = document.querySelector(s); if (!i) return null; await i.decode().catch(() => {}); return { w: i.naturalWidth, h: i.naturalHeight, src: i.src }; }, sel);
/* 대표 이미지의 제품 자리: 모서리 색과 다른 곳의 네모를 재서 가운데·여백을 본다 */
const prodBox = (page) => page.evaluate(async () => {
  const i = document.querySelector('.mkt-main img'); await i.decode();
  const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
  const px = (x, y) => { const k = (y * W + x) * 4; return [d[k], d[k + 1], d[k + 2]]; };
  const cs = [px(3, 3), px(W - 4, 3), px(3, H - 4), px(W - 4, H - 4)], bg = [0, 1, 2].map((ch) => cs.reduce((a, p) => a + p[ch], 0) / 4);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const p = px(x, y); if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 70) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  let ringMin = 255; for (let t = 0; t < 10; t++) for (let k = 0; k < W; k += 3) for (const [x, y] of [[k, t], [k, H - 1 - t], [t, k], [W - 1 - t, k]]) { const p = px(x, y); ringMin = Math.min(ringMin, p[0], p[1], p[2]); }
  return { W, H, x0, y0, x1, y1, ringMin, bg: bg.map(Math.round), cx: (x0 + x1) / 2 / W, cy: (y0 + y1) / 2 / H, fw: (x1 - x0) / W, fh: (y1 - y0) / H };
});
const ffdim = (f) => { const o = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'csv=p=0', f]).toString().trim().split(','); return { codec: o[0], w: +o[1], h: +o[2] }; };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 단추·창·탭 · 나중에 만들 쇼핑몰 · 사진 없을 때 */
  {
    const { ctx, page, errors } = await open(browser);
    ok(await page.locator('#btnMarket').count() === 1 && /쇼핑몰에 올리기/.test(await page.textContent('#btnMarket')), '단추: 윗줄에 "쇼핑몰에 올리기" 단추가 있다');
    { const L = (await page.locator('.top-actions .btn').allTextContents()).map((t) => t.trim()); ok(L.indexOf('상세페이지로 영상 만들기') === L.indexOf('이미지로 저장') + 1 && L.indexOf('영상 자동 등록') === L.indexOf('상세페이지로 영상 만들기') + 1 && L.indexOf('쇼핑몰에 올리기') === L.indexOf('영상 자동 등록') + 1, '단추 순서: 이미지로 저장 → 영상 만들기 → 영상 자동 등록 → 쇼핑몰에 올리기 (앞서 부탁하신 자리는 그대로) → ' + L.join(' | ')); }
    await page.click('#btnMarket'); await page.waitForSelector('#msBody .mkt-tabs');
    const tabs = await page.locator('[data-mt]').allTextContents();
    ok(tabs.length === 5 && /네이버/.test(tabs[0]) && /쿠팡/.test(tabs[1]) && /11번가/.test(tabs[2]) && /옥션/.test(tabs[3]) && /지마켓/.test(tabs[4]), '창: 네이버·쿠팡·11번가·옥션·지마켓 탭이 있다 → ' + JSON.stringify(tabs.map((t) => t.trim())));
    ok(tabs.slice(1).every((t) => /나중에/.test(t)) && !/나중에/.test(tabs[0]), '창: 네이버만 쓸 수 있고 나머지 4곳은 "(나중에)"로 표시된다');
    ok(await page.isDisabled('#msGo') && /제품 사진 한 장.*먼저 넣어/.test(await page.textContent('#msBody')), '사진 없음: 만들기 단추가 꺼져 있고 사진을 먼저 넣으라고 알려 준다');
    ok(/대표 이미지.*1000×1000/.test(await page.textContent('#msBody')) && /공식 문서에서 확인하지 못했어요/.test(await page.textContent('#msBody')) && /자동으로 올리지는 않아요/.test(await page.textContent('#msBody')), '안내: 크기는 공식 값이 아니라는 것과 자동으로 올리지 않는다는 것을 숨기지 않고 적었다');
    {
      const top = page.locator('#msBody > .confirm').first();
      const bx = await top.boundingBox();
      ok(await top.isVisible() && /자동으로 올리지는 않아요/.test(await top.textContent()) && bx.y < 600, '맨 위 안내: "자동으로 올리지는 않아요"가 창 맨 위 노란 칸에 보인다 → y=' + Math.round(bx.y));
      const first = await page.evaluate(() => { const b = document.querySelector('#msBody'); return [...b.children].slice(0, 3).map((c) => c.className); });
      ok(first[1] === 'confirm' && first[2] === 'tip', '맨 위 안내: 탭 바로 아래 첫 칸이고, 그 다음이 설명 칸이다 → ' + JSON.stringify(first));
      const todo = await page.locator('#msTodo li').allTextContents();
      ok(todo.length === 8 && ['카테고리', '판매가', '옵션', '상품주요정보', '상품정보제공고시', '배송', 'A/S', '태그'].every((k, i) => todo[i].indexOf(k) >= 0), '체크리스트: 직접 입력할 항목 8가지가 창에 보인다 → ' + todo.map((t) => t.split(' — ')[0]).join(', '));
      ok(/연출 사진이에요\(옵션이 아니에요\)/.test(todo[2]) && /공식 문서가 아니라서/.test(await page.textContent('#msTodo')), '체크리스트: 문 색상 그림은 옵션이 아니라고 알려 주고, 공식 문서가 아니라고 밝힌다');
    }
    const a = page.locator('#msBody a.btn'); ok(await a.getAttribute('href') === 'https://sell.smartstore.naver.com/' && await a.getAttribute('target') === '_blank' && /noopener/.test(await a.getAttribute('rel')), '링크: 스마트스토어센터는 새 창으로 열리고 noopener가 걸려 있다');
    for (const k of ['coupang', 'st11', 'auction', 'gmarket']) {
      await page.click('[data-mt="' + k + '"]');
      const t = await page.textContent('#msBody');
      ok(/나중에 만들어요/.test(t) && /공식 값은 아니에요|찾지 못했어요/.test(t) && await page.locator('#msGo').count() === 0, `탭(${k}): "나중에 만들어요" 안내만 나오고 만들기 단추는 없다`);
    }
    await page.click('[data-mt="naver"]'); await page.waitForSelector('#msGo');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await page.locator('#msBody').count() === 0 || !(await page.locator('#msBody').isVisible()), '닫기: Esc로 닫힌다(만드는 중이 아닐 때)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 2. 사진 한 장으로 만들기 → 결과·zip·그림 확인 */
  {
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(WHITE); await page.waitForTimeout(2500);
    await page.click('#btnMarket'); await page.waitForSelector('#msGo');
    ok(!(await page.isDisabled('#msGo')), '사진 있음: 만들기 단추가 눌린다');
    await page.click('#msGo');
    await page.waitForTimeout(300);
    ok(await page.isDisabled('#msGo') && /멈추기/.test(await page.textContent('#msClose')), '만드는 중: 만들기 단추는 잠기고 닫기 단추는 "멈추기"로 바뀐다');
    await page.mouse.click(3, 3); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    ok(await page.locator('#msGo').isVisible(), '만드는 중: 바깥을 누르거나 Esc를 눌러도 창이 닫히지 않는다');
    await waitMsg(page, '다 만들었어요');
    const res = await page.evaluate(() => ({ checks: [...document.querySelectorAll('#msRes .checks li')].map((l) => l.textContent), ex: document.querySelectorAll('#msRes .mkt-grid')[0].children.length, det: document.querySelectorAll('#msRes .mkt-grid.det, #msRes .mkt-th.det').length, labels: [...document.querySelectorAll('#msRes .mkt-th span')].map((s) => s.textContent) }));
    console.log('   결과 안내:', res.checks.join(' / '));
    const mi = await imgInfo(page, '.mkt-main img');
    ok(mi && mi.w === 1000 && mi.h === 1000, `대표 이미지: 정사각 1000×1000이다 → ${mi && mi.w}×${mi && mi.h}`);
    ok(res.ex === 3, '추가 이미지: 사진이 제품 사진 한 장뿐이면 확대 3컷만 나온다 → ' + res.ex + '장');
    ok(res.det >= 1 && res.labels.filter((l) => /· 860×\d+/.test(l)).length === res.det, `상세 조각: ${res.det}개, 모두 가로 860이다`);
    ok(res.checks.some((c) => /^✓ 대표 이미지: 정사각 1000×1000 JPG/.test(c)) && res.checks.some((c) => /글자·로고는 넣지 않았어요/.test(c)), '확인 목록: 대표 이미지 규격과 "글자·로고 없음"이 적혀 있다');
    const pb = await prodBox(page);
    console.log('   제품 자리:', JSON.stringify(pb));
    ok(Math.abs(pb.cx - .5) < .06 && Math.abs(pb.cy - .5) < .06 && pb.fw <= .86 && pb.fh <= .86 && Math.max(pb.fw, pb.fh) >= .78, '대표 이미지: 제품이 가운데에 크게(가로 약 84%) 있고 사방에 여백이 있다');
    ok(pb.ringMin >= 250 && pb.bg.every((v) => v >= 254), '대표 이미지: 배경이 이음매 없이 순백에 가깝다(테두리에서 가장 어두운 값 ' + pb.ringMin + ')');
    ok(res.checks.some((c) => /제품을 가운데에 크게 놓았어요/.test(c)) && res.checks.some((c) => /^✓ 대표 이미지 배경이 흰색이에요/.test(c)), '확인 목록: 흰 배경 위에 놓았고 "배경이 흰색이에요"라고 나온다');
    const dl = page.waitForEvent('download'); await page.click('#msZip'); const d = await dl;
    ok(/^naver_images_\d{8}\.zip$/.test(d.suggestedFilename()), '저장: 파일 이름이 naver_images_날짜.zip 이다 → ' + d.suggestedFilename());
    const zp = OUT + '/' + d.suggestedFilename(); await d.saveAs(zp);
    const z = await JSZip.loadAsync(fs.readFileSync(zp)), names = Object.keys(z.files).sort();
    console.log('   zip 안:', names.join(', '));
    ok(names[0] === '01_main.jpg' && names.includes('README.txt') && names.filter((n) => /^02_extra_\d\d\.jpg$/.test(n)).length === 3 && names.filter((n) => /^03_detail_\d\d\.jpg$/.test(n)).length === res.det, 'zip: 대표 1 + 추가 3 + 상세 조각 + README.txt가 들어 있다');
    const dims = {}; for (const n of names.filter((x) => /\.jpg$/.test(x))) { const f = OUT + '/' + n; fs.writeFileSync(f, await z.files[n].async('nodebuffer')); dims[n] = ffdim(f); }
    ok(dims['01_main.jpg'].codec === 'mjpeg' && dims['01_main.jpg'].w === 1000 && dims['01_main.jpg'].h === 1000, 'zip: 01_main.jpg 는 실제로 1000×1000 JPEG 이다');
    ok(names.filter((n) => /^02_extra/.test(n)).every((n) => dims[n].w === 1000 && dims[n].h === 1000) && names.filter((n) => /^03_detail/.test(n)).every((n) => dims[n].w === 860 && dims[n].h > 100 && dims[n].h <= 2400 + 1400), 'zip: 추가 이미지는 모두 1000×1000, 상세 조각은 모두 가로 860이다 → ' + names.filter((n) => /^03_detail/.test(n)).map((n) => dims[n].w + '×' + dims[n].h).join(', '));
    const rd = (await z.files['README.txt'].async('string'));
    ok(rd.charCodeAt(0) === 0xfeff && /\[상품명 칸에 붙여 넣기\]\r\n고급스러운 메탈 방문 손잡이/.test(rd) && /\[태그 후보\]/.test(rd) && /방문손잡이, 레버손잡이/.test(rd) && /01_main\.jpg/.test(rd) && /가로 860px/.test(rd) && /등록 화면의 안내가 우선/.test(rd), 'README: 상품명·태그 후보·올리는 순서·"등록 화면 안내가 우선" 문구가 있다');
    ok(names.filter((n) => n !== 'README.txt').every((n) => rd.indexOf(n) >= 0), 'README: 파일 목록에 모든 파일 이름이 있다');
    ok(/^\ufeff네이버 쇼핑 올리기 안내[^\r\n]*\r\n\r\n※ 이 묶음은 네이버에 자동으로 올라가지 않아요\. 아래 순서대로 스마트스토어센터에서 직접 올려 주세요\./.test(rd), 'README: 맨 위 둘째 줄에 "자동으로 올라가지 않아요, 직접 올려 주세요"가 있다');
    ok(/\[직접 입력해야 하는 항목\]/.test(rd) && ['카테고리', '판매가·재고', '옵션', '상품주요정보', '상품정보제공고시', '배송·반품·교환', 'A/S', '태그·속성'].every((k) => rd.indexOf(k + ' — ') >= 0) && /6\. 아래 \[직접 입력해야 하는 항목\]을 채우고 등록합니다\./.test(rd), 'README: 직접 입력해야 하는 항목 8가지와 "6. 채우고 등록" 단계가 있다');
    ok(/기본 이름이라 제품마다 같아요/.test(rd) && /마지막 태그 "시험손잡이"는 사장님이 정한 제품 이름이에요/.test(rd), 'README: 상품명이 모든 제품에서 같은 기본 이름이라는 것과 마지막 태그가 내부 이름이라는 것을 알려 준다');
    const detSizes = names.filter((n) => /^03_detail/.test(n)).map((n) => fs.statSync(OUT + '/' + n).size);
    ok(detSizes.every((s) => s < 3 * 1048576), '용량: 상세 조각 한 장이 3MB보다 작다 → ' + detSizes.map((s) => (s / 1024).toFixed(0) + 'KB').join(', '));
    /* 대표 이미지만 저장 / 복사 */
    const dl2 = page.waitForEvent('download'); await page.click('#msMainSave'); const d2 = await dl2;
    ok(d2.suggestedFilename() === 'naver_main_1000x1000.jpg', '대표 이미지만 저장: 파일 이름이 naver_main_1000x1000.jpg 이다');
    await page.click('#msCopyName'); await page.waitForTimeout(200);
    ok(/복사했어요/.test(await page.textContent('#toast')), '복사: 상품명 복사 안내가 나온다');
    await page.click('#msCopyTags'); await page.waitForTimeout(200);
    /* 탭을 오가도 결과가 남는다 */
    await page.click('[data-mt="coupang"]'); await page.click('[data-mt="naver"]'); await page.waitForSelector('#msRes');
    ok(await page.locator('#msRes .mkt-main img').count() === 1, '탭 이동: 쿠팡 탭에 다녀와도 만든 결과가 그대로 남아 있다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 3. 사진이 많을 때: 추가 사진·첫 화면·소개·문 색상 10칸(그중 AI 표시 1장) → 9장까지만 */
  {
    let ctx, page;
    ({ ctx, page } = await open(browser));
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.locator('input[data-file="extra.0"]').setInputFiles(PHOTO); await page.waitForTimeout(1200);
    await page.locator('input[data-file="hero.photo"]').setInputFiles(PHOTO); await page.waitForTimeout(1200);
    await page.locator('input[data-file="concept.photo"]').setInputFiles(PHOTO); await page.waitForTimeout(1200);
    await page.evaluate(async (n) => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 800; const g = c.getContext('2d'); g.fillStyle = '#d8c9b0'; g.fillRect(0, 0, 800, 800); g.fillStyle = '#333'; g.fillRect(200, 380, 400, 40);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', .9));
      const db = await new Promise((ok2, no) => { const r = indexedDB.open('am-dp', 1); r.onsuccess = () => ok2(r.result); r.onerror = no; });
      for (let i = 0; i < n; i++) await new Promise((r) => { const q = db.transaction('p', 'readwrite').objectStore('p').put({ blob, w: 800, h: 800 }, 'tc' + i); q.onsuccess = q.onerror = () => r(); });
    }, 10);
    await page.waitForTimeout(900);
    const st2 = JSON.parse(await page.evaluate(() => localStorage.getItem('am-dp-v1')));
    for (let i = 0; i < 10; i++) st2.colors.items[i].photo = { id: 'tc' + i, w: 800, h: 800, ai: i === 1 };
    st2.hero.photo.ai = true;
    await page.context().addInitScript((s) => { localStorage.setItem('am-dp-v1', s); }, JSON.stringify(st2));
    await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(1500);
    await page.click('#btnMarket'); await page.waitForSelector('#msGo'); await page.click('#msGo'); await waitMsg(page, '다 만들었어요');
    const r = await page.evaluate(() => ({ labels: [...document.querySelectorAll('#msRes .mkt-grid')[0].querySelectorAll('span')].map((s) => s.textContent), checks: [...document.querySelectorAll('#msRes .checks li')].map((l) => l.textContent) }));
    console.log('   추가 이미지:', r.labels.join(' | '));
    ok(r.labels.length === 9, '추가 이미지: 사진이 15장 넘게 있어도 9장까지만 만든다 → ' + r.labels.length + '장');
    ok(/^01 추가 사진 1/.test(r.labels[0]) && /^02 확대 1/.test(r.labels[1]) && /^04 확대 3/.test(r.labels[3]) && /^05 첫 화면 \(AI\)/.test(r.labels[4]) && /^06 소개/.test(r.labels[5]) && /^07 문 색상/.test(r.labels[6]), '순서: 추가 사진 → 확대 3컷 → 첫 화면 → 소개 → 문 색상 순서이고 AI 사진에는 (AI)가 붙는다');
    ok(r.checks.some((c) => /^⚠ 추가 이미지는 9장까지만/.test(c) && /8장은 뺐어요|[0-9]+장은 뺐어요/.test(c)), '확인 목록: 9장을 넘어 뺀 장수를 알려 준다');
    ok(r.checks.some((c) => /^⚠ AI로 만든 사진이 추가 이미지에 \d+장/.test(c)), '확인 목록: AI로 만든 사진이 들어 있으면 AI 표시 규칙을 확인하라고 알려 준다');
    /* 방식: 항상 정사각으로 자르기 */
    await page.check('input[name=msstyle][value=crop]'); await page.click('#msGo'); await waitMsg(page, '다 만들었어요');
    const ck = await page.evaluate(() => [...document.querySelectorAll('#msRes .checks li')].map((l) => l.textContent));
    ok(ck.some((c) => /정사각으로 잘랐어요|사진 전체를 정사각 안에 넣었어요/.test(c)) && !ck.some((c) => /배경이 한 가지 색이라/.test(c)), '방식: "항상 정사각으로 자르기"를 고르면 흰 바탕에 놓지 않고 자른다 → ' + ck[0].slice(0, 90));
    await ctx.close();
  }

  /* 3b. 배경이 한 가지 색이 아닌 사진(문에 달린 손잡이): 흰 배경이라고 거짓말하지 않는다 */
  {
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(SCENE); await page.waitForTimeout(2500);
    await page.click('#btnMarket'); await page.waitForSelector('#msGo'); await page.click('#msGo'); await waitMsg(page, '다 만들었어요');
    const ck = await page.evaluate(() => [...document.querySelectorAll('#msRes .checks li')].map((l) => l.textContent));
    ok(ck.some((c) => /^⚠ 대표 이미지 배경이 흰색이 아니에요/.test(c)) && !ck.some((c) => /배경이 흰색이에요/.test(c)), '문에 달린 사진: 배경이 흰색이 아니라고 알려 준다 → ' + (ck.find((c) => /배경/.test(c)) || '').slice(0, 70));
    ok(!ck.some((c) => /제품을 가운데에 크게 놓았어요/.test(c)), '문에 달린 사진: 배경이 한 가지 색이 아니면 그 위에 놓지 않고 자르거나 전체를 넣는다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 4. 멈추기 */
  {
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.click('#btnMarket'); await page.waitForSelector('#msGo');
    await page.evaluate(() => { document.querySelector('#msGo').click(); document.querySelector('#msClose').click(); });   // 누르자마자 멈추기(빠른 컴퓨터에서는 1초 안에 끝나서 늦게 누르면 이미 끝나 있어요)
    await waitMsg(page, '멈췄어요', 60000);
    ok(await page.locator('#msRes').count() === 0 && !(await page.isDisabled('#msGo')), '멈추기: 멈추면 결과를 만들지 않고 만들기 단추가 다시 눌린다');
    await page.click('#msGo'); await waitMsg(page, '다 만들었어요');
    ok(await page.locator('#msRes').count() === 1, '멈춘 뒤: 다시 눌러 끝까지 만들 수 있다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건');
  process.exit(fails ? 1 : 0);
})();
