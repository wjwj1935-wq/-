/* 자동몰 상세페이지 제작기 v71 — 캡 모양 자동 인식 시험 (클로드는 가짜로 대신한다) */
const { chromium } = require('playwright');
const BASE = (process.env.AM_DEV || '/tmp/am_dev');
const FILE = BASE + '/w/am_work.html';
const PHOTO = (process.env.AM_DEV || '/tmp/am_dev') + '/up/crop_orig.png';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const PLAN = { hero: { badge: '검정 레버 방문 손잡이', title: '문에 어울리는 손잡이', sub: '문에 달았을 때의 모습을 보세요.' }, concept: { title: '콘셉트', body: '설명' },
  zoom: [{ title: 'a', body: 'b' }, { title: 'c', body: 'd' }, { title: 'e', body: 'f' }], faq: [{ q: '질문', a: '답' }] };
const RECOG = (o) => Object.assign({ kind: '레버형 방문 손잡이', lever: '길고 각진 레버', rosette: '받침 한 문장', rosetteShape: 'rect', finish: '무광 은회색', features: ['각진 레버'], spec: '사진 그대로 그려요.', never: [] }, o || {});

async function open(browser, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/*', (r) => { const u = r.request().url(); if (/^(file|data|blob|about):/.test(u)) r.continue(); else r.abort(); });
  if (o.claude !== false) await page.addInitScript((a) => {
    window.__recog = a.recog; window.__plan = a.plan; window.__log = [];
    window.claude = { use: async (n) => n === 'sample' ? { limits: async () => ({ images: { maxCount: 3 } }), json: async (p) => { const rc = /rosetteShape/.test(p); window.__log.push({ k: rc ? 'recog' : 'plan', p: rc ? p : '' }); return rc ? window.__recog : window.__plan; } } : null };
  }, { recog: o.recog || RECOG(), plan: PLAN });
  if (o.seed) await page.addInitScript((s) => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', s); } catch (e) {} }, JSON.stringify(o.seed));
  await page.goto('file://' + FILE);
  await page.waitForSelector('#paper .sec', { state: 'attached' });
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}
async function upload(page) {
  await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO);
  await page.waitForFunction(() => [...document.querySelectorAll('.recog .rrow b')].some((b) => b.textContent === '캡 모양'), null, { timeout: 30000 });
  await page.waitForTimeout(1000);   // 저장은 마지막 변경 0.4초 뒤에 돼요(여유를 둬요)
}
const sel = (page) => page.locator('.cappick .cp.on').getAttribute('data-v');
const row = (page) => page.evaluate(() => { const b = [...document.querySelectorAll('.recog .rrow b')].find((x) => x.textContent === '캡 모양'); return b ? b.nextElementSibling.textContent : ''; });
const hint = (page) => page.evaluate(() => [...document.querySelectorAll('#s-size .hint')].map((h) => h.textContent).join(' | '));
const saved = (page) => page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('am-dp-v1')); return { shape: s.size.shape, set: s.size.shapeSet }; } catch (e) { return null; } });

(async () => {
  const browser = await chromium.launch();

  /* 1. 클로드가 직사각형이라고 하면: 크기 안내가 직사각형으로 맞춰진다 */
  {
    const { ctx, page, errors } = await open(browser);
    ok(await sel(page) === 'round', '처음: 캡 모양은 원형이다');
    await upload(page);
    ok(await sel(page) === 'rect', '직사각형: 크기 안내의 캡 모양이 자동으로 직사각형이 된다');
    ok(/직사각형으로 자동으로 맞췄어요/.test(await hint(page)), '직사각형: "사진을 보고 직사각형으로 자동으로 맞췄어요" 안내가 나온다 → ' + await hint(page));
    ok(await page.locator('[data-k="size.capW"]').count() === 1 && await page.locator('[data-k="size.capH"]').count() === 1 && await page.locator('[data-k="size.cap"]').count() === 0, '직사각형: 입력 칸이 캡 가로·캡 세로로 바뀐다');
    ok(/^직사각형 · 크기 안내의 캡 모양에 맞췄어요/.test(await row(page)), '직사각형: "사진 인식 결과"에 캡 모양 줄이 나온다 → ' + await row(page));
    ok(/캡 가로 · 캡 세로/.test(await page.textContent('#paper .sizeph')), '직사각형: 상세페이지 크기 안내 자리에도 "캡 가로 · 캡 세로"를 적으라고 나온다');
    const sv = await saved(page);
    ok(sv && sv.shape === 'rect' && sv.set === 'auto', '직사각형: 저장된 작업에도 반영된다 → ' + JSON.stringify(sv));
    const log = await page.evaluate(() => window.__log);
    const rp = (log.find((l) => l.k === 'recog') || {}).p || '';
    ok(/"rosetteShape"/.test(rp) && /round/.test(rp) && /rect/.test(rp) && /꼭 구분/.test(rp), '질문: 클로드에게 받침이 원형인지 직사각형인지 묻는다');
    ok(errors.length === 0, '직사각형: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 2. 원형이라고 하면 그대로 원형 */
  {
    const { ctx, page } = await open(browser, { recog: RECOG({ rosetteShape: 'round', rosette: '둥근 원판 받침' }) });
    await upload(page);
    ok(await sel(page) === 'round' && /^원형 · 크기 안내의 캡 모양에 맞췄어요/.test(await row(page)), '원형: 원형으로 두고 인식 결과에 원형이라고 나온다 → ' + await row(page));
    await ctx.close();
  }

  /* 3. 대표님이 직접 고른 모양은 건드리지 않는다 */
  {
    const { ctx, page } = await open(browser);
    await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
    await page.click('.cappick [data-v="rect"]');
    await page.click('.cappick [data-v="round"]');          // 직접 원형으로 골랐다
    await upload(page);
    ok(await sel(page) === 'round', '직접 고름: 클로드가 직사각형이라고 해도 직접 고른 원형을 그대로 둔다');
    ok(/사진 인식 결과는 직사각형이에요\. 직접 고른 값을 그대로 두었어요/.test(await hint(page)) && /직접 고른 값 그대로예요/.test(await row(page)), '직접 고름: 사진 인식 결과가 다르다고만 알려 준다 → ' + await hint(page));
    const sv = await saved(page);
    ok(sv && sv.set === 'user', '직접 고름: 직접 골랐다는 표시가 저장된다 → ' + JSON.stringify(sv));
    await ctx.close();
  }

  /* 4. 모르겠다·그 밖의 모양이면 건드리지 않고 직접 고르라고 안내 */
  for (const [name, shape, want] of [['알 수 없음', 'unknown', /사진으로는 알 수 없어요/], ['그 밖의 모양', 'other', /원형·사각형이 아닌 모양/]]) {
    const { ctx, page } = await open(browser, { recog: RECOG({ rosetteShape: shape, rosette: '독특한 받침' }) });
    await upload(page);
    ok(await sel(page) === 'round' && want.test(await row(page)) && !/자동으로 맞췄어요/.test(await hint(page)), name + ': 모양을 바꾸지 않고 직접 고르라고 알려 준다 → ' + await row(page));
    await ctx.close();
  }

  /* 5. 한 단어 답이 없어도 설명 글에 "직사각형·네모"가 분명하면 인식 / 여러 표기 */
  for (const [name, rec, want] of [
    ['설명 글만(네모난 받침)', RECOG({ rosetteShape: undefined, rosette: '네모난 받침' }), 'rect'],
    ['설명 글만(모서리가 둥근 네모난 받침)', RECOG({ rosetteShape: undefined, rosette: '모서리가 둥근 네모난 받침' }), 'rrect'],
    ['정사각형(square)', RECOG({ rosetteShape: 'square' }), 'square'],
    ['정사각형(한글)', RECOG({ rosetteShape: '정사각형' }), 'square'],
    ['모서리가 둥근 사각형(rrect)', RECOG({ rosetteShape: 'rrect' }), 'rrect'],
    ['모서리가 둥근 사각형(rounded)', RECOG({ rosetteShape: 'rounded' }), 'rrect'],
    ['한글 답(직사각형)', RECOG({ rosetteShape: '직사각형' }), 'rect'],
    ['대문자 답(RECT)', RECOG({ rosetteShape: 'RECT' }), 'rect'],
  ]) {
    const { ctx, page } = await open(browser, { recog: rec });
    await upload(page);
    ok(await sel(page) === want, name + ': ' + want + '(으)로 읽는다');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, { recog: RECOG({ rosetteShape: undefined, rosette: '둥근 원판 받침' }) });
    await upload(page);
    ok(await sel(page) === 'round' && /^원형/.test(await row(page)), '설명 글만(둥근 원판): 원형으로 읽는다');
    await ctx.close();
  }

  /* 6. 예전에 직접 직사각형으로 바꿔 둔 작업(표시가 없던 때)은 원형이라는 답에도 그대로 */
  {
    const { ctx, page } = await open(browser, { recog: RECOG({ rosetteShape: 'round' }), seed: { v: 3, size: { len: '150', wid: '20', cap: '', shape: 'rect', capW: '70', capH: '54', ref: 'card', extra: [], note: '' } } });
    await upload(page);
    ok(await sel(page) === 'rect', '예전 작업: 직접 직사각형으로 바꿔 둔 작업은 원형이라는 답에도 그대로 둔다');
    ok(await page.inputValue('[data-k="size.capW"]') === '70', '예전 작업: 적어 둔 캡 가로 70도 그대로다');
    await ctx.close();
  }

  /* 7. 다시 인식하기: 자동으로 맞춘 값은 새 인식 결과를 따라간다 */
  {
    const { ctx, page } = await open(browser);
    await upload(page);
    ok(await sel(page) === 'rect', '다시 인식: 처음 인식은 직사각형');
    await page.evaluate(() => { window.__recog = Object.assign({}, window.__recog, { rosetteShape: 'round', rosette: '둥근 원판 받침' }); });
    await page.click('.recog [data-act="recog"]');
    await page.waitForFunction(() => /^원형/.test(([...document.querySelectorAll('.recog .rrow b')].find((x) => x.textContent === '캡 모양') || { nextElementSibling: { textContent: '' } }).nextElementSibling.textContent), null, { timeout: 20000 });
    await page.waitForTimeout(300);
    ok(await sel(page) === 'round', '다시 인식: 새 인식 결과(원형)를 따라 원형으로 바뀐다');
    await ctx.close();
  }

  /* 8. 클로드를 못 쓰는 경우: 아무것도 바꾸지 않는다 */
  {
    const { ctx, page } = await open(browser, { claude: false });
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO);
    await page.waitForTimeout(2500);
    ok(await sel(page) === 'round' && /클로드 키가 있으면/.test(await page.textContent('.recog')), '클로드 없음: 모양을 바꾸지 않고 클로드 키가 있으면 자동 인식한다고 안내한다');
    await ctx.close();
  }

  await browser.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건');
  process.exit(fails ? 1 : 0);
})();
