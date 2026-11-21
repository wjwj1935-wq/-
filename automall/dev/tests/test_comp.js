/* 자동몰 상세페이지 제작기 v88 — 실물 합성 (구글·클로드는 가짜: 빈 문 사진만 돌려주고, 제품은 1단계 사진에서 오려 붙는지 확인) */
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
function doorPng(h) { const w = 96, ht = 96, bg = hsl(h, 45, 78), fg = hsl(h, 45, 20), raw = Buffer.alloc((w * 3 + 1) * ht);
  for (let y = 0; y < ht; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const c = (x < w * .2 && y < ht * .2) ? fg : bg; const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(ht, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const gray = () => png(96, 96, [128, 128, 128], [128, 128, 128]);

/* ---- 가짜 구글: 칸(장면) 이름과 몇 번째 요청인지에 따라 정해 둔 대로 답한다 ---- */
const sc = { rules: {}, counts: {}, reqs: [], inflight: 0, maxIn: 0, delay: 25, baseBytes: [], dupSrc: null };
function resetSc() { sc.rules = {}; sc.counts = {}; sc.reqs = []; sc.inflight = 0; sc.maxIn = 0; sc.baseBytes = []; sc.dupSrc = null; seedN = 0; }
function classify(text) {
  if (/빈 실내 문 사진을 만드세요/.test(text)) { const m = text.match(/장면: (.*?)\. 카메라가/); return { kind: 'door', key: m ? m[1] : '?' }; }
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
  else if (cl.kind === 'door') { seedN++; img = doorPng((seedN * 47) % 360); }
  else { img = fresh(); if (cl.kind === 'base') sc.baseBytes.push(img); }
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
const PHOTO_R = B + '/up/white_prod_R.png';
async function prepare(page, photo) {
  await page.locator('input[data-file="src"]').first().setInputFiles(photo || PHOTO); await page.waitForTimeout(2200);
  await page.evaluate(() => { const w = window.__wj, S = w.S(); S.lvDir = { id: S.src.id, dir: 'L', auto: false }; S.colors.gen = 'comp'; });
  await page.evaluate(() => window.__wj.gRun(window.__wj.jobs().filter((j) => j.kind === 'base'), { quiet: false }));
  await page.evaluate(() => document.querySelector('[data-act="basepick"][data-k="0"]').click());
  await page.waitForTimeout(300);
  return page.evaluate(() => ({ ok: window.__wj.S().baseOk, n: window.__wj.gList().filter((j) => j.kind === 'comp').length }));
}
const runC = (page, only, o) => page.evaluate(async ({ only, o }) => { const w = window.__wj; let l = w.gList().filter((j) => j.kind === 'comp'); if (only) l = l.filter((j) => only.some((k) => (w.S().colors.items[j.i].label || '').includes(k))); const r = await w.gRun(l, Object.assign({ quiet: false }, o || {})); return { done: r.done, total: r.total, stopped: r.stopped, fails: r.fails.length, holds: (r.holds || []).map((h) => ({ n: h.name, e: h.empty, w: h.why })), passN: r.passN, unN: r.unN }; }, { only, o });
/* 사진을 읽어 어두운 점의 무게중심(가운데 가로띠 안에서)과 어두운 점 수를 재요 */
const dark = (page, getter) => page.evaluate(async (g) => {
  const w = window.__wj, S = w.S(); const p = eval(g); const m = w.PH.get(p.id), bmp = await createImageBitmap(m.blob), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, sx = 0, tot = 0; const y0 = Math.round(c.height * .25), y1 = Math.round(c.height * .75);
  for (let y = y0; y < y1; y++) for (let xx = 0; xx < c.width; xx++) { const i = (y * c.width + xx) * 4, l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; tot++; if (l < 110) { n++; sx += xx; } }
  return { n, cx: n ? sx / n / c.width : .5, w: c.width, h: c.height, frac: n / tot };
}, getter);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 제품 오려내기 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    const q = await page.evaluate(async () => {
      const cut = await window.__wj.getCutout(), c = cut.cv, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let band = 0, white = 0, solid = 0, clear = 0;
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (a > 235) solid++; else if (a < 20) clear++; else { band++; if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++; } }
      return { w: c.width, h: c.height, dir: cut.dir, cover: cut.cover, band, white, solid, clear, corner: d[3] };
    });
    ok(q.dir === 'L' && q.w > q.h * 2.5, '레버가 왼쪽을 향한 사진: 방향 L, 가로로 긴 모양으로 오려진다(' + q.w + '×' + q.h + ')');
    ok(q.white === 0 && q.corner === 0 && q.solid > 1000 && q.cover > .03 && q.cover < .3, '배경은 투명(구석 투명), 가장자리에 흰 점이 없다(띠 ' + q.band + '점 중 흰 점 ' + q.white + ')');
    // 반대 방향 사진
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO_R); await page.waitForTimeout(2200);
    ok(await page.evaluate(async () => (await window.__wj.getCutout()).dir === 'R'), '레버가 오른쪽을 향한 사진: 방향 R');
    // 기울어진 사진(20도): 레버가 수평이 되게 돌려 준다 — 기울기 보정 전후 가로세로 비율을 비교
    const tilt = await page.evaluate(async () => {
      const w = window.__wj, bm0 = await createImageBitmap(w.PH.get(w.S().src.id).blob), c = document.createElement('canvas'); c.width = bm0.width * 1.2; c.height = bm0.width * 1.2; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.translate(c.width / 2, c.height / 2); g.rotate(20 * Math.PI / 180); g.drawImage(bm0, -bm0.width / 2, -bm0.height / 2);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192)); return btoa(s);
    });
    await page.locator('input[data-file="src"]').first().setInputFiles({ name: 'tilt.png', mimeType: 'image/png', buffer: Buffer.from(tilt, 'base64') }); await page.waitForTimeout(2200);
    const tr = await page.evaluate(async () => { const w = window.__wj, cut = await w.getCutout(), o = w.orientCut(cut, cut.dir, true), o2 = w.orientCut(cut, cut.dir, false); return { ang: Math.round(cut.ang * 180 / Math.PI), ar: o.width / o.height, ar0: o2.width / o2.height }; });
    ok(tr.ar > 3.2 && tr.ar0 < tr.ar * .8, '20도 기울어진 사진: 돌려 세우면 가로로 긴 모양(비율 ' + tr.ar.toFixed(1) + ')이 되고, 돌리지 않으면 ' + tr.ar0.toFixed(1) + '에 그친다');
    // 투명 PNG
    const tp = await page.evaluate(async () => {
      const w = window.__wj, bm0 = await createImageBitmap(w.PH.get(w.S().src.id).blob); const c = document.createElement('canvas'); c.width = 600; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#2a2d34'; g.fillRect(60, 100, 380, 90); g.beginPath(); g.arc(480, 145, 70, 0, 7); g.fill();
      const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192)); return btoa(s);
    });
    await page.locator('input[data-file="src"]').first().setInputFiles({ name: 'alpha.png', mimeType: 'image/png', buffer: Buffer.from(tp, 'base64') }); await page.waitForTimeout(2200);
    const ta = await page.evaluate(async () => { const cut = await window.__wj.getCutout(); return { w: cut.w, h: cut.h, dir: cut.dir, cover: cut.cover }; });
    ok(ta.dir === 'L' && ta.w > 480 && ta.w < 520 && ta.h > 130 && ta.h < 175, '투명 PNG(이미 배경이 빠진 사진): 투명한 곳을 그대로 쓴다(' + ta.w + '×' + ta.h + ', 방향 ' + ta.dir + ')');
    // 오려 낼 수 없는 사진(흰 종이 한 장)은 알기 쉬운 안내
    const blank = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 300); const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192)); return btoa(s); });
    await page.locator('input[data-file="src"]').first().setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: Buffer.from(blank, 'base64') }); await page.waitForTimeout(2200);
    const bad = await page.evaluate(async () => { try { await window.__wj.getCutout(); return null; } catch (e) { return e; } });
    ok(bad && bad.status === -1 && /오려 내지 못했어요/.test(bad.message), '제품이 안 보이는 사진: "제품만 오려 내지 못했어요…" 안내가 나온다');
    sc.reqs = [];
    await page.evaluate(() => { window.__wj.S().colors.gen = 'comp'; });
    const r = await page.evaluate(() => window.__wj.gRun(window.__wj.jobs().filter((j) => j.kind === 'base'), { quiet: false }).then((x) => ({ done: x.done, stopped: x.stopped })));
    ok(/오려 내지 못했어요/.test(r.stopped || '') && sc.reqs.length === 0, '구글에 돈을 쓰기 전에 멈춘다(구글 요청 ' + sc.reqs.length + '번)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 1b. 은색(밝고 부드러운) 제품 + 그림자 + 기울기 + 노이즈 사진 — 실제 사진에 가까운 가짜 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(B + '/up/real_like.jpg'); await page.waitForTimeout(2500);
    const r = await page.evaluate(async () => { const w = window.__wj, S = w.S(); const out = {}; for (const tol of [20, 40, 70]) { S.comp.tol = tol; const c = await w.getCutout(); out[tol] = { cover: c.cover, dir: c.dir, w: c.w, h: c.h }; } return out; });
    ok(r[40].dir === 'L' && r[40].cover > .1 && r[40].cover < .25 && r[40].w > 600, '은색 제품 사진: 오려진다(기본 민감도 40: 가로 ' + r[40].w + ', 방향 ' + r[40].dir + ', 차지하는 비율 ' + (r[40].cover * 100).toFixed(1) + '%)');
    ok(r[20].cover >= r[40].cover && r[40].cover >= r[70].cover && r[20].cover > r[70].cover, '민감도를 올릴수록 오려 내는 범위가 좁아진다(' + [20, 40, 70].map((k) => (r[k].cover * 100).toFixed(1) + '%').join(' ≥ ') + ') → 사진에 그림자가 많을 때 높여서 쓴다');
    await page.selectOption('#colorGen', 'comp'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => { const r = document.querySelector('input[data-comp="tol"]'); return !!r && +r.value === 70; }), '슬라이더 값이 사진을 바꾼 뒤에도 저장된 값(70)을 보여 준다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 방식 선택과 일 목록 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    const opt = await page.evaluate(() => [...document.querySelectorAll('#colorGen option')].map((o) => o.value));
    ok(opt.includes('comp') && opt.includes('base'), '3단계 "문 색상 사진 만드는 방식"에 실물 합성이 있다 → ' + opt.join(','));
    await page.selectOption('#colorGen', 'comp'); await page.waitForTimeout(200);
    const jb = await page.evaluate(() => window.__wj.jobs().map((j) => ({ k: j.kind, l: !!j.local, n: j.name, i: j.i })));
    ok(jb.filter((j) => j.l).map((j) => j.k).join() === 'hero,concept', '첫 화면·소개는 컴퓨터가 만든다(local)');
    const comps = jb.filter((j) => j.k === 'comp'), eds = jb.filter((j) => j.k === 'edit');
    ok(comps.length === 8 && eds.length === 2 && eds.some((j) => /화이트/.test(j.n)) && eds.some((j) => /사용 컷/.test(j.n)) && jb.some((j) => j.k === 'base'), '문 색상: 흰 문·사용 컷은 기준 사진 방식, 나머지 ' + comps.length + '칸은 빈 문 + 실물 합성, 기준 사진 1칸');
    ok((await page.locator('[data-act="cutprev"]').count()) === 1 && (await page.locator('[data-act="recompall"]').count()) === 1 && (await page.locator('input[data-comp]').count()) === 4, '실물 합성 설정(오려내기 확인·다시 합성·슬라이더 4개: 크기·위아래·그림자·배경 구분)이 보인다');
    ok(!(await page.evaluate(() => window.__wj.gList().some((j) => j.kind === 'comp'))), '기준 사진을 확정하기 전에는 문 색상 칸을 만들 일에 넣지 않는다(돈을 쓰지 않는다)');
    await page.click('[data-act="cutprev"]'); await page.waitForSelector('#cutPrev img', { timeout: 8000 });
    ok(/레버가 향한 쪽: 왼쪽/.test(await page.textContent('#cutPrev')), '"제품 오려내기 확인": 오려 낸 그림과 방향이 나온다');
    const P = await page.evaluate(() => { const w = window.__wj, o = {}; for (const j of w.jobs()) if (!o[j.kind]) o[j.kind] = w.promptOf(j); return o; });
    ok(/손잡이·문고리·레버·도어락·열쇠 구멍·경첩 같은 금속 부품이 전혀 없는 빈 실내 문/.test(P.base) && /가로 15%~85%, 세로 25%~75%/.test(P.comp) && !/받침 정보|제품의 특징|첨부한 사진 속/.test(P.base + P.comp), '지시문: 손잡이가 없는 빈 문, 가운데는 편평하게, 제품·받침 정보는 보내지 않는다');
    await page.selectOption('#colorGen', 'base'); await page.waitForTimeout(100);
    ok(!(await page.evaluate(() => window.__wj.jobs().some((j) => j.kind === 'comp' || j.local))) && (await page.locator('[data-act="cutprev"]').count()) === 0, '"기준 사진" 방식으로 돌아가면 예전과 똑같다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3. 기준 사진 후보: 빈 문만 시키고 제품은 합성 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.evaluate(() => { const S = window.__wj.S(); S.lvDir = { id: S.src.id, dir: 'L', auto: false }; S.colors.gen = 'comp'; window.__checkRules = { '흰색': ['문에 손잡이가 그려졌어요', true] }; });
    const r = await page.evaluate(() => window.__wj.gRun(window.__wj.jobs().filter((j) => j.kind === 'base'), { quiet: false }).then((x) => ({ done: x.done, stopped: x.stopped })));
    const doors = sc.reqs.filter((q) => q.kind === 'door');
    ok(r.done === 1 && !r.stopped, '후보를 만들었다');
    ok(doors.length === 4 && sc.maxIn === 1, '빈 문 요청: 후보 3장 + 손잡이가 그려졌다는 지적으로 1번 더 = ' + doors.length + '번, 한 장씩(동시 ' + sc.maxIn + '개)');
    const pb = JSON.parse(JSON.stringify(sc.reqs.map((q) => ({ n: q.text.length, m: q.model }))));
    const body0 = await page.evaluate(() => 1);
    ok(doors.every((q) => !/첨부한 사진/.test(q.text)) && doors.every((q) => q.model === 'gemini-2.5-flash-image'), '제품 사진은 보내지 않고, 값싼 기본 모델을 쓴다(정밀 모델 아님)');
    ok(/이전에 만든 이미지는 이렇게 달랐습니다: 문에 손잡이가 그려졌어요/.test(doors[1].text), '손잡이가 그려졌다는 지적이 다음 요청에 들어간다');
    const c0 = await page.evaluate(() => { const S = window.__wj.S(), c = S.baseCands[0]; return { n: S.baseCands.filter(Boolean).length, real: !!c.real, ai: !!c.ai, bg: !!(c.bg && window.__wj.PH.has(c.bg.id)) }; });
    ok(c0.n === 3 && c0.real && c0.ai && c0.bg, '후보 3장: 합성 사진(real)이고, 합성에 쓴 빈 문 사진(bg)도 같이 보관된다');
    const dk = await dark(page, 'S.baseCands[0]');
    ok(dk.frac > .03 && dk.cx > .5, '후보 사진 가운데에 어두운 제품이 올라가 있다(레버 왼쪽·받침 오른쪽이라 무게중심 ' + dk.cx.toFixed(2) + ' > 0.5, 어두운 점 ' + (dk.frac * 100).toFixed(1) + '%)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 4. 문 색상 칸: 빈 문 → 검사 → 합성, 방향 바꾸기, 손잡이가 그려졌을 때 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const pr = await prepare(page);
    ok(pr.ok && pr.n === 8, '준비: 기준 사진 확정, 합성할 칸 ' + pr.n + '개');
    sc.reqs = []; sc.maxIn = 0;
    await page.evaluate(() => { window.__log.length = 0; window.__checkRules = { '월넛': ['문에 손잡이가 그려졌어요', true] }; window.__checkCnt = {}; });
    const r = await runC(page);
    ok(r.done === 8 && r.passN === 8 && r.holds.length === 0 && !r.stopped, '8칸 모두 합성·검사 합격 → ' + JSON.stringify({ d: r.done, p: r.passN, h: r.holds.length }));
    const wal = sc.reqs.filter((q) => /월넛/.test(q.key));
    ok(wal.length === 2 && /문에 손잡이가 그려졌어요/.test(wal[1].text) && sc.reqs.length === 9 && sc.maxIn === 1, '월넛 칸: 첫 빈 문에 손잡이가 그려졌다는 지적 → 다시 요청(2번), 전체 요청 ' + sc.reqs.length + '번, 한 장씩');
    const t = await page.evaluate(() => { const w = window.__wj, S = w.S(), i = S.colors.items.findIndex((it) => /월넛/.test(it.label)), p = S.colors.items[i].photo; return { real: !!p.real, ai: !!p.ai, door: !!(p.chk && p.chk.door && p.chk.ok), bg: !!(p.bg && w.PH.has(p.bg.id)), hs: !!p.hs, hold: !!w.holdOf('colors.items.' + i + '.photo'), jpeg: /jpeg/.test(w.PH.get(p.id).blob.type) }; });
    ok(t.real && t.ai && t.door && t.bg && t.hs && !t.hold && t.jpeg, '월넛 칸: 합성 사진(real), 빈 문 검사 합격 표시, 빈 문 원본 보관, 같은 그림 점검용 지문, 보류 없음, JPG');
    const dkL = await dark(page, "S.colors.items.find((it) => /월넛/.test(it.label)).photo");
    ok(dkL.cx > .5 && dkL.frac > .03, '방향 왼쪽(레버가 왼쪽): 어두운 점의 무게중심이 오른쪽(받침)으로 쏠린다(' + dkL.cx.toFixed(2) + ')');
    // 방향 오른쪽으로 바꾸고 합성만 다시(무료)
    sc.reqs = [];
    await page.evaluate(() => { const S = window.__wj.S(); S.colors.items.find((it) => /월넛/.test(it.label)).flip = true; });
    await page.evaluate((k) => { }, 1);
    const ix = await page.evaluate(() => window.__wj.S().colors.items.findIndex((it) => /월넛/.test(it.label)));
    await page.evaluate((i) => document.querySelector('[data-act="recomp1"][data-k="colors.items.' + i + '.photo"]') && 0, ix);
    await page.evaluate(async () => { await window.__wj.recompAll(); });
    const dkR = await dark(page, "S.colors.items.find((it) => /월넛/.test(it.label)).photo");
    ok(sc.reqs.length === 0 && dkR.cx < .5 && Math.abs(dkR.cx - (1 - dkL.cx)) < .06, '방향을 오른쪽으로 바꾸고 다시 합성: 구글 요청 ' + sc.reqs.length + '번(무료), 제품이 좌우로 뒤집혀 무게중심이 왼쪽(' + dkR.cx.toFixed(2) + ')으로 간다');
    const gh = (await page.evaluate(() => window.__wj.gateInfo())).hard;
    ok(!gh.some((x) => /보류|같은 그림/.test(x)) && gh.every((x) => /문 색상 빈 칸 1개\(사용 컷\)/.test(x)), '저장 전 점검표: 합성 칸은 걸리지 않고(빈 문 검사로 검수된 걸로 봄), 아직 안 만든 사용 컷 1칸만 나온다 ' + JSON.stringify(gh));
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 5. 첫 화면·소개: 구글 없이 컴퓨터가 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.evaluate(() => { window.__wj.S().colors.gen = 'comp'; });
    const r = await page.evaluate(() => window.__wj.gRun(window.__wj.jobs().filter((j) => j.local), { quiet: false }).then((x) => ({ done: x.done, fails: x.fails.length, stopped: x.stopped })));
    ok(r.done === 2 && r.fails === 0 && sc.reqs.length === 0, '첫 화면·소개 2장이 만들어지고, 구글 요청은 0번이다');
    const im = await page.evaluate(async () => { const w = window.__wj, S = w.S(), out = {}; for (const [k, p] of [['hero', S.hero.photo], ['concept', S.concept.photo]]) { const m = w.PH.get(p.id), bmp = await createImageBitmap(m.blob), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(5, 5, 1, 1).data; out[k] = { w: bmp.width, h: bmp.height, real: !!p.real, ai: !!p.ai, corner: [d[0], d[1], d[2]] }; } return out; });
    ok(Math.abs(im.hero.w / im.hero.h - .8) < .01 && Math.abs(im.concept.w / im.concept.h - 1.5) < .01, '첫 화면은 4:5, 소개는 3:2');
    ok(im.hero.real && !im.hero.ai && im.concept.real && !im.concept.ai, '실제 제품 합성이라 "AI로 만든 사진"이 아니다(ai 표시 없음)');
    ok(im.hero.corner[2] > im.hero.corner[0] && im.hero.corner.every((v) => v < 110), '배경은 어두운 남색(' + im.hero.corner.join(',') + ')');
    const dh = await dark(page, 'S.hero.photo');
    ok(dh.frac > .01, '제품이 그림 안에 올라가 있다');
    // 새 제품 사진으로 바꾸면 합성 사진도 지워진다
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO_R); await page.waitForTimeout(2500);
    ok(await page.evaluate(() => { const S = window.__wj.S(); return !S.hero.photo && !S.concept.photo; }), '제품 사진을 바꾸면 이전 제품으로 만든 합성 사진(첫 화면·소개)도 지워진다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 6. 크기·그림자 슬라이더 + 다시 합성(무료) + 새로 고침 뒤에도 */
  {
    resetSc();
    const ctx0 = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const { ctx, page, errors } = await open(browser, { ctx: ctx0 });
    await prepare(page); await runC(page, ['월넛']); sc.reqs = [];
    const d0 = await dark(page, "S.colors.items.find((it) => /월넛/.test(it.label)).photo");
    await page.evaluate(() => { const r = document.querySelector('input[data-comp="scale"]'); r.value = '50'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    ok(await page.evaluate(() => window.__wj.S().comp.scale === 50) && (await page.textContent('[data-compv="scale"]')) === '50', '크기 슬라이더: 값이 저장되고 숫자가 따라 바뀐다');
    await page.click('[data-act="recompall"]'); await page.waitForFunction(() => /다시 합성했어요/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
    const d1 = await dark(page, "S.colors.items.find((it) => /월넛/.test(it.label)).photo");
    ok(sc.reqs.length === 0 && d1.n < d0.n * .6 && d1.n > d0.n * .3, '다시 합성: 구글 요청 0번(무료), 제품이 작아진다(어두운 점 ' + d0.n + ' → ' + d1.n + ')');
    ok(await page.evaluate(() => { const S = window.__wj.S(), p = S.colors.items.find((it) => /월넛/.test(it.label)).photo; return p.real && p.chk && p.chk.door && p.chk.ok && !!p.bg; }), '다시 합성해도 합성 표시·빈 문 검사 합격·빈 문 원본이 그대로 남는다');
    await page.waitForTimeout(700); await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForFunction(() => window.__wj); await page.waitForTimeout(1200);
    ok(await page.evaluate(() => { const w = window.__wj, S = w.S(), p = S.colors.items.find((it) => /월넛/.test(it.label)).photo; return !!p && !!p.bg && w.PH.has(p.bg.id) && p.real && S.comp.scale === 50; }), '새로 고침 뒤에도 합성 사진·빈 문 원본·슬라이더 값이 남아 있다');
    const n = await page.evaluate(() => window.__wj.recompAll());
    ok(n >= 1, '새로 고침 뒤에도 다시 합성이 된다(' + n + '장)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 7. 사용 컷(손)은 기준 사진을 편집하는 예전 방식 그대로 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await prepare(page); sc.reqs = [];
    const r = await page.evaluate(() => { const w = window.__wj, l = w.gList().filter((j) => j.kind === 'edit'); return window.__wj.gRun(l, { quiet: false }).then((x) => ({ n: l.length, done: x.done, holds: x.holds.length })); });
    const hand = sc.reqs.filter((q) => q.kind === 'edit');
    ok(r.n === 1 && r.done === 1 && hand.length === 1 && /첨부한 사진\(사진 1\)을 편집하세요/.test(hand[0].text), '사용 컷: 확정한 기준 사진(합성 사진)을 편집하는 요청 1번으로 만든다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
