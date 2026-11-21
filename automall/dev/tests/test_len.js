/* 자동몰 상세페이지 제작기 v84 — 총 길이 기준(옛 저장값 무시·직접 고른 값 유지) + 치수 그림 표시가 손잡이·캡·카드를 덮지 않는다 */
const http = require('http'), fs = require('fs'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const HTML = fs.readFileSync(B + '/w/am_work.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let PORT = 0;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(HTML); });
async function open(browser, seed, ctx0) {
  const ctx = ctx0 || await browser.newContext({ viewport: { width: 1500, height: 1100 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) r.continue(); else r.abort(); });
  if (seed) await page.addInitScript((s) => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', s); } catch (e) {} }, JSON.stringify(seed));
  await page.goto('http://127.0.0.1:' + PORT + '/'); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const Z = (o) => ({ v: 3, size: Object.assign({ len: '', wid: '', cap: '', ref: 'card', extra: [], note: '※ 그림은 치수 위치를 보여 주는 도식이에요.' }, o) });
/* 그림 속 면이 있는 부품(캡·레버·축·비교 물건)과 글자 표시의 자리를 잰다 */
const geo = (page) => page.evaluate(() => {
  const dia = document.querySelector('#paper .sddia'); if (!dia) return null; const d = dia.getBoundingClientRect(), rel = (q) => ({ l: q.left - d.left, r: q.right - d.left, t: q.top - d.top, b: q.bottom - d.top });
  const solids = [...dia.querySelectorAll('i')].map((e) => ({ st: e.getAttribute('style'), q: e.getBoundingClientRect() })).filter((x) => x.q.width > 8 && x.q.height > 8 && !/background:#2a56a3/.test(x.st) && !/dashed #9fb0d0/.test(x.st)).map((x) => Object.assign({ st: x.st }, rel(x.q)));
  const pills = [...dia.querySelectorAll('.sdp')].map((e) => Object.assign({ txt: e.textContent }, rel(e.getBoundingClientRect())));
  const refs = [...dia.querySelectorAll('.sdr')].map((e) => Object.assign({ txt: e.textContent, lines: Math.round(e.getBoundingClientRect().height / 27) }, rel(e.getBoundingClientRect())));
  return { W: d.width, H: d.height, solids, pills, refs };
});
const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
/* 글자 표시가 면(캡·레버·축·카드)을 덮는 곳 / 그림 밖으로 나가는 곳 / 비교 물건 설명이 3줄 이상으로 꺾이는 곳 */
const problems = (g) => { const out = []; const lab = g.pills.concat(g.refs);
  for (const p of lab) { if (p.l < -1 || p.r > g.W + 1 || p.t < -1 || p.b > g.H + 1) out.push('밖:' + p.txt.slice(0, 8)); for (const s of g.solids) if (hit(p, s) && !(g.refs.indexOf(p) >= 0 && /f3f5f9/.test(s.st))) out.push('덮음:' + p.txt.slice(0, 8)); }   // 카드가 넓으면 설명 글을 카드 안에 넣는 것은 설계대로예요
  for (const r of g.refs) if (r.lines > 2) out.push('줄꺾임:' + r.txt.slice(0, 6));
  for (let i = 0; i < lab.length; i++) for (let j = i + 1; j < lab.length; j++) if (hit(lab[i], lab[j])) out.push('표시끼리:' + lab[i].txt.slice(0, 6) + '/' + lab[j].txt.slice(0, 6));
  return out.join(','); };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 사장님 화면 그대로: 옛 버전에서 저장된 기준('lever', 직접 골랐다는 표시 없음)이 남아 있어도 새 기준(캡 중심~끝)으로 나온다 */
  {
    const { ctx, page, errors } = await open(browser, Z({ len: '150', wid: '10', shape: 'rect', capW: '70', capH: '54', base: 'lever' }));
    const pill = await page.evaluate(() => [...document.querySelectorAll('#paper .sdp')].map((e) => e.textContent));
    const row = await page.evaluate(() => document.querySelector('#paper .sdr2 b').textContent);
    ok(pill[0] === '총 길이(캡 중심~끝) 150mm' && row === '총 길이(캡 중심~끝)', '옛 저장값: 예전에 저장된 "캡 가장자리" 기준이 남아 있어도 그림 "총 길이(캡 중심~끝) 150mm"·표 "총 길이(캡 중심~끝)"로 나온다 → ' + pill[0] + ' / ' + row);
    const t = await page.evaluate(() => { const dia = document.querySelector('#paper .sddia'), d = dia.getBoundingClientRect(); const hub = [...dia.querySelectorAll('i')].find((e) => /border-radius:50%/.test(e.getAttribute('style')) && e.getBoundingClientRect().width < 40 && e.getBoundingClientRect().width > 8); const hq = hub.getBoundingClientRect(); const bars = [...dia.querySelectorAll('i')].filter((e) => /background:#2a56a3/.test(e.getAttribute('style')) && e.getBoundingClientRect().width <= 3 && e.getBoundingClientRect().height > 14 && e.getBoundingClientRect().height < 20).map((e) => e.getBoundingClientRect().left + 1 - d.left); return { hub: (hq.left + hq.right) / 2 - d.left, ticks: bars }; });
    ok(t.ticks.some((x) => Math.abs(x - t.hub) < 3), '옛 저장값: 총 길이 치수선의 오른쪽 끝이 둥근 축 표시(캡 중심)에서 끝난다 (축 ' + Math.round(t.hub) + ' · 끝 ' + t.ticks.map(Math.round) + ')');
    const sg = await page.evaluate(() => [...document.querySelectorAll('.segpick .sg[data-act="lenbase"]')].map((b) => b.dataset.v + (b.classList.contains('on') ? '*' : '') + ':' + b.querySelector('b').textContent).join(' | '));
    ok(sg === 'center*:캡 중심부터 | lever:캡 가장자리부터 | full:캡까지 포함', '옛 저장값: 입력칸에서도 "캡 중심부터"가 눌려 있다 → ' + sg);
    const g = await geo(page); ok(problems(g) === '', '옛 저장값: 사장님 숫자(150 · 10 · 70×54)로 그린 그림에서 글자 표시가 손잡이·캡·카드를 덮지 않고 모두 그림 안쪽이다 → ' + problems(g));
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 직접 고른 기준은 지킨다(다시 열어도 그대로) / 새로 고르기 전에는 바뀌지 않는다 */
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const a = await open(browser, Z({ len: '150', wid: '10', cap: '70', ref: 'none' }), ctx);
    await a.page.click('.segpick .sg[data-v="lever"]'); await a.page.waitForTimeout(700);
    const st = await a.page.evaluate(() => { const x = JSON.parse(localStorage.getItem('am-dp-v1')).size; return x.base + '/' + x.baseSet; });
    ok(st === 'lever/user', '직접 고름: "캡 가장자리부터"를 누르면 저장 값에 기준과 "직접 골랐음" 표시가 같이 저장된다 → ' + st);
    await a.page.close();
    const b = await open(browser, null, ctx);
    const pill = await b.page.evaluate(() => document.querySelector('#paper .sdp').textContent);
    ok(pill === '총 길이(캡 가장자리~끝) 150mm', '직접 고름: 다시 열어도 직접 고른 "캡 가장자리~끝"이 그대로다 → ' + pill);
    ok(b.errors.length === 0, '오류 없음 ' + JSON.stringify(b.errors)); await ctx.close();
  }

  /* 3. 여러 조합에서 글자 표시가 손잡이·캡·카드를 덮지 않는다
        보통 크기(총 길이 150·캡 70) / 큰 편(총 길이 220·캡 100, 세 자리 숫자) / 극단값(총 길이 250·캡 120·총 폭 120 — 비교 물건이 동전이면 제외) */
  {
    let bad = [], n = 0;
    const caps = (sh, k) => { const c = k === 1 ? [120, 110, 120, 100] : k === 2 ? [100, 95, 100, 70] : [70, 60, 70, 54]; return sh === 'round' ? { cap: String(c[0]) } : sh === 'square' ? { capW: String(c[1]) } : { capW: String(c[2]), capH: String(c[3]) }; };
    const LEN = { 0: '150', 1: '250', 2: '220' };
    for (const sh of ['round', 'square', 'rect', 'rrect']) for (const ref of ['card', 'coin', 'none']) for (const [dir, base, wid, k] of [['L', 'center', '10', 0], ['R', 'center', '10', 0], ['L', 'center', '30', 2], ['R', 'lever', '25', 0], ['L', 'full', '25', 0], ['R', 'full', '30', 2], ['L', 'center', '120', 1]]) {
      if (k === 1 && ref === 'coin') continue;
      const o = Object.assign({ shape: sh, len: LEN[k], wid, ref, dir, base }, caps(sh, k), { baseSet: 'user' });
      const { ctx, page } = await open(browser, Z(o)); const g = await geo(page); n++;
      const p = g ? problems(g) : '그림 없음'; if (p) bad.push([sh, ref, dir, base, 'w' + wid, 'k' + k, p].join('/'));
      await ctx.close();
    }
    ok(bad.length === 0, `조합 ${n}가지: 어느 모양·비교 물건·방향·기준·큰 숫자(세 자리)에서도 글자 표시가 면을 덮지 않고 그림 안쪽이다 ${bad.slice(0, 6).join(' ; ')}`);
  }

  /* 4. 표 줄 이름은 왼쪽 맞춤 / 총 폭을 안 적어도(점선 손잡이) 그림이 멀쩡하다 */
  {
    const { ctx, page, errors } = await open(browser, Z({ len: '150', shape: 'rect', capW: '70', capH: '54' }));
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('#paper .sdr2 b')).textAlign) === 'left', '표: 줄 이름은 왼쪽 맞춤이다(두 줄로 꺾여도 가운데로 치우치지 않는다)');
    const g = await geo(page); ok(g && problems(g) === '', '총 폭을 안 적어도: 글자 표시가 면을 덮지 않는다 → ' + (g ? problems(g) : '그림 없음'));
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건'); process.exit(fails ? 1 : 0);
})();
