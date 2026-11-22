/* 자동몰 상세페이지 제작기 v66 — 직사각형 캡 시험 (PASS/FAIL 줄로 보고) */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = (process.env.AM_DEV || '/tmp/am_dev');
const DIR = BASE + '/w';
const SHOT = BASE + '/w/shots';
fs.mkdirSync(SHOT, { recursive: true });
const BEFORE = DIR + '/test_v65.html', AFTER = DIR + '/am_work.html';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

async function open(browser, file, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url(); if (/^(file|data|blob|about):/.test(u)) r.continue(); else r.abort(); });
  if (seed) await page.addInitScript((s) => { try { localStorage.setItem('am-dp-v1', s); localStorage.setItem('wj-dp-v3', s); } catch (e) {} }, JSON.stringify(seed));
  await page.goto('file://' + file);
  await page.waitForSelector('#paper .sec');
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const sizeHtml = (page) => page.evaluate(() => { const e = document.querySelector('#paper .sizebox, #paper .sizeph'); return e ? e.outerHTML : ''; });
const Z = (o) => ({ v: 3, size: Object.assign({ len: '', wid: '', cap: '', ref: 'card', extra: [], note: '※ 그림은 치수 위치를 보여 주는 도식이에요.' }, o) });

(async () => {
  const browser = await chromium.launch();

  /* 1. 원형 캡은 예전과 그림이 똑같아야 한다 (저장본에 shape가 없어도 원형) */
  const round = {
    card: Z({ len: '150', wid: '20', cap: '70' }), coin: Z({ len: '150', wid: '20', cap: '70', ref: 'coin' }), none: Z({ len: '130', wid: '24', cap: '52', ref: 'none' }),
    part: Z({ len: '150', cap: '70' }), empty: Z({}), badcap: Z({ len: '100', wid: '20', cap: '200' }), extra: Z({ len: '150', wid: '20', cap: '70', extra: [{ l: '문에서 튀어나온 길이', v: '48' }] })
  };
  for (const [k, seed] of Object.entries(round)) {
    const a = await open(browser, BEFORE, seed), b = await open(browser, AFTER, seed);
    const ha = await sizeHtml(a.page), hb = await sizeHtml(b.page);
    const norm = (h) => h.replace(/<div class="sdwrap">.*?<\/div><\/div>/s, '<DIA>').replace(/<p class="sdnote">.*?<\/p>/s, '').replace(/총 길이\(캡 중심~끝\)/g, '총 길이');   // 그림(v80에서 다시 그림)은 빼고 표·제목·작은 글만 비교
    const pillsOf = (pg) => pg.evaluate(() => [...document.querySelectorAll('#paper .sizebox .sdp, #paper .sizebox .sdr')].map((e) => e.textContent.replace('(캡 중심~끝)', '')).sort().join('|'));   // 동전 설명 글의 세로 자리(v76에서 동전 아래로 옮김)만 빼고 비교
    if (k === 'part') ok(/class="sddia"/.test(hb) && /class="sdnote"/.test(hb) && /캡 지름 Ø70mm/.test(hb) && !/class="sddia"/.test(ha), `원형(${k}): 총 길이·캡 지름만 적어도 v78부터는 그림이 나온다(예전에는 표만)`);
    else ok(norm(ha) === norm(hb) && ha.length > 0 && (await pillsOf(a.page)) === (await pillsOf(b.page)), `원형(${k}): 고치기 전과 표·제목·치수 표시 글이 똑같다(그림 모양만 새로 그려요)`);
    if (k === 'coin') {
      const g = await b.page.evaluate(() => { const box = document.querySelector('#paper .sizebox'), lab = box.querySelector('.sdr').getBoundingClientRect(), cs = [...box.querySelectorAll('.sddia > i')].filter((e) => /border-radius:\s*50%/.test(e.getAttribute('style'))), coin = cs[cs.length - 1].getBoundingClientRect(), d = box.querySelector('.sddia').getBoundingClientRect(); return { labTop: lab.top, coinTop: coin.top, coinBottom: coin.bottom, labBottom: lab.bottom, diaBottom: d.bottom, labL: lab.left, labR: lab.right, diaL: d.left, diaR: d.right }; });
      ok((g.labBottom <= g.coinTop + 2 || g.labTop >= g.coinBottom - 2) && g.labTop >= -1 + 0 * g.diaL && g.labBottom <= g.diaBottom + 1 && g.labL >= g.diaL - 1 && g.labR <= g.diaR + 1, `원형(coin): 동전 설명 글이 동전 위(또는 아래)에 있고 그림 안쪽이다 ${JSON.stringify(g)}`);
    }
    ok(a.errors.length === 0 && b.errors.length === 0, `원형(${k}): 오류 없음 ${JSON.stringify(a.errors.concat(b.errors))}`);
    if (k === 'card') await b.page.locator('#paper .sizebox').screenshot({ path: SHOT + '/round_card.png' });
    await a.ctx.close(); await b.ctx.close();
  }

  /* 2. 직사각형 캡 그림: 글자·표·겹침 */
  const rects = {
    card: Z({ shape: 'rect', len: '150', wid: '20', capW: '70', capH: '54' }),
    coin: Z({ shape: 'rect', len: '150', wid: '20', capW: '70', capH: '54', ref: 'coin' }),
    none: Z({ shape: 'rect', len: '130', wid: '24', capW: '60', capH: '40', ref: 'none' }),
    tall: Z({ shape: 'rect', len: '140', wid: '22', capW: '45', capH: '110' }),
    wide: Z({ shape: 'rect', len: '120', wid: '20', capW: '118', capH: '48' }),
    mm: Z({ shape: 'rect', len: '150mm', wid: '20', capW: '70mm', capH: '54' })
  };
  for (const [k, seed] of Object.entries(rects)) {
    const { ctx, page, errors } = await open(browser, AFTER, seed);
    const info = await page.evaluate(() => {
      const box = document.querySelector('#paper .sizebox'); if (!box) return null;
      const dia = box.querySelector('.sddia'), r = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
      return {
        pills: [...box.querySelectorAll('.sdp')].map((e) => ({ txt: e.textContent, ...r(e) })),
        refs: [...box.querySelectorAll('.sdr')].map((e) => ({ txt: e.textContent, ...r(e) })),
        rows: [...box.querySelectorAll('.sdr2')].map((e) => e.textContent),
        dia: dia ? r(dia) : null,
        text: box.textContent
      };
    });
    ok(!!info && !!info.dia, `직사각형(${k}): 치수 그림이 나온다`);
    if (!info || !info.dia) { await ctx.close(); continue; }
    const names = info.pills.map((p) => p.txt);
    ok(names.some((n) => /^총 길이/.test(n)) && names.some((n) => /^총 폭 /.test(n)) && names.some((n) => /^캡 가로 /.test(n)) && names.some((n) => /^캡 세로 /.test(n)), `직사각형(${k}): 총 길이·총 폭·캡 가로·캡 세로 표시가 모두 있다 → ${JSON.stringify(names)}`);
    ok(!/캡 지름|Ø/.test(info.text), `직사각형(${k}): "캡 지름"·Ø가 나오지 않는다`);
    ok(info.rows.length === 4 && info.rows.some((t) => t.startsWith('캡 가로')) && info.rows.some((t) => t.startsWith('캡 세로')), `직사각형(${k}): 아래 표에 4줄(총 길이·총 폭·캡 가로·캡 세로) → ${JSON.stringify(info.rows)}`);
    const inside = info.pills.concat(info.refs).every((p) => p.l >= info.dia.l - 1 && p.r <= info.dia.r + 1 && p.t >= info.dia.t - 1 && p.b <= info.dia.b + 1);
    ok(inside, `직사각형(${k}): 모든 표시가 그림 안쪽에 있다`);
    let overlap = '';
    const all = info.pills.map((p) => ({ n: p.txt, ...p })).concat(info.refs.map((p) => ({ n: '[비교]' + p.txt.slice(0, 4), ...p })));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const A = all[i], B = all[j];
      if (A.l < B.r && B.l < A.r && A.t < B.b && B.t < A.b) overlap += `[${A.n} ↔ ${B.n}] `;
    }
    ok(overlap === '', `직사각형(${k}): 글자끼리 겹치지 않는다 ${overlap}`);
    ok(errors.length === 0, `직사각형(${k}): 오류 없음 ${JSON.stringify(errors)}`);
    await page.locator('#paper .sizebox').screenshot({ path: SHOT + `/rect_${k}.png` });
    await ctx.close();
  }
  { // mm 글자를 붙여 적어도 숫자로 읽는다
    const { ctx, page } = await open(browser, AFTER, rects.mm);
    ok(await page.locator('#paper .sddia').count() === 1, '직사각형(mm 붙임): "150mm" "70mm"도 숫자로 읽어 그림이 나온다');
    await ctx.close();
  }

  /* 3. 일부만 적으면: 표는 적은 줄만, 그림은 총 길이가 있으면 점선으로 (v78) */
  for (const [k, seed, want] of [
    ['가로만', Z({ shape: 'rect', len: '150', wid: '20', capW: '70' }), ['총 길이(캡 중심~끝)', '총 폭', '캡 가로']],
    ['세로만', Z({ shape: 'rect', len: '150', wid: '20', capH: '54' }), ['총 길이(캡 중심~끝)', '총 폭', '캡 세로']],
    ['캡 치수 없음', Z({ shape: 'rect', len: '150', wid: '20' }), ['총 길이(캡 중심~끝)', '총 폭']],
    ['원형 지름만 적고 직사각형 선택', Z({ shape: 'rect', len: '150', wid: '20', cap: '70' }), ['총 길이(캡 중심~끝)', '총 폭']]
  ]) {
    const { ctx, page } = await open(browser, AFTER, seed);
    const r = await page.evaluate(() => ({ dia: !!document.querySelector('#paper .sddia'), rows: [...document.querySelectorAll('#paper .sdr2 b')].map((e) => e.textContent), capPill: [...document.querySelectorAll('#paper .sdp')].some((e) => /^캡/.test(e.textContent)), dashed: [...document.querySelectorAll('#paper .sddia i')].some((i) => /2px dashed/.test(i.getAttribute('style'))) }));
    ok(r.dia && !r.capPill && r.dashed && JSON.stringify(r.rows) === JSON.stringify(want), `직사각형(${k}): 표는 적은 줄만, 그림은 캡을 점선으로(캡 치수 표시 없이) → ${JSON.stringify(r.rows)} (원하는 값 ${JSON.stringify(want)})`);
    await ctx.close();
  }
  { // 모두 비우면 안내 문구가 캡 모양에 맞게 나온다
    const { ctx, page } = await open(browser, AFTER, Z({ shape: 'rect' }));
    const t = await page.evaluate(() => (document.querySelector('#paper .sizeph') || {}).textContent || '');
    ok(/캡 가로 · 캡 세로/.test(t), '직사각형(비움): 빈 칸 안내에 "캡 가로 · 캡 세로"가 나온다 → ' + t);
    await ctx.close();
  }

  /* 4. 화면에서 직접: 캡 모양 바꾸기 → 칸이 바뀌고 값이 남는다 → 새로 열어도 유지 */
  {
    const { ctx, page, errors } = await open(browser, AFTER, null);
    await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
    const sel = { count: () => page.locator('.cappick').count(), inputValue: () => page.locator('.cappick .cp.on').getAttribute('data-v'), selectOption: (v) => page.click('.cappick [data-v="' + v + '"]') };
    ok(await sel.count() === 1, '화면: "캡 모양" 선택 칸이 있다');
    ok(await sel.inputValue() === 'round', '화면: 기본은 원형');
    ok(await page.locator('[data-k="size.cap"]').count() === 1 && await page.locator('[data-k="size.capW"]').count() === 0, '화면: 원형이면 "캡 지름" 칸만 있다');
    await page.fill('[data-k="size.cap"]', '52');
    await page.fill('[data-k="size.len"]', '150');
    await page.fill('[data-k="size.wid"]', '20');
    await page.waitForTimeout(400);
    ok(await page.locator('#paper .sddia').count() === 1 && /캡 지름 Ø52mm/.test(await page.locator('#paper .sizebox').textContent()), '화면: 원형 치수를 적으면 "캡 지름 Ø52mm" 그림이 나온다');
    await sel.selectOption('rect');
    await page.waitForTimeout(250);
    ok(await page.locator('[data-k="size.capW"]').count() === 1 && await page.locator('[data-k="size.capH"]').count() === 1 && await page.locator('[data-k="size.cap"]').count() === 0, '화면: 직사각형으로 바꾸면 "캡 가로·캡 세로" 칸으로 바뀐다');
    ok(await page.locator('#s-size').evaluate((d) => d.open), '화면: 모양을 바꿔도 크기 안내 칸이 열려 있다');
    ok(await page.locator('.cappick .cp.on').getAttribute('data-v') === 'rect', '화면: 선택값이 직사각형으로 유지된다');
    ok(await page.locator('#paper .sddia').count() === 1 && !/캡 지름|Ø/.test(await page.locator('#paper .sizebox').textContent()) && await page.locator('#paper .sdnote').count() === 1, '화면: 직사각형으로 바꾸면 가로·세로가 비어 있으니 캡은 점선으로만 그리고 "캡 지름" 표시는 빠진다');
    await page.fill('[data-k="size.capW"]', '70');
    await page.fill('[data-k="size.capH"]', '54');
    await page.waitForTimeout(400);
    const t1 = await page.locator('#paper .sizebox').textContent();
    ok(await page.locator('#paper .sddia').count() === 1 && /캡 가로 70mm/.test(t1) && /캡 세로 54mm/.test(t1), '화면: 가로 70, 세로 54를 적으면 그림이 나온다');
    // 표의 "캡 세로" 항목을 누르면 입력 칸으로 이동하는지는 길이 칸 기준(기존 동작) — 오류 없이 동작
    await page.locator('#paper .sdtb').click();
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.k) === 'size.len', '화면: 표를 누르면 입력 칸(총 길이)으로 이동한다 (기존 동작 유지)');
    // 원형으로 되돌리면 지름 칸에 아까 적은 52가 남아 있다
    await page.click('.cappick [data-v="round"]');
    await page.waitForTimeout(250);
    ok(await page.inputValue('[data-k="size.cap"]') === '52', '화면: 원형으로 되돌리면 아까 적은 지름 52가 남아 있다');
    await page.click('.cappick [data-v="rect"]');
    await page.waitForTimeout(250);
    ok(await page.inputValue('[data-k="size.capW"]') === '70' && await page.inputValue('[data-k="size.capH"]') === '54', '화면: 다시 직사각형으로 바꾸면 가로 70·세로 54가 남아 있다');
    await page.waitForTimeout(700);                                   // 자동 저장(0.4초)
    await page.reload();
    await page.waitForSelector('#paper .sec');
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
    ok(await page.locator('.cappick .cp.on').getAttribute('data-v') === 'rect' && await page.inputValue('[data-k="size.capW"]') === '70' && await page.inputValue('[data-k="size.capH"]') === '54', '화면: 새로고침 후에도 직사각형·70·54가 그대로다');
    ok(await page.locator('#paper .sddia').count() === 1, '화면: 새로고침 후에도 그림이 나온다');
    ok(/버전 102/.test(await page.locator('.brand small').textContent()), '화면: 윗줄에 "버전 67"이 보인다');
    ok(errors.length === 0, '화면: 오류 없음 ' + JSON.stringify(errors));
    await page.locator('#side').screenshot({ path: SHOT + '/ui_side_rect.png' }).catch(() => {});
    await page.screenshot({ path: SHOT + '/ui_full_rect.png' });
    await ctx.close();
  }

  /* 5. 모양만 바뀌고 다른 칸(기타 치수·비교 물건·맨 아래 글)은 그대로 */
  {
    const { ctx, page } = await open(browser, AFTER, Z({ shape: 'rect', len: '150', wid: '20', capW: '70', capH: '54', extra: [{ l: '문에서 튀어나온 길이', v: '48' }], note: '맨 아래 글' }));
    const t = await page.locator('#paper .sizebox').textContent();
    ok(/문에서 튀어나온 길이/.test(t) && /48mm/.test(t) && /맨 아래 글/.test(t) && /신용카드/.test(t), '기존 기능: 기타 치수·맨 아래 글·신용카드 비교가 그대로 나온다');
    await ctx.close();
  }

  await browser.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건');
  process.exit(fails ? 1 : 0);
})();
