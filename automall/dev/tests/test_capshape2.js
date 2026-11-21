/* 자동몰 상세페이지 제작기 v72 — 이미 사진이 들어 있는 작업에서 캡 모양 알아보기 (클로드는 가짜) */
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = (process.env.AM_DEV || '/tmp/am_dev');
const FILE = BASE + '/w/am_work.html';
const HTML = fs.readFileSync(FILE, 'utf8');
let PORT = 0;
const server = http.createServer((req, res) => { if (req.url.split('?')[0] === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(HTML); } else { res.writeHead(404); res.end('no'); } });
const PHOTO = (process.env.AM_DEV || '/tmp/am_dev') + '/up/crop_orig.png';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

/* 클로드를 쓸 수 있는지는 localStorage '__mock' 값으로 다시 열 때마다 바꾼다: '1' 직사각형, 'round' 원형, 'unknown', 'err' 오류 */
const MOCK = () => {
  const m = localStorage.getItem('__mock'); window.__log = [];
  if (!m) return;
  const rep = { '1': 'rect', rect: 'rect', round: 'round', unknown: 'unknown', err: 'rect' }[m];
  window.claude = { use: async (n) => n === 'sample' ? { limits: async () => ({ images: { maxCount: 3 } }), json: async (p) => {
    window.__log.push({ shapeOnly: !/"spec"/.test(p), p });
    if (m === 'err') throw { code: 'rate_limited' };
    if (!/"spec"/.test(p)) return { rosetteShape: rep, rosette: '받침 한 문장' };
    return { kind: '레버형', lever: '레버', rosette: '받침', rosetteShape: rep, finish: '마감', features: [], spec: '그대로', never: [] };
  } } : null };
};
async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) r.continue(); else r.abort(); });
  await page.addInitScript(MOCK);
  return { ctx, page, errors };
}
const go = async (page) => { await page.goto('http://127.0.0.1:' + PORT + '/'); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(900); };
const sel = (page) => page.locator('.cappick .cp.on').getAttribute('data-v');
const mock = (page, v) => page.evaluate((x) => { if (x) localStorage.setItem('__mock', x); else localStorage.removeItem('__mock'); }, v);
const log = (page) => page.evaluate(() => window.__log);
const hint = (page) => page.evaluate(() => [...document.querySelectorAll('#s-size .hint')].map((h) => h.textContent).join(' | '));
const waitSel = (page, v, t) => page.waitForFunction((x) => { const e = document.querySelector('.cappick .cp.on'); return e && e.dataset.v === x; }, v, { timeout: t || 20000 });
const toastText = (page) => page.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 클로드 없이 사진을 먼저 넣어 둔 작업(예전 작업)을 흉내 낸다 */
  const { ctx, page, errors } = await newPage(browser);
  await go(page);
  await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
  await page.fill('[data-k="size.cap"]', '70'); await page.fill('[data-k="size.len"]', '150'); await page.fill('[data-k="size.wid"]', '20');
  await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO);
  await page.waitForTimeout(2500);
  ok(await sel(page) === 'round' && await page.locator('[data-act="capshape"]').count() === 1, '사진만 있는 작업: 캡 모양은 원형이고 크기 안내에 "사진으로 캡 모양 알아보기" 버튼이 있다');
  ok(await page.locator('#paper .sddia').count() === 1 && /캡 지름 Ø70mm/.test(await page.textContent('#paper .sizebox')), '사진만 있는 작업: 지금 화면과 같은 원형 그림(캡 지름 Ø70mm)이다');

  /* 2. 클로드가 연결된 상태로 다시 열면: 열 때 한 번 알아보고 직사각형으로 맞춘다 */
  await mock(page, '1');
  await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' });
  await waitSel(page, 'rect');
  await page.waitForTimeout(500);
  let L = await log(page);
  ok(L.length === 1 && L[0].shapeOnly, '열 때: 이미 들어 있는 사진에서 캡 모양만 묻는 작은 질문 1번을 한다 → ' + L.length + '번');
  ok(!/"spec"/.test(L[0].p) && /round/.test(L[0].p) && /rect/.test(L[0].p), '열 때: 제품 특징 메모를 쓰는 큰 질문이 아니다(메모를 덮어쓰지 않는다)');
  ok(/직사각형으로 자동으로 맞췄어요/.test(await hint(page)), '열 때: "사진을 보고 직사각형으로 자동으로 맞췄어요" 안내가 나온다');
  ok(/원형 지름으로 적어 둔 70은 직사각형의 가로·세로로 옮기지 않았어요/.test(await hint(page)), '열 때: 원형 지름으로 적어 둔 70을 가로·세로로 옮기지 않았다고 알려 준다');
  ok(await page.inputValue('[data-k="size.capW"]') === '' && await page.inputValue('[data-k="size.capH"]') === '', '열 때: 가로·세로 칸은 비어 있다(숫자를 지어내지 않는다)');
  ok(await page.locator('#paper .sddia').count() === 1 && !/캡 지름|Ø/.test(await page.textContent('#paper .sizebox')) && await page.locator('#paper .sddia i[style*="border-radius:50%;background:#f1f3f8"], #paper .sddia i[style*="border-radius:50%;background:#e4e8ef"]').count() === 0, '열 때: 가로·세로를 적기 전에는 둥근 캡 그림을 그리지 않고, 캡은 점선 네모로만 그린다(캡 지름 표시도 없다)');
  ok(/직사각형 · 크기 안내의 캡 모양에 맞췄어요|아직 알아보지 못했어요|클로드 키가 있으면/.test(await page.textContent('.recog')), '열 때: 사진 인식 결과 칸은 오류 없이 그려진다');
  await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
  await page.fill('[data-k="size.capW"]', '70'); await page.fill('[data-k="size.capH"]', '54'); await page.waitForTimeout(400);
  ok(await page.locator('#paper .sddia').count() === 1 && /캡 세로 54mm/.test(await page.textContent('#paper .sizebox')), '가로·세로를 적으면: 직사각형 캡 그림이 나온다');
  const sv = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('am-dp-v1')); return { shape: s.size.shape, set: s.size.shapeSet, cs: s.capShape && s.capShape.shape }; });
  ok(sv.shape === 'rect' && sv.set === 'auto' && sv.cs === 'rect', '저장: 모양과 "사진에서 알아봤다"는 표시가 작업에 저장된다 → ' + JSON.stringify(sv));

  /* 3. 한 번 알아본 작업은 다시 열어도 또 묻지 않는다(돈이 안 든다) */
  await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(3000);
  ok((await log(page)).length === 0 && await sel(page) === 'rect', '다시 열 때: 이미 알아본 사진이라 클로드를 다시 부르지 않는다');

  /* 4. 직접 원형으로 고른 뒤 버튼을 누르면: 직접 시킨 것이니 사진대로 바꾼다 */
  await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
  await page.click('.cappick [data-v="round"]');
  await page.waitForTimeout(300);
  ok(await sel(page) === 'round' && /사진 인식 결과는 직사각형이에요/.test(await hint(page)), '직접 고름: 원형으로 고르면 그대로 두고 사진 인식 결과가 다르다고 알려 준다');
  await page.click('[data-act="capshape"]');
  await waitSel(page, 'rect');
  await page.waitForTimeout(300);
  L = await log(page);
  ok(L.length === 1 && /직사각형이에요/.test(await toastText(page)) && /직사각형으로 자동으로 맞췄어요/.test(await hint(page)), '버튼: 눌렀을 때는 직접 고른 값이어도 사진대로 직사각형으로 바꾸고 알려 준다 → ' + (await toastText(page)).slice(0, 60));
  ok(!(await page.isDisabled('[data-act="capshape"]')), '버튼: 끝난 뒤 버튼이 다시 눌린다');

  /* 5. 모를 때 / 오류일 때 */
  await page.waitForTimeout(900);                       // 앱이 작업을 저장할 시간(0.4초)을 준다
  await mock(page, 'unknown');
  await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
  await page.click('[data-act="capshape"]'); await page.waitForTimeout(1200);
  ok(/알 수 없어요/.test(await toastText(page)) && await sel(page) === 'rect', '모를 때: 모양을 바꾸지 않고 직접 골라 달라고 알려 준다 → ' + await toastText(page));
  await page.waitForTimeout(900);
  await mock(page, 'err');
  await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
  await page.click('[data-act="capshape"]'); await page.waitForTimeout(1200);
  ok(/사용 한도에 걸렸어요/.test(await toastText(page)) && !(await page.isDisabled('[data-act="capshape"]')) && await sel(page) === 'rect', '오류일 때: 쉬운 말로 알려 주고 버튼이 다시 눌린다 → ' + await toastText(page));
  ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
  await ctx.close();

  /* 6. 사진이 없으면: 버튼도 없고 클로드도 안 부른다 */
  {
    const { ctx: c2, page: p2 } = await newPage(browser);
    await go(p2); await mock(p2, '1');
    await p2.reload(); await p2.waitForSelector('#paper .sec', { state: 'attached' }); await p2.waitForTimeout(2500);
    ok(await p2.locator('[data-act="capshape"]').count() === 0 && (await log(p2)).length === 0 && await sel(p2) === 'round', '사진 없음: 버튼이 없고 클로드를 부르지 않는다');
    await c2.close();
  }

  /* 7. 직접 고른 모양(user)이 저장된 작업은 열 때 알아봐도 바꾸지 않는다 */
  {
    const { ctx: c3, page: p3 } = await newPage(browser);
    await go(p3);
    await p3.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
    await p3.click('.cappick [data-v="round"]');                         // 직접 고름
    await p3.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await p3.waitForTimeout(2500);
    await mock(p3, '1');
    await p3.reload(); await p3.waitForSelector('#paper .sec', { state: 'attached' }); await p3.waitForTimeout(3000);
    ok(await sel(p3) === 'round' && (await log(p3)).length === 0, '직접 고른 작업: 열 때 클로드를 부르지 않고 직접 고른 원형을 그대로 둔다');
    await c3.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건');
  process.exit(fails ? 1 : 0);
})();
