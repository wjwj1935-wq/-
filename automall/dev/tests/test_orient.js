/* 자동몰 상세페이지 제작기 v84(v80 시험) — 치수 그림: 레버가 캡 위에 겹침 · 방향(사진 따라 자동/직접) · 총 길이 기준 */
const http = require('http'), fs = require('fs'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const NEW = fs.readFileSync(B + '/w/am_work.html', 'utf8');
const WL = B + '/up/white_prod.png', WR = B + '/up/white_prod_R.png';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let PORT = 0;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(NEW); });
async function open(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) r.continue(); else r.abort(); });
  if (seed) await page.addInitScript((s) => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', s); } catch (e) {} }, JSON.stringify(seed));
  await page.goto('http://127.0.0.1:' + PORT + '/'); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const Z = (o) => ({ v: 3, size: Object.assign({ len: '', wid: '', cap: '', ref: 'card', extra: [], note: '※ 그림은 치수 위치를 보여 주는 도식이에요.' }, o, o && o.base ? { baseSet: 'user' } : {}) });   // 기준을 직접 골랐다는 표시(baseSet)가 있을 때만 저장된 기준을 따른다
/* 그림 안의 부품 위치를 잰다 */
const parts = (page) => page.evaluate(() => {
  const dia = document.querySelector('#paper .sddia'); if (!dia) return null; const d = dia.getBoundingClientRect();
  const all = [...dia.querySelectorAll('i')].map((e, idx) => { const q = e.getBoundingClientRect(), st = e.getAttribute('style'); return { idx, st, l: q.left - d.left, r: q.right - d.left, t: q.top - d.top, b: q.bottom - d.top, cx: (q.left + q.right) / 2 - d.left, cy: (q.top + q.bottom) / 2 - d.top, w: q.width, h: q.height }; });
  const cap = all.find((x) => /background:#(e4e8ef|f1f3f8);border:2px (solid|dashed) #8a93a4/.test(x.st)), lever = all.find((x) => /border-radius:[\d.]+px;background:#(cfd4dc|e9ecf1)/.test(x.st) && x.w > 30 && x.h < 140 && !/50%/.test(x.st)), hub = all.find((x) => /border-radius:50%;background:#(cfd4dc|e9ecf1)/.test(x.st));
  const pills = [...dia.querySelectorAll('.sdp')].map((e) => { const q = e.getBoundingClientRect(); return { txt: e.textContent, l: q.left - d.left, r: q.right - d.left, t: q.top - d.top, b: q.bottom - d.top, cx: (q.left + q.right) / 2 - d.left }; });
  const refs = [...dia.querySelectorAll('.sdr')].map((e) => { const q = e.getBoundingClientRect(); return { txt: e.textContent, l: q.left - d.left, r: q.right - d.left, t: q.top - d.top, b: q.bottom - d.top }; });
  return { W: d.width, H: d.height, cap, lever, hub, pills, refs };
});
const inside = (g) => g.pills.concat(g.refs).every((p) => p.l >= -1 && p.r <= g.W + 1 && p.t >= -1 && p.b <= g.H + 1);
const overlap = (g) => { const a = g.pills.map((p) => ({ n: p.txt, ...p })).concat(g.refs.map((p) => ({ n: '[비교]' + p.txt.slice(0, 4), ...p }))); for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i].l < a[j].r && a[j].l < a[i].r && a[i].t < a[j].b && a[j].t < a[i].b) return a[i].n + ' ↔ ' + a[j].n; return ''; };
const pill = (g, re) => g.pills.find((p) => re.test(p.txt));

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 모양: 캡이 뒤, 레버가 캡 위에 겹쳐 캡 중심(축)까지 온다 */
  for (const [nm, seed] of [['원형', Z({ len: '150', wid: '20', cap: '70' })], ['정사각형', Z({ shape: 'square', len: '150', wid: '20', capW: '60' })], ['직사각형', Z({ shape: 'rect', len: '150', wid: '20', capW: '70', capH: '54' })], ['라운드형', Z({ shape: 'rrect', len: '150', wid: '20', capW: '70', capH: '54' })], ['캡 치수 없음', Z({ len: '150', wid: '20' })]]) {
    const { ctx, page, errors } = await open(browser, seed); const g = await parts(page);
    ok(g.cap && g.lever && g.hub && g.cap.idx < g.lever.idx && g.lever.idx < g.hub.idx, `겹침(${nm}): 그리는 순서가 캡(뒤) → 레버 → 축 표시(앞)이다`);
    ok(Math.abs(g.hub.cx - g.cap.cx) < 2 && Math.abs(g.lever.r - g.cap.cx) < 4, `겹침(${nm}): 레버 끝과 축 표시가 캡 중심에 맞는다 (축 ${Math.round(g.hub.cx)} · 캡 중심 ${Math.round(g.cap.cx)} · 레버 끝 ${Math.round(g.lever.r)})`);
    ok(g.lever.l < g.cap.l && g.lever.r > g.cap.l + 5, `겹침(${nm}): 레버가 캡 가장자리 안쪽까지 들어와 겹쳐 보인다(레버 모양과 캡이 둘 다 보인다)`);
    ok(inside(g) && overlap(g) === '', `겹침(${nm}): 표시가 모두 그림 안쪽이고 겹치지 않는다 ${overlap(g)}`);
    ok(errors.length === 0, `겹침(${nm}): 오류 없음 ${JSON.stringify(errors)}`);
    await ctx.close();
  }

  /* 2. 직접 고른 방향: 레버가 오른쪽이면 그림이 좌우로 뒤집힌다 */
  {
    const run = async (o) => { const { ctx, page } = await open(browser, Z(Object.assign({ len: '150', wid: '20', cap: '70' }, o))); const g = await parts(page); await ctx.close(); return g; };
    const L = await run({ dir: 'L' }), R = await run({ dir: 'R' }), A = await run({});
    ok(L.cap.cx > L.lever.l + 60 && L.lever.l < L.W / 2, '방향(왼쪽): 레버 끝이 왼쪽, 캡이 오른쪽에 있다');
    ok(R.cap.cx < R.lever.r - 60 && R.lever.r > R.W / 2, '방향(오른쪽): 레버 끝이 오른쪽, 캡이 왼쪽에 있다');
    ok(Math.abs((L.cap.cx + R.cap.cx) - L.W) < 2 && Math.abs((L.lever.l + R.lever.r) - L.W) < 2, '방향: 오른쪽은 왼쪽 그림을 거울처럼 뒤집은 것과 같은 자리다(캡 중심·레버 끝이 좌우 대칭)');
    ok(pill(L, /총 폭/).cx < pill(L, /총 길이/).cx && pill(R, /총 폭/).cx > pill(R, /총 길이/).cx, '방향: 총 폭 표시도 레버 끝 쪽을 따라 왼쪽→오른쪽으로 옮겨 간다');
    ok(inside(R) && overlap(R) === '' && inside(L) && overlap(L) === '', '방향: 뒤집어도 표시가 모두 그림 안쪽이고 겹치지 않는다');
    ok(A.cap.cx === L.cap.cx && A.lever.l === L.lever.l, '방향: 아무것도 고르지 않고 사진도 없으면 왼쪽(예전과 같은 방향)이다');
    // 글자가 거울상으로 뒤집히지 않는다
    const { ctx, page } = await open(browser, Z({ len: '150', wid: '20', cap: '70', dir: 'R' }));
    ok((await page.evaluate(() => [...document.querySelectorAll('#paper .sdp')].every((e) => getComputedStyle(e).transform === 'matrix(1, 0, 0, 1, -0, -0)' || !/-1/.test(getComputedStyle(e).transform.replace(/-0\b/g, '0').split(',')[0])))), '방향: 뒤집어도 글자는 뒤집히지 않는다(위치만 거울처럼)');
    await ctx.close();
  }

  /* 3. 모든 모양·비교 물건·방향·기준 조합에서 표시가 안쪽이고 겹치지 않는다 */
  {
    let bad = []; let n = 0;
    for (const sh of ['round', 'square', 'rect', 'rrect']) for (const ref of ['card', 'coin', 'none']) for (const [dir, base] of [['R', 'full'], ['L', 'center'], ['R', 'lever'], ['L', 'lever']]) {
      const o = { shape: sh, len: '150', wid: '20', ref, dir, base };
      if (sh === 'round') o.cap = '70'; else if (sh === 'square') o.capW = '60'; else { o.capW = '70'; o.capH = '54'; }
      const { ctx, page } = await open(browser, Z(o)); const g = await parts(page); n++;
      if (!g || !inside(g) || overlap(g) !== '' || g.hub.idx < g.cap.idx) bad.push([sh, ref, dir, base, g ? overlap(g) : '그림 없음'].join('/'));
      await ctx.close();
    }
    ok(bad.length === 0, `조합 ${n}가지: 모든 모양·비교 물건·방향·기준에서 표시가 그림 안쪽이고 겹치지 않는다 ${bad.join(' ; ')}`);
  }

  /* 4. 총 길이 기준: 캡 중심~끝 = 캡 중심(축)에서 레버 끝까지(기본) / 캡 가장자리부터 / 캡까지 포함 */
  {
    const run = async (o) => { const { ctx, page } = await open(browser, Z(Object.assign({ len: '110', wid: '20', cap: '70', ref: 'none' }, o))); const g = await parts(page); const tb = await page.evaluate(() => [...document.querySelectorAll('#paper .sdr2 b')].map((e) => e.textContent)); const tick = await page.evaluate(() => { const d = document.querySelector('#paper .sddia'), o2 = d.getBoundingClientRect(); const t = [...d.querySelectorAll('i')].map((e) => { const q = e.getBoundingClientRect(); return { l: q.left - o2.left, w: q.width, h: q.height, tp: q.top - o2.top }; }).filter((x) => Math.abs(x.w - 2) < .3 && Math.abs(x.h - 18) < .5 && x.tp < 60); return t.length ? Math.max(...t.map((x) => x.l + 1)) : -1; }); await ctx.close(); return { g, tb, tick }; };
    const Dc = await run({}), Lv = await run({ base: 'lever' }), F = await run({ base: 'full' });
    const pd = pill(Dc.g, /^총 길이/), pl = pill(Lv.g, /^총 길이/), pf = pill(F.g, /^총 길이/), mid = (g) => (g.lever.l + g.lever.r) / 2;
    ok(pd.txt === '총 길이(캡 중심~끝) 110mm' && Dc.tb[0] === '총 길이(캡 중심~끝)', '기준(기본=캡 중심~끝): 아무것도 안 골라도 표시는 "총 길이(캡 중심~끝) 110mm", 표 줄 이름은 "총 길이(캡 중심~끝)"이다 → ' + pd.txt + ' / ' + Dc.tb[0]);
    ok(pl.txt === '총 길이(캡 가장자리~끝) 110mm' && Lv.tb[0] === '총 길이(캡 가장자리~끝)', '기준(캡 가장자리부터): 표시는 "총 길이(캡 가장자리~끝) 110mm", 표 줄 이름도 같다');
    ok(pf.txt === '총 길이(캡 포함) 110mm' && F.tb[0] === '총 길이(캡 포함)', '기준(캡까지 포함): 표시는 "총 길이(캡 포함) 110mm", 표 줄 이름은 "총 길이(캡 포함)"다');
    ok(Math.abs(pd.cx - mid(Dc.g)) < 3, '기준(캡 중심~끝): 치수선이 레버 끝에서 축(캡 중심)까지 가서, 가운데가 레버 가운데와 같다');
    ok(Math.abs(Dc.tick - Dc.g.hub.cx) < 3, `기준(캡 중심~끝): 치수선 오른쪽 끝(${Math.round(Dc.tick)})이 둥근 축 표시의 중심(${Math.round(Dc.g.hub.cx)})과 맞는다`);
    ok(pl.cx < mid(Lv.g) - 10 && Math.abs(Lv.tick - Lv.g.cap.l) < 3, `기준(캡 가장자리부터): 치수선이 캡 왼쪽 가장자리(${Math.round(Lv.g.cap.l)})에서 끝난다(끝 ${Math.round(Lv.tick)})`);
    ok(pf.cx > mid(F.g) + 8, '기준(캡까지 포함): 치수선이 캡 반대쪽 끝까지 가서, 가운데가 레버 가운데보다 오른쪽이다');
  }

  /* 5. 입력칸: 총 길이 기준과 그림 방향 단추 / 사진 따라 자동 */
  {
    const { ctx, page, errors } = await open(browser);
    const sg = (act) => page.evaluate((a) => [...document.querySelectorAll('.segpick .sg[data-act="' + a + '"]')].map((b) => b.dataset.v + (b.classList.contains('on') ? '*' : '') + ':' + b.querySelector('b').textContent).join(' | '), act);
    ok((await sg('lenbase')) === 'center*:캡 중심부터 | lever:캡 가장자리부터 | full:캡까지 포함', '입력칸: 총 길이 기준 단추 3개, 처음에는 "캡 중심부터"가 눌려 있다 → ' + await sg('lenbase'));
    ok((await sg('capdir')).startsWith('auto*:사진 따라 자동 | L:레버가 왼쪽 | R:레버가 오른쪽'), '입력칸: 그림 방향 단추 3개, 처음에는 "사진 따라 자동"이 눌려 있다 → ' + await sg('capdir'));
    ok(/총 길이 \(캡 중심\(축\)에서 레버 끝까지, mm\)/.test(await page.textContent('#s-size')), '입력칸: 총 길이 칸 이름에 "캡 중심(축)에서 레버 끝까지"가 적혀 있다');
    await page.click('.segpick .sg[data-v="lever"]'); await page.waitForTimeout(200);
    ok(/캡 가장자리에서 레버 끝까지, mm/.test(await page.textContent('#s-size')) && (await sg('lenbase')).startsWith('center:') && (await sg('lenbase')).indexOf('lever*') > 0, '입력칸: "캡 가장자리부터"를 누르면 칸 이름도 바뀌고 단추가 눌린다');
    await page.fill('[data-k="size.len"]', '110'); await page.waitForTimeout(500);
    ok(/총 길이\(캡 가장자리~끝\) 110mm/.test(await page.textContent('#paper .sizebox')), '미리보기: 상세페이지 그림에 "총 길이(캡 가장자리~끝) 110mm"로 나온다');
    await page.click('.segpick .sg[data-v="R"]'); await page.waitForTimeout(200);
    ok((await sg('capdir')).indexOf('R*') > 0, '입력칸: "레버가 오른쪽"을 누르면 눌린다');
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => { const x = JSON.parse(localStorage.getItem('am-dp-v1')).size; return x.base + '/' + x.dir; });
    ok(st === 'lever/R', '저장: 고른 기준과 방향이 저장된다 → ' + st);
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }
  {   // 사진에서 알아본 레버 방향을 따라 자동으로 맞춘다
    const flipOf = async (page) => { const g = await parts(page); return g.lever.l < g.cap.cx - 30 ? 'L(캡 오른쪽)' : 'R(캡 왼쪽)'; };   // 레버 끝이 캡 중심보다 왼쪽이면 레버가 왼쪽
    const { ctx, page, errors } = await open(browser, Z({ len: '150', wid: '20', cap: '70' }));
    await page.locator('input[data-file="src"]').first().setInputFiles(WL); await page.waitForTimeout(3000);
    const lv1 = await page.evaluate(() => (document.querySelector('select[data-lv]') || {}).value);
    ok(lv1 === 'L' && (await flipOf(page)) === 'L(캡 오른쪽)', `사진 따라 자동(레버가 왼쪽인 사진): 사진 인식은 ${lv1}, 그림은 캡이 오른쪽이다`);
    await page.locator('input[data-file="src"]').first().setInputFiles(WR); await page.waitForTimeout(3000);
    const lv2 = await page.evaluate(() => (document.querySelector('select[data-lv]') || {}).value);
    ok(lv2 === 'R' && (await flipOf(page)) === 'R(캡 왼쪽)', `사진 따라 자동(레버가 오른쪽인 사진): 사진 인식은 ${lv2}, 그림은 저절로 뒤집혀 캡이 왼쪽이다`);
    await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
    ok(/사진: 레버가 오른쪽/.test(await page.textContent('.segpick:has([data-act="capdir"])')), '사진 따라 자동: 단추 설명에 "사진: 레버가 오른쪽"이 나온다');
    await page.click('.segpick .sg[data-v="L"]'); await page.waitForTimeout(300);
    ok((await flipOf(page)) === 'L(캡 오른쪽)', '직접 고르기가 우선: 사진은 오른쪽이어도 "레버가 왼쪽"을 누르면 왼쪽으로 그린다');
    await page.click('.segpick .sg[data-v="auto"]'); await page.waitForTimeout(300);
    ok((await flipOf(page)) === 'R(캡 왼쪽)', '"사진 따라 자동"을 누르면 다시 사진 방향을 따른다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건'); process.exit(fails ? 1 : 0);
})();
