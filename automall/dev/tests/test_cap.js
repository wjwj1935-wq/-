/* 자동몰 상세페이지 제작기 v85 — 받침(카바) 모양·치수가 지시문·검수·참고 사진으로 AI에게 전달되는지 (구글·클로드는 가짜) */
const http = require('http'), fs = require('fs'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const HTML = fs.readFileSync(B + '/w/am_work.html', 'utf8');
const PHOTO = B + '/up/white_prod.png';
const png = fs.readFileSync(PHOTO), PW = png.readUInt32BE(16), PH = png.readUInt32BE(20);
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let PORT = 0;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(HTML); });
/* 가짜 클로드: 받침 위치 요청에는 window.__plate 를 답하고, 나머지는 얌전히 답한다. 기록은 window.__log */
const CLAUDE = () => {
  window.__log = [];
  if (!localStorage.getItem('__mock')) return;
  window.claude = { use: async (n) => n === 'sample' ? { limits: async () => ({ images: { maxCount: 3 } }), json: async (p, o) => {
    const kind = /가장 작은 사각 영역/.test(p) ? 'plate' : /"spec"/.test(p) ? 'spec' : /"rosetteShape"/.test(p) ? 'shape' : /"ok"/.test(p) ? 'check' : 'other';
    window.__log.push({ kind, p, imgs: o && o.images ? [].concat(o.images).length : 0 });
    if (kind === 'plate') { if (window.__plateErr) throw { code: 'upstream_error' }; return window.__plate; }
    if (kind === 'spec') return { kind: '레버형', lever: '레버', rosette: '받침', rosetteShape: 'unknown', finish: '마감', features: [], spec: '레버가 받침에서 한쪽으로 뻗어요.', never: [] };
    if (kind === 'shape') return { rosetteShape: 'unknown', rosette: '받침' };
    if (kind === 'check') return window.__check || { ok: true, issues: [] };
    return {};
  } } : null };
};
async function open(browser, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  const page = await ctx.newPage(), errors = [], gReq = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) return r.continue();
    if (/generativelanguage\.googleapis\.com/.test(u)) {
      if (/\/models\?/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-3-pro-image-preview', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] }] }) });
      if (/generateContent/.test(u)) { gReq.push(JSON.parse(r.request().postData() || '{}')); const b64 = png.toString('base64'); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64 } }] } }] }) }); }
    }
    return r.abort();
  });
  if (o.mock) await page.addInitScript(() => localStorage.setItem('__mock', '1'));
  await page.addInitScript(CLAUDE);
  if (o.gkey) await page.addInitScript(() => { try { localStorage.setItem('am-gk', 'TEST-KEY'); } catch (e) {} });
  await page.goto('http://127.0.0.1:' + PORT + '/#wjdebug'); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForFunction(() => window.__wj, null, { timeout: 5000 }); await page.waitForTimeout(500);
  return { ctx, page, errors, gReq };
}
const upload = async (page) => { await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200); };
const setSize = (page, z) => page.evaluate((z) => { const S = window.__wj.S(); S.size = Object.assign({ len: '150', wid: '10', cap: '', capW: '', capH: '', ref: 'card', extra: [] }, z); }, z);
const prompts = (page) => page.evaluate(() => { const w = window.__wj, out = {}; for (const j of w.jobs()) { if (!out[j.kind]) out[j.kind] = w.promptOf(j); } return out; });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 모양별로 지시문에 받침 정보가 들어간다 */
  {
    const { ctx, page, errors } = await open(browser); await upload(page);
    const kinds = await page.evaluate(() => [...new Set(window.__wj.jobs().map((j) => j.kind))]);
    ok(['hero', 'concept', 'base', 'edit'].every((k) => kinds.includes(k)), '준비: 기본 화면의 작업 종류 → ' + kinds.join(','));
    // 모양을 아직 정하지 않았을 때(기본 원형은 확인되지 않은 값)
    await setSize(page, { shape: 'round' });
    let P = await prompts(page);
    ok(Object.entries(P).filter(([k]) => k !== 'edit').every(([, t]) => !/받침 정보\(사장님/.test(t)) && await page.evaluate(() => window.__wj.capLine()) === '', '미정: 모양을 아직 안 정했으면 지시문에 받침 정보를 넣지 않는다(기본값 원형을 사실처럼 보내지 않는다)');
    // 직사각형 70×54
    await setSize(page, { shape: 'rect', shapeSet: 'user', capW: '70', capH: '54' });
    P = await prompts(page);
    const need = ['받침(카바)은 직사각형이고', '가로(좌우) 약 70mm × 세로(위아래) 약 54mm', '1.3 : 1', '가로로 긴 모양', '정사각형이나 원형으로 바꾸지 마세요', '위 특징 메모와 다르면 이 값이 맞습니다'];
    ok(['hero', 'concept', 'base'].every((k) => need.every((x) => P[k] && P[k].includes(x))), '직사각형 70×54: 첫 화면·소개·기준 설치 사진 지시문에 모양·가로세로 숫자·비율·"가로로 긴 모양"·"바꾸지 마세요"가 모두 들어간다');
    await page.evaluate(() => { window.__wj.S().colors.gen = 'each'; });
    const Pe = await prompts(page);
    await page.evaluate(() => { window.__wj.S().colors.gen = 'sheet'; });
    const Ps = await prompts(page);
    ok(need.every((x) => Pe.color && Pe.color.includes(x)) && need.every((x) => Ps.sheet && Ps.sheet.includes(x)), '직사각형 70×54: 칸마다 만들기(color)와 시트 방식(sheet) 지시문에도 모두 들어간다');
    await page.evaluate(() => { window.__wj.S().colors.gen = 'base'; });
    ok([P, Pe, Ps].every((o) => Object.values(o).every((t) => !/받침 원판/.test(t))), '말투: 어떤 지시문에도 "받침 원판"이 남아 있지 않다');
    ok(!/받침 정보\(사장님/.test(P.edit), '편집(문 색 바꾸기): 확정한 기준 사진을 편집하는 작업이라 받침 정보를 따로 넣지 않는다(손잡이를 새로 그리지 않는다)');
    ok(/레버 끝부터 받침까지/.test(P.base), '말투: 구도 규칙이 "레버 끝부터 받침까지"로 바뀌었다');
    // 단위가 붙어 있어도 읽는다 / 세로로 긴 모양 / 둥근 사각형 / 정사각형 / 원형
    await setSize(page, { shape: 'rect', shapeSet: 'user', capW: '54mm', capH: '70 mm' });
    ok((await page.evaluate(() => window.__wj.capLine())).includes('세로로 긴 모양') && (await page.evaluate(() => window.__wj.capLine())).includes('가로(좌우) 약 54mm × 세로(위아래) 약 70mm'), '세로로 긴 모양(54×70, 단위 mm가 붙어 있어도): "세로로 긴 모양"이라고 적는다');
    await setSize(page, { shape: 'rrect', shapeSet: 'auto', capW: '72', capH: '50' });
    ok((await page.evaluate(() => window.__wj.capLine())).includes('모서리가 둥근 직사각형이고') && (await page.evaluate(() => window.__wj.capLine())).includes('1.44 : 1'), '둥근 사각형 72×50: 모서리가 둥근 직사각형, 1.44 : 1');
    await setSize(page, { shape: 'square', shapeSet: 'user', capW: '60' });
    ok((await page.evaluate(() => window.__wj.capLine())).includes('정사각형이고 한 변이 약 60mm') , '정사각형 60: "한 변이 약 60mm"');
    await setSize(page, { shape: 'round', shapeSet: 'user', cap: '70' });
    ok((await page.evaluate(() => window.__wj.capLine())).includes('둥근 원판(원형)이고 지름이 약 70mm입니다. 사각형으로 바꾸지 마세요'), '원형 70: 둥근 원판, 지름 70mm, 사각형으로 바꾸지 마세요');
    // 숫자가 없으면 숫자는 지어내지 않고 모양만
    await setSize(page, { shape: 'rect', shapeSet: 'user', capW: '70' });
    let t = await page.evaluate(() => window.__wj.capLine());
    ok(t.includes('직사각형입니다(정사각형·원형이 아님)') && !/70|mm/.test(t.replace('받침(카바)은 직사각형입니다(정사각형·원형이 아님). 가로와 세로 길이가 다른 모양을 사진 그대로 유지하세요.', '')), '가로만 적었을 때: 없는 세로 숫자는 지어내지 않고 "직사각형(정사각형·원형이 아님)"만 적는다');
    // 클로드가 알아본 모양만 있을 때
    await setSize(page, { shape: 'round' });
    await page.evaluate(() => { const S = window.__wj.S(); S.capShape = { id: S.src.id, shape: 'rect' }; });
    t = await page.evaluate(() => window.__wj.capLine());
    ok(t.includes('직사각형입니다'), '인식만 있을 때: 클로드가 알아본 직사각형을 쓴다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 검수문과 화면 안내 */
  {
    const { ctx, page, errors } = await open(browser); await upload(page);
    await setSize(page, { shape: 'rect', shapeSet: 'user', capW: '70', capH: '54' });
    const ck = await page.evaluate(() => window.__wj.chkPrompt('color', '왼쪽'));
    ok(ck.includes('받침(카바)은 직사각형이고') && ck.includes('받침 모양이 달라요') && ck.includes('원근 때문에') && !/받침\(원판\)|받침 원판/.test(ck), '검수: 받침 정보와 "받침 모양이 달라요" 판정 규칙이 들어가고 "원판" 말투가 없다');
    ok(/받침\(카바\)의 모양\(원형·정사각형·직사각형\)과 가로세로 비율/.test(ck), '검수: 비교 항목에 받침 모양·가로세로 비율이 들어간다');
    await setSize(page, { shape: 'round' });
    ok(!(await page.evaluate(() => window.__wj.chkPrompt('color', '왼쪽'))).includes('받침 정보(사장님이 확인한 값)'), '검수: 모양을 아직 정하지 않았으면 받침 정보를 넣지 않는다');
    const ui = async (z) => { await setSize(page, z); return page.evaluate(() => window.__wj.capUiLine()); };
    ok(/⚠ 받침\(캡\) 모양을 아직 정하지 않았어요/.test(await ui({ shape: 'round' })), '화면: 모양 미정이면 빨간 경고가 나온다');
    ok(/직사각형 · 가로 70 × 세로 54mm/.test(await ui({ shape: 'rect', shapeSet: 'user', capW: '70', capH: '54' })), '화면: "직사각형 · 가로 70 × 세로 54mm"가 나온다');
    ok(/치수를 적으면 비율까지 지켜요/.test(await ui({ shape: 'rect', shapeSet: 'user', capW: '70' })), '화면: 치수가 모자라면 "치수를 적으면 비율까지 지켜요"가 나온다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3. 받침 부분을 크게 오려서 참고 사진으로 */
  {
    const refInfo = (page) => page.evaluate(async () => { const v = await window.__wj.buildRefs(); const dims = []; for (const d of v.imgs) { const im = new Image(); im.src = 'data:image/jpeg;base64,' + d; await im.decode(); dims.push([im.naturalWidth, im.naturalHeight]); } return { n: v.imgs.length, note: v.note, dims }; });
    // 기준: 클로드가 받침을 못 찾았을 때의 사진 수(확대 사진이 몇 장 있어도 그 수)
    const z = await open(browser, { mock: true }); await z.page.evaluate(() => { window.__plate = { found: false }; }); await upload(z.page);
    const zero = await refInfo(z.page); await z.ctx.close();
    ok(zero.n >= 1 && !/오려 낸/.test(zero.note), '기준: 받침을 못 찾으면 예전과 같이 사진 ' + zero.n + '장(제품 전체 + 확대 사진)만 보낸다');
    const box = { found: true, x0: .3, y0: .2, x1: .6, y1: .7 };
    const { ctx, page, errors } = await open(browser, { mock: true });
    await page.evaluate((b) => { window.__plate = b; }, box); await upload(page);
    const plateCalls = () => page.evaluate(() => window.__log.filter((l) => l.kind === 'plate').length);
    const r = await refInfo(page), last = r.dims[r.dims.length - 1];
    ok(r.n === zero.n + 1 && /받침\(카바\) 부분을 크게 오려 낸 사진/.test(r.note) && /정사각형이나 원형으로 바꾸지 마세요/.test(r.note), `오리기: 참고 사진이 ${zero.n}장 → ${r.n}장으로 1장 늘고 "받침 부분을 크게 오려 낸 사진" 설명이 붙는다`);
    ok(new RegExp('첨부 사진 ' + r.n + ': 같은 제품의 받침').test(r.note), '오리기: 설명의 사진 번호(' + r.n + '번)가 맨 마지막 사진과 맞는다');
    const padx = (.6 - .3) * .12, pady = (.7 - .2) * .12, ew = (.6 + padx) - (.3 - padx), eh = (.7 + pady) - (.2 - pady), expA = (ew * PW) / (eh * PH), gotA = last[0] / last[1];
    ok(Math.abs(gotA - expA) / expA < .03, `오리기: 오린 사진의 가로세로 비율이 짚은 상자(+여백 12%)와 같다 (기대 ${expA.toFixed(3)} · 실제 ${gotA.toFixed(3)} · ${last.join('×')})`);
    const sw = ew * PW, sh = eh * PH, k = Math.min(3, Math.max(.5, 768 / Math.max(sw, sh)));
    ok(Math.abs(Math.max(...last) - Math.round(Math.max(sw, sh) * k)) <= 2, `오리기: 오린 부분을 알맞게 키워서 보낸다 (원래 ${Math.round(Math.max(sw, sh))}픽셀 → ${Math.max(...last)}픽셀, 기대 ${Math.round(Math.max(sw, sh) * k)})`);
    ok(r.dims[0][0] <= 1024 && r.dims[0][1] <= 1024 && Math.abs(r.dims[0][0] / r.dims[0][1] - PW / PH) < .02, '오리기: 첫 번째 사진은 원래 전체 사진이다 (' + r.dims[0].join('×') + ')');
    await page.evaluate(() => window.__wj.buildRefs()); await page.evaluate(() => window.__wj.buildRefs());
    ok(await plateCalls() === 1, '절약: 같은 사진이면 받침 위치를 클로드에게 한 번만 묻는다 (' + await plateCalls() + '번)');
    const pl = await page.evaluate(() => window.__log.find((l) => l.kind === 'plate'));
    ok(pl && pl.imgs === 1 && pl.p.includes('0~1 비율'), '요청: 사진 한 장과 "0~1 비율 좌표를 JSON으로" 요청을 보낸다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
    // 못 찾았거나 엉뚱한 상자, 오류일 때는 오리기 없이 원래대로
    for (const [label, reply, err] of [['너무 작은 상자', { found: true, x0: .4, y0: .4, x1: .45, y1: .45 }, false], ['사진 전체를 감싼 상자', { found: true, x0: 0, y0: 0, x1: 1, y1: 1 }, false], ['거꾸로 된 좌표', { found: true, x0: .7, y0: .2, x1: .3, y1: .7 }, false], ['글자로 된 좌표', { found: true, x0: 'a', y0: 'b', x1: 'c', y1: 'd' }, false], ['클로드 오류', null, true]]) {
      const c = await open(browser, { mock: true });
      await c.page.evaluate(([b, e]) => { window.__plate = b; window.__plateErr = e; }, [reply, err]); await upload(c.page);
      const v = await refInfo(c.page);
      ok(v.n === zero.n && !/오려 낸/.test(v.note), `안전: ${label}이면 오리기를 하지 않고 원래대로 ${zero.n}장만 보낸다`);
      await c.ctx.close();
    }
    const c2 = await open(browser); await upload(c2.page);
    const v2 = await refInfo(c2.page);
    ok(v2.n === zero.n && !/오려 낸/.test(v2.note), '안전: 클로드를 쓸 수 없는 화면에서는 오리기 없이 원래대로 ' + zero.n + '장만 보낸다(예전과 같다)'); await c2.ctx.close();
  }

  /* 4. 끝까지: 구글에 가는 실제 요청에 받침 정보와 오린 사진이 들어가는지, 검수가 받침이 다르면 걸러내는지 */
  {
    const { ctx, page, errors, gReq } = await open(browser, { mock: true, gkey: true });
    await page.evaluate(() => { window.__plate = { found: true, x0: .3, y0: .2, x1: .6, y1: .7 }; window.__check = { ok: false, issues: ['받침 모양이 달라요: 정사각형으로 바뀌었어요'] }; });
    await upload(page);
    await setSize(page, { shape: 'rect', shapeSet: 'user', capW: '70', capH: '54' });
    await page.evaluate(() => { const S = window.__wj.S(); });
    // 화면의 받침 정보 줄
    await page.waitForTimeout(600);
    const baseCard = await page.evaluate(() => { const e = document.querySelector('.job.base'); return e ? e.textContent : ''; });
    if (baseCard) ok(/받침 정보/.test(baseCard) || /⚠ 받침/.test(baseCard), '화면: 기준 설치 사진 칸에 받침 정보 줄이 보인다 → ' + (baseCard.match(/받침 정보[^.]*\./) || baseCard.match(/⚠ 받침[^.]*\./) || [''])[0].slice(0, 60));
    else console.log('INFO 기준 설치 사진 칸이 처음 화면에 없어서 화면 확인은 건너뜀');
    // 후보 만들기 → 비용 확인 창의 "만들기" → 구글 요청을 가로챈다
    const btn = page.locator('.job.base button[data-act="gone"]');
    ok(await btn.count() > 0, '준비: 구글 키를 넣으면 "후보 만들기" 단추가 나온다');
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForSelector('#gConfirm:not([hidden])', { timeout: 5000 });
      await page.click('#gConfirm button[data-act="ggo"]');
      for (let i = 0; i < 60 && gReq.length < 1; i++) await page.waitForTimeout(250);
      await page.waitForTimeout(3000);
      ok(gReq.length >= 1, '끝까지: 구글에 이미지 만들기 요청이 나갔다 (' + gReq.length + '건)');
      if (gReq.length) {
        const parts = gReq[0].contents[0].parts, text = parts[0].text, imgs = parts.filter((p) => p.inline_data).length;
        ok(text.includes('받침(카바)은 직사각형이고') && text.includes('가로(좌우) 약 70mm × 세로(위아래) 약 54mm') && !/받침 원판/.test(text), '끝까지: 실제 구글 요청 글에 "직사각형 · 가로 70 × 세로 54"가 들어 있고 "받침 원판"은 없다');
        const zeroN = await page.evaluate(() => window.__zeroN || 0);
        ok(/받침\(카바\) 부분을 크게 오려 낸 사진/.test(text) && imgs >= 2, '끝까지: 실제 구글 요청에 받침 확대 사진이 붙고 설명 글이 있다 (사진 ' + imgs + '장)');
      }
      const chk = await page.evaluate(() => window.__log.filter((l) => l.kind === 'check'));
      ok(chk.length > 0 && chk.some((c) => /받침\(카바\)은 직사각형이고/.test(c.p) && /받침 모양이 달라요/.test(c.p)), '끝까지: 만든 사진 검수 요청에도 받침 정보와 판정 규칙이 들어간다 (검수 ' + chk.length + '건)');
      const flagged = await page.evaluate(() => document.querySelector('.job.base') ? document.querySelector('.job.base').textContent : '');
      ok(/받침 모양이 달라요: 정사각형으로 바뀌었어요/.test(flagged), '끝까지: 검수가 "받침 모양이 달라요"라고 지적하면 후보 아래에 그대로 보인다');
    }
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건'); process.exit(fails ? 1 : 0);
})();
