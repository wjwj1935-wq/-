/* 자동몰 상세페이지 제작기 v87 — 받침 목록 · 방향 잠금과 좌우 뒤집기 · 레버 길이 비율 · 고정 메모 (구글·클로드는 가짜) */
const http = require('http'), fs = require('fs'), zlib = require('zlib'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const HTML = fs.readFileSync(B + '/w/am_work.html', 'utf8');
const H2C = fs.readFileSync(B + '/h2c/node_modules/html2canvas/dist/html2canvas.min.js');
const PHOTO = B + '/up/white_prod.png';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let PORT = 0;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(HTML); });

/* ---- 가짜 그림(PNG) 만들기 ---- */
const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(w, h, bg, fg) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const c = (x > w * .25 && x < w * .75 && y > h * .4 && y < h * .6) ? fg : bg; const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hsl = (h, s, l) => { s /= 100; l /= 100; const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
let seedN = 0;
const fresh = () => { seedN++; const h = (seedN * 47) % 360; return png(96, 96, hsl(h, 65, 45), hsl((h + 180) % 360, 40, 85)); };
function pngL(w, h, bg, fg) {   // 왼쪽으로 치우친 네모(좌우를 뒤집으면 오른쪽으로 간다)
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const c = (x > w * .1 && x < w * .45 && y > h * .4 && y < h * .6) ? fg : bg; const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let asym = false;
const gray = () => png(96, 96, [128, 128, 128], [128, 128, 128]);

/* ---- 가짜 구글: 칸(장면) 이름과 몇 번째 요청인지에 따라 정해 둔 대로 답한다 ---- */
const sc = { rules: {}, counts: {}, reqs: [], inflight: 0, maxIn: 0, delay: 25, baseBytes: [], dupSrc: null };
function resetCnt() { sc.counts = {}; sc.reqs = []; sc.inflight = 0; sc.maxIn = 0; }
function resetSc() { sc.rules = {}; sc.counts = {}; sc.reqs = []; sc.inflight = 0; sc.maxIn = 0; sc.baseBytes = []; sc.dupSrc = null; seedN = 0; }
function classify(text) {
  if (/첨부한 사진\(사진 1\)을 편집하세요/.test(text)) { const m = text.match(/색과 재질을 "(.*?)"\(으\)로/) || text.match(/더할 것: (.*?)\. 자연스러운/); return { kind: 'edit', key: m ? m[1] : '?' }; }
  if (/다른 문 색상 사진을 만드는 기준이 되니/.test(text)) return { kind: 'base', key: 'base' };
  if (/고급 제품 광고 사진/.test(text)) return { kind: 'hero', key: 'hero' };
  if (/어두운 남회색 스튜디오/.test(text)) return { kind: 'concept', key: 'concept' };
  return { kind: 'other', key: 'other' };
}
async function googleRoute(route) {
  const rq = route.request(), u = rq.url();
  if (/\/models\?/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-3-pro-image-preview', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] }] }) });
  const body = JSON.parse(rq.postData() || '{}'), parts = (body.contents && body.contents[0] && body.contents[0].parts) || [], text = (parts.find((p) => p.text) || {}).text || '';
  const cl = classify(text), model = decodeURIComponent((u.match(/models\/([^:]+):/) || [])[1] || '');
  const nth = (sc.counts[cl.key] = (sc.counts[cl.key] || 0) + 1);
  let rule = null; for (const k of Object.keys(sc.rules)) if (cl.key.includes(k) || k === cl.kind) rule = sc.rules[k];
  const act = rule ? (rule[nth - 1] !== undefined ? rule[nth - 1] : (rule.dflt !== undefined ? rule.dflt : 'ok')) : 'ok';
  sc.reqs.push({ kind: cl.kind, key: cl.key, nth, model, act, text, t: Date.now() });
  sc.inflight++; sc.maxIn = Math.max(sc.maxIn, sc.inflight);
  await new Promise((r) => setTimeout(r, sc.delay));
  sc.inflight--;
  const json = (status, o) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
  if (act === '429') return json(429, { error: { message: 'Resource has been exhausted' } });
  if (act === '500') return json(500, { error: { message: 'internal' } });
  if (act === '402') return json(402, { error: { message: 'prepayment credits are depleted' } });
  if (act === 'blocked') return json(200, { candidates: [{ finishReason: 'IMAGE_SAFETY' }] });
  let img;
  if (act === 'blank') img = gray();
  else if (act === 'dup' && sc.dupSrc) img = sc.dupSrc;
  else { seedN++; const hh = (seedN * 47) % 360; img = asym ? pngL(96, 96, hsl(hh, 65, 45), hsl((hh + 180) % 360, 40, 85)) : fresh(); if (cl.kind === 'base') sc.baseBytes.push(img); }
  return json(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: img.toString('base64') } }] }, finishReason: 'STOP' }] });
}

