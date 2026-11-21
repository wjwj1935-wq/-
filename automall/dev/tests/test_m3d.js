/* 자동몰 상세페이지 제작기 v89 — 3D 모형(실험): 클로드가 모형 값을 추정 → 앱이 렌더링 → 구글 참고 사진에 같이 보냄 (구글·클로드는 가짜) */
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
const gray = () => png(96, 96, [128, 128, 128], [128, 128, 128]);

/* ---- 가짜 구글: 칸(장면) 이름과 몇 번째 요청인지에 따라 정해 둔 대로 답한다 ---- */
const sc = { rules: {}, counts: {}, reqs: [], inflight: 0, maxIn: 0, delay: 25, baseBytes: [], dupSrc: null };
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
  sc.reqs.push({ kind: cl.kind, key: cl.key, nth, model, act, text, t: Date.now(), imgs: parts.filter((p) => p.inline_data || p.inlineData).length });
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
  else { img = fresh(); if (cl.kind === 'base') sc.baseBytes.push(img); }
  return json(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: img.toString('base64') } }] }, finishReason: 'STOP' }] });
}

/* ---- 가짜 클로드: 검수는 칸(장면)별로 정해 둔 대로 합격/불합격 ---- */
const CLAUDE = () => {
  window.__log = []; window.__checkRules = {}; window.__checkCnt = {};
  window.claude = { use: async (n) => n === 'sample' ? { limits: async () => ({ images: { maxCount: 3 } }), json: async (p, o) => {
    window.__log.push({ kind: /3D 모형으로 나타낼 수 있게/.test(p) ? 'm3d' : /3D 모형으로 추정해 같은 방향에서/.test(p) ? 'm3dr' : 'x', p, n: o && o.images ? [].concat(o.images).length : 0, tier: o && o.modelTier });
    if (/3D 모형으로 나타낼 수 있게/.test(p)) { if (window.__m3dErr) throw { code: 'upstream_error' }; return window.__m3dRaw; }
    if (/3D 모형으로 추정해 같은 방향에서/.test(p)) { const q = (window.__m3dRef || []).shift(); return q || { score: 9, patch: {}, notes: [] }; }
    const kind = /가장 작은 사각 영역/.test(p) ? 'plate' : /"spec"/.test(p) ? 'spec' : /"rosetteShape"/.test(p) ? 'shape' : /"ok"/.test(p) ? 'check' : 'other';
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

const RAW = { finish: { color: '#6a6e76', metal: .9, gloss: .7 }, plate: { shape: 'round', w: 40, h: 40, t: 8 }, collar: { d: 20, h: 6 }, lever: { len: 120, lift: 20, root: 6, profile: [{ x: 0, w: 20, h: 15 }, { x: .5, w: 15, h: 12 }, { x: 1, w: 12, h: 10 }] }, notes: ['두께는 사진에서 안 보여 추정했어요'] };
const sizeSet = (page, z) => page.evaluate((z) => { const S = window.__wj.S(); S.size = Object.assign({ len: '', wid: '', cap: '', capW: '', capH: '', ref: 'card', extra: [] }, z); }, z);
const logs = (page) => page.evaluate(() => window.__log.filter((l) => l.kind === 'm3d' || l.kind === 'm3dr'));
const waitBuilt = async (page) => { await page.waitForFunction(() => !window.__wj.M3D.busy && window.__wj.S().model3d, null, { timeout: 90000 }); await page.waitForTimeout(300); };
/* 어두운 제품이 문(베이지)과 구분되는 점들의 바깥 네모와 열별 높이 */
const silhouette = (page, dataUrlGetter) => page.evaluate(async (g) => {
  const w = window.__wj, S = w.S(); const v = eval(g); const m = w.PH.get(v.id), bmp = await createImageBitmap(m.blob), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, cols = new Array(c.width).fill(0); let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) { const i = (yy * c.width + xx) * 4, l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; if (l < 95) { cols[xx]++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, x0, x1, cols, W: c.width };
}, dataUrlGetter);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 값 다듬기(엉터리 값도 안전하게) */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const r = await page.evaluate(() => {
      const w = window.__wj, g = w.m3dNorm({ finish: { color: 'red', metal: 5, gloss: -1 }, plate: { shape: 'triangle', w: 'abc', h: 9999, t: 99 }, collar: { d: 1, h: 999 }, lever: { len: 9999, lift: 0, root: 400, corner: 99, tipRound: -3, droop: 99, profile: [{ x: .8, w: 18, h: 11 }, { x: 'a', w: 10, h: 10 }, { x: .2, w: 99, h: 1 }, null, { x: 5, w: 14, h: 9 }] } }, {});
      const e = w.m3dNorm(null, {}), L = w.m3dNorm({ plate: { w: 30, h: 30 }, lever: { len: 100, profile: [{ x: 0, w: 30, h: 12 }, { x: 1, w: 10, h: 8 }] } }, { len: 150, shape: 'rect', w: 70, h: 54, wid: 24 });
      const Lr = w.m3dNorm({ plate: { w: 30, h: 30 } }, { shape: 'round', w: 56, h: 56 }), M = w.m3dMerge(L, { finish: { color: '#112233' }, lever: { profile: [{ x: 0, w: 10, h: 10 }, { x: 1, w: 8, h: 8 }] } });
      return { g, e, L, Lr, M, fin: w.m3dNorm(M, {}) };
    });
    ok(/^#[0-9a-f]{6}$/i.test(r.g.finish.color) && r.g.finish.metal === 1 && r.g.finish.gloss === 0 && r.g.plate.shape === 'round' && r.g.plate.w >= 20 && r.g.plate.h === 160 && r.g.plate.t === 30, '엉터리 값(색 이름·범위 밖·이상한 모양)은 안전한 값으로 바뀐다');
    ok(r.g.lever.len === 420 && r.g.lever.lift === 6 && r.g.lever.root <= r.g.lever.len - 20 && r.g.lever.droop === 40 && r.g.lever.tipRound >= .5 && r.g.collar.d === 8 && r.g.collar.h === 50, '레버 길이·높이·목 값도 범위 안으로 들어온다');
    const px = r.g.lever.profile;
    ok(px.length === 3 && px[0].x === 0 && px[px.length - 1].x === 1 && px.every((q, i) => i === 0 || q.x >= px[i - 1].x) && px.every((q) => q.w >= 4 && q.w <= 60 && q.h >= 3 && q.h <= 40), '굵기 목록: 깨진 항목은 버리고, 순서대로 정렬하고, 처음과 끝을 0과 1로 맞춘다 ' + JSON.stringify(px));
    ok(r.e.lever.profile.length >= 2 && r.e.plate.shape === 'round' && r.e.lever.len === 150, '빈 값이면 기본 모형이 나온다');
    ok(r.L.lever.len === 150 && r.L.plate.shape === 'rect' && r.L.plate.w === 70 && r.L.plate.h === 54 && Math.abs(Math.max(...r.L.lever.profile.map((q) => q.w)) - 24) < .01, '사장님이 적은 치수(길이·받침·폭)가 추정값보다 우선한다');
    ok(r.Lr.plate.w === 56 && r.Lr.plate.h === 56, '원형 받침은 가로·세로가 같은 지름으로 맞춘다');
    ok(r.M.finish.color === '#112233' && r.M.lever.profile.length === 2 && r.M.plate.w === 70, '고칠 값(patch): 바꾼 것만 바뀌고 나머지는 그대로, 굵기 목록은 통째로 바뀐다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 렌더링이 모형 크기·방향을 그대로 보여 주는지 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const meas = (len, dir, view) => page.evaluate(async ({ len, dir, view }) => {
      const w = window.__wj, M = w.m3dNorm({ finish: { color: '#101114', metal: .25, gloss: .15 }, plate: { shape: 'round', w: 50, h: 50, t: 8 }, lever: { len, lift: 20, profile: [{ x: 0, w: 16, h: 12 }, { x: 1, w: 16, h: 12 }] } }, {}), b = await w.m3dRender(M, view, dir, { size: 240 });
      const bmp = await createImageBitmap(b), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, cols = new Array(c.width).fill(0); let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4, l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; if (l < 120) { cols[x]++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
      return { w: x1 - x0 + 1, h: y1 - y0 + 1, x0, x1, cols, W: c.width };
    }, { len, dir, view });
    const a = await meas(150, 'R', 'front'), b = await meas(100, 'R', 'front');
    ok(Math.abs(a.w / a.h - 3.5) < .45 && Math.abs(b.w / b.h - 2.5) < .35, '정면 렌더링: (레버 길이+받침 반지름) ÷ 받침 지름이 치수대로 나온다 → 150mm: ' + (a.w / a.h).toFixed(2) + '(3.5), 100mm: ' + (b.w / b.h).toFixed(2) + '(2.5)');
    const plateAt = (m, from) => { const n = Math.round(m.w * .12), seg = from === 'left' ? m.cols.slice(m.x0, m.x0 + n) : m.cols.slice(m.x1 - n + 1, m.x1 + 1); return seg.reduce((s, v) => s + v, 0) / seg.length; };
    ok(plateAt(a, 'left') > plateAt(a, 'right') * 1.8, '방향 오른쪽: 높이가 큰 받침이 왼쪽 끝에, 가는 레버 끝이 오른쪽 끝에 있다');
    const l = await meas(150, 'L', 'front');
    ok(plateAt(l, 'right') > plateAt(l, 'left') * 1.8, '방향 왼쪽: 받침이 오른쪽 끝에 있고 레버가 왼쪽으로 뻗는다(거울상이 아니라 모형을 돌린 것)');
    const sd = await meas(150, 'R', 'side');
    ok(sd.w / sd.h > 4 && sd.h > 6, '옆 렌더링: 문에서 납작하게 뜬 레버(가로로 아주 긴 모양)가 보인다(' + (sd.w / sd.h).toFixed(1) + ')');
    const t1 = await meas(150, 'R', 'tq1'), t2 = await meas(150, 'R', 'tq2');
    ok(t1.h > a.h * .8 && t2.h > a.h * .8 && Math.abs(t1.w - t2.w) < t1.w * .5, '비스듬한 두 렌더링에도 제품이 크게 들어온다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3. 만들기 흐름: 클로드 추정 → 렌더링 → 사진과 비교해 고침 → 저장 */
  {
    resetSc();
    const ctx0 = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const { ctx, page, errors } = await open(browser, { ctx: ctx0 });
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await sizeSet(page, { shape: 'round', shapeSet: 'user', cap: '56', len: '150', wid: '22' });
    await page.evaluate((raw) => { window.__m3dRaw = raw; window.__m3dRef = [{ score: 5, patch: { finish: { color: '#222222' }, lever: { tipRound: 3 } }, notes: ['색을 더 어둡게'] }, { score: 9, patch: {}, notes: [] }]; const S = window.__wj.S(); S.lvDir = { id: S.src.id, dir: 'L', auto: false }; }, RAW);
    ok(/클로드로 3D 모형 만들기/.test(await page.textContent('#side')) && /실험/.test(await page.textContent('#side')), '1단계에 "클로드로 3D 모형 만들기"(실험) 칸이 있다');
    await page.click('[data-act="m3dbuild"]'); await waitBuilt(page);
    const lg = await logs(page), bl = lg.filter((l) => l.kind === 'm3d'), rf = lg.filter((l) => l.kind === 'm3dr');
    ok(bl.length === 1 && rf.length === 2 && bl[0].n === 1 && rf.every((l) => l.n === 2) && bl[0].tier === 'default', '클로드 요청: 모형 추정 1번(사진 1장) + 사진과 비교 2번(사진 2장씩) · 정확한 쪽 모델 사용');
    ok(/받침 중심에서 레버 끝까지 150mm/.test(bl[0].p) && /받침 원형 지름 56mm/.test(bl[0].p) && /레버의 가장 넓은 폭 22mm/.test(bl[0].p), '사장님이 적은 치수(길이 150·받침 지름 56·폭 22)가 요청에 "확실한 치수"로 들어간다');
    ok(/바꾸지 말 확실한 치수: 받침 중심에서 레버 끝까지 150mm/.test(rf[0].p), '비교 요청에도 바꾸지 말 치수가 들어간다');
    const m = await page.evaluate(() => { const S = window.__wj.S(), m = S.model3d, w = window.__wj; return { p: m.p, score: m.score, notes: m.notes, dir: m.dir, n: m.views.length, ok: m.views.every((v) => v && w.PH.has(v.id)), id: m.id === S.src.id, w: m.views[0].w }; });
    ok(m.p.plate.w === 56 && m.p.plate.h === 56 && m.p.lever.len === 150 && Math.abs(Math.max(...m.p.lever.profile.map((q) => q.w)) - 22) < .01, '모형은 클로드 추정(받침 40·길이 120)이 아니라 사장님 치수(56·150·폭 22)로 맞춰진다');
    ok(m.p.finish.color === '#222222' && m.p.lever.tipRound === 3 && m.score === 9, '첫 비교(5점)에서 받은 고침(색·끝 둥글기)이 적용되고, 둘째 비교(9점)에서 끝난다');
    ok(m.notes.some((x) => /두께는 사진에서 안 보여/.test(x)) && m.notes.some((x) => /고침: 색을 더 어둡게/.test(x)) && m.dir === 'L' && m.n === 4 && m.ok && m.id && m.w === 288, '추정한 것·고친 이유가 기록되고, 방향(L)대로 4장이 렌더링돼 저장된다');
    ok((await page.locator('.m3dv img').count()) === 4 && /점수 9\/10/.test(await page.textContent('#side')) && /구글에 보내요/.test(await page.textContent('#side')), '화면: 렌더링 4장, 점수, "3장을 구글에 보내요"가 나온다');
    // 새로 고침 뒤에도
    await page.waitForTimeout(700); await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForFunction(() => window.__wj); await page.waitForTimeout(1200);
    ok(await page.evaluate(() => { const w = window.__wj, m = w.S().model3d; return !!m && m.views.every((v) => v && w.PH.has(v.id)) && !!w.model3dFor(); }), '새로 고침 뒤에도 3D 모형과 렌더링이 남아 있다');
    // 첫 비교에서 9점이면 한 번만 비교
    await page.evaluate((raw) => { window.__log.length = 0; window.__m3dRaw = raw; window.__m3dRef = [{ score: 10, patch: { finish: { color: '#ffffff' } }, notes: [] }]; }, RAW);
    await page.click('[data-act="m3dbuild"]'); await page.waitForFunction(() => !window.__wj.M3D.busy, null, { timeout: 90000 }); await page.waitForTimeout(300);
    ok((await logs(page)).filter((l) => l.kind === 'm3dr').length === 1 && await page.evaluate(() => window.__wj.S().model3d.p.finish.color !== '#ffffff'), '첫 비교가 9점 이상이면 고치지 않고 한 번만 비교한다');
    // 클로드가 실패하면 기존 모형을 건드리지 않고 알려 준다
    await page.evaluate(() => { window.__m3dErr = true; window.__log.length = 0; });
    const before = await page.evaluate(() => window.__wj.S().model3d.views[0].id);
    await page.click('[data-act="m3dbuild"]'); await page.waitForFunction(() => !window.__wj.M3D.busy, null, { timeout: 30000 }); await page.waitForTimeout(300);
    ok(await page.evaluate((b) => window.__wj.S().model3d.views[0].id === b && /연결이 잠깐 끊겼어요|만들지 못했어요/.test(document.querySelector('#toast').textContent), before), '클로드가 실패하면 만들어 둔 모형은 그대로고, 알기 쉬운 안내가 뜬다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 4. 구글로 가는 참고 사진에 3장이 들어가는지 · 켜고 끄기 · 다른 사진이면 무시 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.evaluate((raw) => { window.__m3dRaw = raw; window.__m3dRef = []; const S = window.__wj.S(); S.lvDir = { id: S.src.id, dir: 'R', auto: false }; }, RAW);
    const ref0 = await page.evaluate(async () => { const v = await window.__wj.buildRefs(); return { n: v.imgs.length, note: v.note }; });
    ok(!/3D 모형/.test(ref0.note), '모형이 없으면 예전과 같다(참고 사진 ' + ref0.n + '장)');
    await page.click('[data-act="m3dbuild"]'); await waitBuilt(page);
    const ref1 = await page.evaluate(async () => { const v = await window.__wj.buildRefs(); return { n: v.imgs.length, note: v.note }; });
    ok(ref1.n === ref0.n + 3 && /3D 모형\(사진과 치수로 추정\)으로 만들어 정면·비스듬히·옆에서 렌더링한 구조 참고도/.test(ref1.note) && /색·질감·무늬·광택은 따르지 말고 첨부 사진 1을 따르세요/.test(ref1.note) && /사진 1이 맞습니다/.test(ref1.note), '모형이 있으면 참고 사진이 3장 늘고, "구조만 참고·색 질감은 사진 1을 따라라·다르면 사진 1이 맞다"고 알려 준다(' + ref0.n + ' → ' + ref1.n + ')');
    // 실제 구글 요청에 들어가는지
    const hero = (page) => page.evaluate(() => window.__wj.gRun(window.__wj.jobs().filter((j) => j.kind === 'hero'), { quiet: true, careful: false }).then((x) => x.done));
    sc.reqs = []; await page.evaluate(() => window.__wj.G.cache.clear()); await hero(page);
    const withM = sc.reqs.filter((q) => q.kind === 'hero')[0];
    await page.click('#m3dUse'); await page.waitForTimeout(100);
    ok(await page.evaluate(() => window.__wj.S().model3dUse === false && window.__wj.model3dFor() === null), '"3D 구조 참고도를 같이 보내요"를 끄면 쓰지 않는다');
    await page.evaluate(() => { window.__wj.S().hero.photo = null; window.__wj.G.cache.clear(); }); await hero(page);
    const noM = sc.reqs.filter((q) => q.kind === 'hero')[1];
    ok(withM && noM && withM.imgs === noM.imgs + 3, '구글 요청에 들어가는 사진 수: 켰을 때 ' + (withM && withM.imgs) + '장, 껐을 때 ' + (noM && noM.imgs) + '장(3장 차이)');
    await page.click('#m3dUse');
    // 다른 제품 사진으로 바꾸면 이전 모형은 지워진다
    await page.locator('input[data-file="src"]').first().setInputFiles(B + '/up/white_prod_R.png'); await page.waitForTimeout(2500);
    ok(await page.evaluate(() => window.__wj.S().model3d === null && window.__wj.model3dFor() === null), '제품 사진을 바꾸면 이전 제품의 3D 모형은 지워진다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 5. 값을 고쳐서 무료로 다시 렌더링 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.evaluate((raw) => { window.__m3dRaw = raw; window.__m3dRef = []; const S = window.__wj.S(); S.lvDir = { id: S.src.id, dir: 'R', auto: false }; }, RAW);
    await page.click('[data-act="m3dbuild"]'); await waitBuilt(page);
    await page.evaluate(() => { window.__log.length = 0; });
    const before = await page.evaluate(() => window.__wj.S().model3d.views.map((v) => v.id));
    await page.click('summary.aitag:has-text("모형 값 보기")');
    const js = JSON.parse(await page.inputValue('#m3dJson'));
    ok(js.plate && js.lever && Array.isArray(js.lever.profile) && js.finish, '"모형 값 보기": 숫자 값(JSON)이 보인다');
    js.finish.color = '#aa3322'; js.lever.profile = [{ x: 0, w: 30, h: 20 }, { x: 1, w: 8, h: 6 }];
    await page.fill('#m3dJson', JSON.stringify(js));
    await page.click('[data-act="m3drerender"]'); await page.waitForFunction(() => !window.__wj.M3D.busy, null, { timeout: 60000 }); await page.waitForTimeout(300);
    const af = await page.evaluate(() => { const m = window.__wj.S().model3d; return { c: m.p.finish.color, pr: m.p.lever.profile.length, ids: m.views.map((v) => v.id) }; });
    ok(af.c === '#aa3322' && af.pr === 2 && af.ids.every((x, i) => x !== before[i]), '고친 값으로 4장이 새로 렌더링된다');
    ok((await logs(page)).length === 0, '다시 렌더링은 클로드를 부르지 않는다(무료)');
    await page.click('summary.aitag:has-text("모형 값 보기")');
    await page.fill('#m3dJson', '{ 깨진 글'); await page.click('[data-act="m3drerender"]'); await page.waitForTimeout(200);
    ok(/값을 읽지 못했어요/.test(await page.textContent('#toast')) && await page.evaluate(() => window.__wj.S().model3d.p.finish.color === '#aa3322'), '깨진 글을 넣으면 안내만 하고 모형은 그대로다');
    await page.click('[data-act="m3dclear"]'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => window.__wj.S().model3d === null) && /클로드로 3D 모형 만들기/.test(await page.textContent('#side')), '"모형 지우기"');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