/* ---- 가짜 클로드: 검수는 칸(장면)별로 정해 둔 대로 합격/불합격 ---- */
const CLAUDE = () => {
  window.__log = []; window.__checkRules = {}; window.__checkCnt = {};
  window.claude = { use: async (n) => n === 'sample' ? { limits: async () => ({ images: { maxCount: 3 } }), json: async (p, o) => {
    const kind = /가장 작은 사각 영역/.test(p) ? 'plate' : /"spec"/.test(p) ? 'spec' : /"rosetteShape"/.test(p) ? 'shape' : /"ok"/.test(p) ? 'check' : 'other';
    window.__log.push({ kind, p });
    if (kind === 'plate') return { found: false };
    if (kind === 'spec') return { kind: '레버형', lever: '레버', rosette: '받침', rosetteShape: 'unknown', finish: '마감', features: [], spec: '레버가 받침에서 한쪽으로 뻗어요.', never: [] };
    if (kind === 'shape') return { rosetteShape: 'unknown', rosette: '받침' };
    if (kind === 'check') {
      const m = p.match(/이 칸의 문은 "(.*?)"이어야|"(.*?)" 장면이라/), scn = m ? (m[1] || m[2]) : '';
      let res = { ok: true, issues: [] };
      for (const k in window.__checkRules) if (scn.includes(k)) { const n = (window.__checkCnt[k] = (window.__checkCnt[k] || 0) + 1), arr = window.__checkRules[k], v = arr[n - 1] !== undefined ? arr[n - 1] : (arr.dflt !== undefined ? arr.dflt : true); res = v === true ? { ok: true, issues: [] } : { ok: false, issues: [typeof v === 'string' ? v : '레버 방향이 달라요'] }; }
      return res;
    }
    return {};
  } } : null };
};
async function open(browser, o) {
  o = o || {};
  const ctx = o.ctx || await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (/html2canvas\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: H2C });
    if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) return r.continue();
    if (/generativelanguage\.googleapis\.com/.test(u)) return googleRoute(r);
    return r.abort();
  });
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('__init')) { localStorage.setItem('am-gk', 'TEST-KEY'); sessionStorage.setItem('__init', '1'); } } catch (e) {} });
  if (o.slow0) await page.addInitScript(() => { try { localStorage.setItem('am-slow', '0'); } catch (e) {} });
  await page.addInitScript(CLAUDE);
  await page.goto('http://127.0.0.1:' + PORT + '/#wjdebug'); await page.waitForSelector('#paper .sec', { state: 'attached' });
  await page.waitForFunction(() => window.__wj, null, { timeout: 5000 });
  await page.waitForFunction(() => window.__wj.G.state === 'on', null, { timeout: 8000 });
  await page.evaluate(() => { window.__wj.G.coolScale = 0; });
  return { ctx, page, errors };
}
/* 사진 넣고 → 기준 사진 후보를 만들어 첫 후보로 확정하기까지 */
async function prepare(page) {
  await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
  await page.evaluate(() => { const S = window.__wj.S(); S.lvDir = { id: S.src.id, dir: 'L', auto: false }; });
  await page.evaluate(() => window.__wj.gRun(window.__wj.jobs().filter((j) => j.kind === 'base'), { quiet: false }));
  await page.evaluate(() => document.querySelector('[data-act="basepick"][data-k="0"]').click());
  await page.waitForTimeout(300);
  return page.evaluate(() => ({ ok: window.__wj.S().baseOk, n: window.__wj.gList().filter((j) => j.kind === 'edit').length }));
}
const run = (page, only, o) => page.evaluate(async ({ only, o }) => { const w = window.__wj; let l = w.gList().filter((j) => j.kind === 'edit'); if (only) l = l.filter((j) => only.some((k) => (w.S().colors.items[j.i].label || '').includes(k))); const r = await w.gRun(l, Object.assign({ quiet: false }, o || {})); return { done: r.done, total: r.total, stopped: r.stopped, fails: r.fails.length, holds: (r.holds || []).map((h) => ({ n: h.name, e: h.empty, w: h.why })), passN: r.passN, unN: r.unN }; }, { only, o });
const tile = (page, label) => page.evaluate((label) => { const w = window.__wj, S = w.S(), i = S.colors.items.findIndex((it) => (it.label || '').includes(label)), p = S.colors.items[i].photo; const m = p && w.PH.get(p.id); return { i, has: !!m, chk: p && p.chk ? { ok: p.chk.ok, issues: p.chk.issues, manual: !!p.chk.manual } : null, hold: w.holdOf('colors.items.' + i + '.photo'), type: m ? m.blob.type : '' }; }, label);

const setSize = (page, z) => page.evaluate((z) => { const S = window.__wj.S(); S.size = Object.assign({ len: '', wid: '', cap: '', capW: '', capH: '', ref: 'card', extra: [] }, z); }, z);
const prompts = (page) => page.evaluate(() => { const w = window.__wj, out = {}; const S = w.S(); const keep = S.colors.gen; for (const g of ['base', 'each', 'sheet']) { S.colors.gen = g; for (const j of w.jobs()) { const k = j.kind; if (!out[k]) out[k] = w.promptOf(j); } } S.colors.gen = keep; return out; });
const calls = (page, re) => page.evaluate((s) => window.__log.filter((l) => l.kind === 'check' && new RegExp(s).test(l.p)).length, re.source);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 받침 목록: 저장 → 고르면 잠김 → 풀기 → 지우기 → 새로 고침 뒤에도 남음 */
  {
    resetSc();
    const ctx0 = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const { ctx, page, errors } = await open(browser, { ctx: ctx0 });
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2000);
    ok(/아직 저장한 받침이 없어요/.test(await page.textContent('#side')), '처음: 목록이 비어 있다');
    await page.click('[data-act="capsave"]'); await page.waitForTimeout(150);
    ok(/모양을 고르고 치수를 모두 적어 주세요/.test(await page.textContent('#toast')) && (await page.evaluate(() => JSON.parse(localStorage.getItem('am-caps') || '[]').length)) === 0, '치수를 안 적고 저장을 누르면 안내만 나오고 저장되지 않는다');
    await page.click('[data-act="capsel"][data-v="rect"]');
    await page.fill('input[data-k="size.capW"]', '70'); await page.fill('input[data-k="size.capH"]', '54');
    await page.fill('#capName', '직사각 70×54'); await page.click('[data-act="capsave"]'); await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({ ls: JSON.parse(localStorage.getItem('am-caps') || '[]'), lock: window.__wj.capLocked(), pre: window.__wj.S().size.capPreset }));
    ok(st.ls.length === 1 && st.ls[0].shape === 'rect' && st.ls[0].capW === '70' && st.ls[0].capH === '54' && st.ls[0].name === '직사각 70×54', '저장: 이 브라우저에 모양·치수·이름이 보관된다 ' + JSON.stringify(st.ls[0]));
    ok(st.lock === true && st.pre === st.ls[0].id, '저장하면 바로 그 받침으로 고정된다');
    ok(await page.isDisabled('input[data-k="size.capW"]') && await page.isDisabled('input[data-k="size.capH"]') && await page.isDisabled('[data-act="capsel"][data-v="round"]'), '고정되면 가로·세로 칸과 모양 단추가 잠긴다');
    ok(/🔒 직사각 70×54/.test(await page.textContent('.capchips')) && /로 고정됐어요/.test(await page.textContent('#side')), '화면: 칩에 🔒와 "고정됐어요" 안내가 나온다');
    ok(await page.evaluate(() => /직사각형이고/.test(window.__wj.capLine()) && /70mm × 세로\(위아래\) 약 54mm/.test(window.__wj.capLine())), '고정된 값이 이미지 지시문(받침 정보)에 들어간다');
    await page.click('[data-act="capunlock"]');
    ok(!(await page.isDisabled('input[data-k="size.capW"]')) && !(await page.evaluate(() => window.__wj.capLocked())), '"고정 풀기": 칸이 다시 열린다');
    // 둘째: 원형 52, 셋째 같은 값은 중복
    await page.click('[data-act="capsel"][data-v="round"]'); await page.fill('input[data-k="size.cap"]', '52'); await page.fill('#capName', ''); await page.click('[data-act="capsave"]'); await page.waitForTimeout(150);
    let ls = await page.evaluate(() => JSON.parse(localStorage.getItem('am-caps')));
    ok(ls.length === 2 && ls[1].shape === 'round' && ls[1].cap === '52' && ls[1].name === '', '원형 지름 52도 저장된다(이름을 비우면 자동 이름)');
    ok(/원형 지름 52mm/.test(await page.textContent('.capchips')), '자동 이름: "원형 지름 52mm"');
    await page.click('[data-act="capunlock"]'); await page.click('[data-act="capsave"]'); await page.waitForTimeout(150);
    ls = await page.evaluate(() => JSON.parse(localStorage.getItem('am-caps')));
    ok(ls.length === 2, '같은 모양·치수를 또 저장해도 목록은 늘지 않는다');
    // 목록에서 고르기
    await page.click('[data-act="capuse"][data-id="' + ls[0].id + '"]'); await page.waitForTimeout(150);
    let z = await page.evaluate(() => { const Z = window.__wj.S().size; return { shape: Z.shape, cap: Z.cap, capW: Z.capW, capH: Z.capH, set: Z.shapeSet, lock: window.__wj.capLocked() }; });
    ok(z.shape === 'rect' && z.cap === '' && z.capW === '70' && z.capH === '54' && z.set === 'user' && z.lock, '목록에서 직사각을 고르면 모양·치수가 채워지고 잠긴다(원형 지름은 비워진다)');
    await page.click('[data-act="capuse"][data-id="' + ls[1].id + '"]'); await page.waitForTimeout(150);
    z = await page.evaluate(() => { const Z = window.__wj.S().size; return { shape: Z.shape, cap: Z.cap, capW: Z.capW, capH: Z.capH, lock: window.__wj.capLocked() }; });
    ok(z.shape === 'round' && z.cap === '52' && z.capW === '' && z.capH === '' && z.lock, '원형을 고르면 지름만 채워지고 가로·세로는 비워진다');
    ok(await page.evaluate(() => /둥근 원판\(원형\)이고 지름이 약 52mm/.test(window.__wj.capLine())), '지시문에도 원형 52mm가 들어간다');
    // 잠긴 상태에서 다른 방법으로 값이 바뀌면(예: 인식) 잠금은 저절로 풀린다
    await page.evaluate(() => { window.__wj.S().size.cap = '60'; });
    ok(await page.evaluate(() => window.__wj.capLocked() === false), '잠긴 값과 달라지면 잠금이 저절로 풀린다(잘못 잠긴 채로 쓰지 않는다)');
    // 새로 고침 뒤에도 목록이 남는다
    await page.waitForTimeout(600); await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForFunction(() => window.__wj); await page.waitForTimeout(900);
    ok((await page.locator('.capchips .cchip').count()) === 2, '새로 고침 뒤에도 받침 목록 2개가 남아 있다');
    // 지우기: 지금 고른 받침을 지우면 값은 남고 잠금만 풀린다
    await page.click('[data-act="capuse"][data-id="' + ls[0].id + '"]'); await page.waitForTimeout(150);
    await page.click('[data-act="capdel"][data-id="' + ls[0].id + '"]'); await page.waitForTimeout(200);
    z = await page.evaluate(() => ({ n: window.__wj.CAPS.length, pre: window.__wj.S().size.capPreset, capW: window.__wj.S().size.capW, lock: window.__wj.capLocked() }));
    ok(z.n === 1 && !z.pre && z.capW === '70' && !z.lock, '지우기: 목록에서 빠지고, 값은 남되 잠금은 풀린다');
    // 새 제품을 시작해도 목록은 그대로
    await page.click('#btnNew'); await page.click('#nwGo'); await page.waitForTimeout(300);
    ok((await page.evaluate(() => window.__wj.CAPS.length)) === 1 && !(await page.evaluate(() => window.__wj.S().size.capPreset)), '새 제품: 받침 목록은 남고, 이 제품의 고정은 비워진다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 레버 길이 비율 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2000);
    const rl = async (z) => { await setSize(page, z); return page.evaluate(() => window.__wj.ratioLine()); };
    let t = await rl({ shape: 'round', shapeSet: 'user', cap: '70', len: '150' });
    ok(/약 2\.1배/.test(t) && /받침 70mm, 중심~레버 끝 150mm/.test(t), '원형 70 · 총 길이 150(캡 중심부터): 약 2.1배 → "' + t.slice(0, 80) + '…"');
    t = await rl({ shape: 'round', shapeSet: 'user', cap: '70', len: '150', baseSet: 'user', base: 'lever' });
    ok(/약 2\.6배/.test(t) && /중심~레버 끝 185mm/.test(t), '캡 가장자리부터 150이면 중심에서는 185mm → 약 2.6배');
    t = await rl({ shape: 'round', shapeSet: 'user', cap: '70', len: '150', baseSet: 'user', base: 'full' });
    ok(/약 1\.6배/.test(t) && /중심~레버 끝 115mm/.test(t), '캡까지 포함해 150이면 중심에서는 115mm → 약 1.6배');
    t = await rl({ shape: 'rect', shapeSet: 'user', capW: '70', capH: '54', len: '150' });
    ok(/약 2\.1배/.test(t), '직사각형은 가로(레버가 뻗는 방향) 70 기준으로 계산한다');
    t = await rl({ shape: 'square', shapeSet: 'user', capW: '60', len: '150' });
    ok(/약 2\.5배/.test(t), '정사각형 한 변 60 · 150 → 약 2.5배');
    ok((await rl({ shape: 'round', shapeSet: 'user', cap: '70' })) === '' && (await rl({ shape: 'round', shapeSet: 'user', len: '150' })) === '', '총 길이나 받침 치수가 없으면 비율 문장을 만들지 않는다(숫자를 지어내지 않는다)');
    ok((await rl({ shape: 'round', cap: '70', len: '150' })) === '', '모양을 아직 정하지 않았으면(기본 원형) 비율 문장도 없다');
    ok((await rl({ shape: 'round', shapeSet: 'user', cap: '70', len: '30' })) === '', '레버가 받침보다 짧게 나오는 이상한 숫자는 쓰지 않는다');
    await setSize(page, { shape: 'round', shapeSet: 'user', cap: '70', len: '150' });
    const P = await prompts(page);
    ok(['hero', 'concept', 'base', 'color', 'sheet'].every((k) => P[k] && /레버 길이 비율\(사장님이 직접 확인한 값. 반드시 지킬 것\): 받침 중심에서 레버 끝까지의 거리는 받침 가로 길이\(레버가 뻗는 방향\)의 약 2\.1배/.test(P[k])), '지시문: 첫 화면·소개·기준 사진·칸별·시트 모두에 "약 2.1배"가 들어간다');
    ok(!/레버 길이 비율/.test(P.edit || ''), '문 색 편집 지시문에는 넣지 않는다(기준 사진에서 손잡이를 그대로 두므로)');
    const ck = await page.evaluate(() => ({ c: window.__wj.chkPrompt('color', '왼쪽'), e: window.__wj.chkPrompt('edit', '', null) }));
    ok(/레버 길이 비율이 달라요/.test(ck.c) && /약 2\.1배/.test(ck.c) && !/레버 길이 비율/.test(ck.e), '검수문: 색 칸 검수에는 비율 규칙이 있고, 편집 검수에는 없다');
    ok(await page.evaluate(() => /약 2\.1배/.test(window.__wj.capUiLine())), '화면 안내(기준 사진 칸)에도 비율이 나온다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3. 바뀌면 안 되는 것(고정 메모) */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2000);
    ok((await page.locator('textarea[data-k="fixed"]').count()) === 1, '1단계에 "바뀌면 안 되는 것" 칸이 있다');
    let P = await prompts(page);
    ok(Object.values(P).every((t) => !/바뀌면 안 되는 것\(사장님이/.test(t)), '비어 있으면 지시문에 넣지 않는다');
    await page.fill('textarea[data-k="fixed"]', '받침 두께 8mm\n받침과 레버 사이 이음 없음  /  나사는 안 보임');
    ok(await page.evaluate(() => window.__wj.S().fixed.includes('받침 두께 8mm')), '입력하면 작업에 저장된다');
    P = await prompts(page);
    const need = '바뀌면 안 되는 것(사장님이 직접 적은 고정 사항이라 반드시 지킬 것): 받침 두께 8mm 받침과 레버 사이 이음 없음 / 나사는 안 보임';
    ok(['hero', 'concept', 'base', 'color', 'sheet'].every((k) => P[k] && P[k].includes(need)), '지시문: 줄바꿈·겹친 공백을 정리해서 첫 화면·소개·기준 사진·칸별·시트에 넣는다');
    ok(!/바뀌면 안 되는 것\(사장님이/.test(P.edit || ''), '문 색 편집 지시문에는 넣지 않는다');
    const ck = await page.evaluate(() => window.__wj.chkPrompt('color', '왼쪽'));
    ok(/바뀌면 안 되는 것\(사장님이 직접 적은 고정 사항\): 받침 두께 8mm/.test(ck) && /고정 사항이 달라요/.test(ck), '검수문에도 들어가고 "고정 사항이 달라요" 규칙이 있다');
    await setSize(page, { shape: 'rect', shapeSet: 'user', capW: '70', capH: '54', len: '150' });
    ok(await page.evaluate(() => /고정 메모도 같이 가요/.test(window.__wj.capUiLine())), '화면 안내에 "고정 메모도 같이 가요"가 나온다');
    await page.fill('textarea[data-k="fixed"]', 'x'.repeat(600));
    ok(await page.evaluate(() => window.__wj.fixedLine().length === 400), '너무 길면 400자까지만 보낸다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 4. 레버 방향 잠금 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.evaluate(() => { const S = window.__wj.S(); S.lvDir = { id: S.src.id, dir: 'L', auto: true }; });
    await page.evaluate(() => document.querySelector('#gAll').click()); await page.waitForTimeout(150);
    ok(!(await page.evaluate(() => window.__wj.lvLocked())) && /레버 방향\(자동으로 읽은 값\)을 아직 확인하지 않았어요/.test(await page.textContent('#gWhy')), '자동으로 읽은 방향은 "확인 전": 만들기 전 확인 문구에 경고가 뜬다');
    await page.click('[data-act="gno"]');
    let P = await prompts(page);
    ok(!/레버 방향 고정/.test(P.hero + P.concept), '확인 전에는 지시문에 방향 고정 문장이 없다');
    ok((await page.evaluate(() => window.__wj.gateInfo())).soft.some((x) => /레버 방향을 아직 확인하지 않았어요/.test(x)), '저장 전 점검표에도 "방향 확인 전"이 나온다');
    ok(/자동으로 읽은 값이라 틀릴 수 있어요/.test(await page.textContent('#side')), '3단계 맨 위에 방향 확인 안내가 있다');
    await page.check('#lvLock'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => window.__wj.lvLocked() === true), '"실물과 맞아요 · 방향 잠금"에 체크하면 잠긴다');
    P = await prompts(page);
    const L = '레버 방향 고정(사장님이 실물과 비교해 확인한 값): 원본 사진에서 레버 끝은 받침에서 화면 왼쪽을 향합니다. 이 좌우 방향을 절대 바꾸거나 거울상으로 뒤집지 마세요.';
    ok(P.hero.includes(L) && P.concept.includes(L), '잠기면 첫 화면·소개 지시문에 방향 고정 문장이 들어간다(왼쪽)');
    ok(!P.base.includes('레버 방향 고정('), '문 설치 사진(기준·칸별)은 장면별 방향 규칙을 따라서 이 문장을 따로 넣지 않는다');
    await page.evaluate(() => document.querySelector('#gAll').click()); await page.waitForTimeout(150);
    ok(!/아직 확인하지 않았어요/.test(await page.textContent('#gWhy')), '잠기면 만들기 전 경고가 사라진다');
    await page.click('[data-act="gno"]');
    ok(!(await page.evaluate(() => window.__wj.gateInfo())).soft.some((x) => /레버 방향을 아직 확인/.test(x)), '점검표의 "방향 확인 전"도 사라진다');
    // 직접 바꾸면 곧바로 잠금 + 모든 칸 방향이 따라간다
    await page.selectOption('select[data-lv="1"]', 'R'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => { const S = window.__wj.S(); return S.lvDir.dir === 'R' && S.lvDir.locked === true && S.lvDir.auto === false && S.colors.items.every((it) => it.flip === true); }), '직접 오른쪽으로 바꾸면 곧바로 잠기고 모든 문 색상 칸의 방향이 오른쪽이 된다');
    P = await prompts(page);
    ok(P.hero.includes('화면 오른쪽을 향합니다'), '지시문의 방향 고정 문장도 오른쪽으로 바뀐다');
    await page.uncheck('#lvLock'); await page.waitForTimeout(100);
    ok(await page.evaluate(() => window.__wj.S().lvDir.locked === false && window.__wj.S().lvDir.auto === true && window.__wj.lvLocked() === false && window.__wj.S().lvDir.dir === 'R'), '체크를 풀면 "확인 전"으로 돌아간다(방향 값은 그대로)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 5. 좌우 뒤집기: 손으로 / 좌우 공용이면 자동으로 */
  {
    asym = true; resetSc();
    const { ctx, page, errors } = await open(browser);
    const pr = await prepare(page);
    await page.evaluate(() => { window.__log.length = 0; });
    const r0 = await run(page, ['월넛']);
    const px = (key) => page.evaluate(async (label) => {
      const w = window.__wj, S = w.S(), p = S.colors.items.find((it) => (it.label || '').includes(label)).photo, m = w.PH.get(p.id), bmp = await createImageBitmap(m.blob), c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const at = (fx) => { const d = g.getImageData(Math.round(bmp.width * fx), Math.round(bmp.height * .5), 1, 1).data; return [d[0], d[1], d[2]]; };
      return { left: at(.28), right: at(.72), flipped: !!p.flipped, chk: p.chk ? p.chk.ok : null, ai: !!p.ai };
    }, key);
    const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const a0 = await px('월넛');
    ok(r0.done === 1 && dist(a0.left, a0.right) > 60, '준비: 월넛 칸은 왼쪽으로 치우친 그림(왼쪽·오른쪽 색이 다르다)');
    // 손으로: 버튼
    const idx = await page.evaluate(() => window.__wj.S().colors.items.findIndex((it) => /월넛/.test(it.label)));
    await page.evaluate((i) => document.querySelector('[data-act="flipphoto"][data-k="colors.items.' + i + '.photo"]').click(), idx);
    await page.waitForFunction(() => window.__log.length >= 1, null, { timeout: 8000 }); await page.waitForTimeout(400);
    const a1 = await px('월넛');
    ok(dist(a1.left, a0.right) < 25 && dist(a1.right, a0.left) < 25 && a1.flipped && a1.ai, '"좌우 뒤집기" 단추: 그림이 좌우로 바뀌고(뒤집힘 표시), AI로 만든 사진이라는 표시는 그대로다');
    ok(a1.chk === true, '뒤집은 뒤 자동으로 다시 검수해서 결과가 붙는다(검수 요청 ' + (await calls(page, /"ok"/)) + '번)');
    // 자동: 좌우 공용 + 방향 반대 지적
    for (const flipOk of [true, false]) {
      resetCnt(); await page.evaluate((f) => { const w = window.__wj; w.G.cache.clear(); w.S().flipOk = f; w.S().colors.items.forEach((it) => { if (/월넛/.test(it.label)) it.photo = null; }); window.__checkRules = { '월넛': ['레버 방향이 반대예요', true] }; window.__checkCnt = {}; window.__log.length = 0; }, flipOk);
      const r = await run(page, ['월넛']);
      const wal = sc.reqs.filter((q) => /월넛/.test(q.key)), cks = await calls(page, /"ok"/);
      const a = await px('월넛');
      if (flipOk) ok(r.done === 1 && r.passN === 1 && r.holds.length === 0 && wal.length === 1 && cks === 2 && a.flipped, '좌우 공용: 방향이 반대라는 지적 → 구글에 다시 시키지 않고(요청 ' + wal.length + '번) 뒤집어서 다시 검수(' + cks + '번) → 합격');
      else ok(r.done === 1 && wal.length === 2 && !a.flipped, '좌우 공용을 안 켰으면: 구글에 다시 시킨다(요청 ' + wal.length + '번, 뒤집지 않음)');
    }
    resetCnt(); await page.evaluate(() => { const w = window.__wj; w.G.cache.clear(); w.S().flipOk = true; w.S().colors.items.forEach((it) => { if (/월넛/.test(it.label)) it.photo = null; }); window.__checkRules = { '월넛': ['문 색이 달라요', true] }; window.__checkCnt = {}; });
    await run(page, ['월넛']);
    ok(sc.reqs.filter((q) => /월넛/.test(q.key)).length === 2, '좌우 공용을 켜도 방향 문제가 아닌 지적(문 색)은 뒤집지 않고 다시 만든다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
    asym = false;
  }

  /* 6. 화면 모양 확인용(눈으로 볼 사진) */
  if (process.env.SHOT) {
    resetSc();
    const { ctx, page } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2000);
    await page.click('[data-act="capsel"][data-v="rect"]'); await page.fill('input[data-k="size.capW"]', '70'); await page.fill('input[data-k="size.capH"]', '54'); await page.fill('input[data-k="size.len"]', '150');
    await page.fill('#capName', '직사각 70×54'); await page.click('[data-act="capsave"]'); await page.waitForTimeout(300);
    await page.evaluate(() => { const S = window.__wj.S(); S.lvDir = { id: S.src.id, dir: 'L', auto: true }; });
    await page.fill('textarea[data-k="fixed"]', '받침 두께 8mm / 나사는 안 보임');
    for (const [sel, name] of [['.capchips', 'catalog_cap'], ['#lvLock', 'catalog_lv']]) {
      const h = await page.$(sel); const blk = (await h.evaluateHandle((e) => e.closest('.blk'))).asElement(); await blk.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await blk.screenshot({ path: B + '/w/shots/' + name + '.png' });
    }
    await ctx.close();
  }

  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
