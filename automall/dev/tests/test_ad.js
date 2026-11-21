/* 자동몰 상세페이지 제작기 v91 — 쇼츠 광고 영상 모드 (사진은 직접 만든 가짜 문 사진) */
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
  else { img = fresh(); if (cl.kind === 'base') sc.baseBytes.push(img); }
  return json(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: img.toString('base64') } }] }, finishReason: 'STOP' }] });
}

/* ---- 가짜 클로드: 검수는 칸(장면)별로 정해 둔 대로 합격/불합격 ---- */
const CLAUDE = () => {
  window.__log = []; window.__checkRules = {}; window.__checkCnt = {};
  window.claude = { use: async (n) => n === 'sample' ? { limits: async () => ({ images: { maxCount: 3 } }), json: async (p, o) => {
    if (/글이 사진과 맞는지 점검해 주세요/.test(p)) { window.__log.push({ kind: 'pre', p, n: o && o.images ? [].concat(o.images).length : 0, tier: o && o.modelTier }); if (window.__preErr) throw { code: 'upstream_error' }; return window.__preRaw || {}; }
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

const items = (page) => page.evaluate(() => window.__wj.preItems('video').map((x) => ({ l: x.lvl, id: x.id, t: x.text })));
const COLS = [['#f4f1ea', '화이트 도어'], ['#6d4a2f', '월넛 우드 도어'], ['#c9cdd2', '라이트 그레이 도어'], ['#1c1d20', '블랙 도어'], ['#e7dcc4', '아이보리 도어'], ['#b99a6b', '오크 도어'], ['#8a5b3a', '체리 도어'], ['#d9d0bf', '베이지 도어']];
/* 문 사진 n장을 가짜로 넣는다(색 바탕 + 가운데 어두운 막대) */
const putDoors = (page, n, ai) => page.evaluate(async ({ n, ai, COLS }) => {
  const w = window.__wj, S = w.S();
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d'); g.fillStyle = COLS[i][0]; g.fillRect(0, 0, 400, 400); g.fillStyle = '#2a2d34'; g.fillRect(70, 170, 260, 60); g.beginPath(); g.arc(300, 200, 50, 0, 7); g.fill();
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', .9)); S.colors.items[i].label = COLS[i][1];
    await w.setPhoto('colors.items.' + i + '.photo', b, { ai: !!ai });
  }
  return S.colors.items.filter((it) => w.PH.has(it.photo && it.photo.id)).length;
}, { n, ai, COLS });
const frame = (page, t, opt) => page.evaluate(async ({ t, opt }) => {
  const w = window.__wj; if (opt && opt.hook != null) w.VD.adHook = opt.hook; const A = await w.adLoad(), m = { bright: 112 }, plan = w.adPlan(A, 60 / 112), draw = w.adDrawer(A, plan), cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920; const g = cv.getContext('2d');
  const tt = Math.min(t < 0 ? plan.total + t : t, plan.total - .01); draw(g, tt); const d = g.getImageData(0, 0, 1080, 1920).data;
  const reg = (x0, y0, x1, y1) => { let r = 0, gg = 0, b = 0, n = 0, wh = 0; for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) { const i = (y * 1080 + x) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) wh++; } return { r: r / n, g: gg / n, b: b / n, l: (.299 * r + .587 * gg + .114 * b) / n, white: wh / n }; };
  return { total: plan.total, scene: (plan.list.find((s) => tt >= s.t0 && tt < s.t1) || {}).kind, ai: A.doors.map((d) => d.ai).join(), top: reg(0, 170, 1080, 420), mid: reg(200, 700, 880, 1300), bottom: reg(0, 1620, 1080, 1900), tag: reg(90, 1448, 420, 1492), tagArr: (() => { const a = []; for (let y = 1448; y < 1492; y += 3) for (let x = 90; x < 420; x += 3) { const i = (y * 1080 + x) * 4; a.push(.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]); } return a; })(), all: reg(0, 0, 1080, 1920) };
}, { t, opt });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 장면 시간표(순수 계산) */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const P = await page.evaluate(() => {
      const w = window.__wj, mk = (n, hand) => Array.from({ length: n }, (_, i) => ({ label: i === 0 ? '화이트 도어' : i === 1 ? '월넛 우드 도어' : '색' + i, hand: !!(hand && i === n - 1), ai: true, bmp: {} }));
      const full = { doors: mk(6, true), zoom: [{}, {}, {}], rows: [[1, 2], [3, 4], [5, 6], [7, 8]], hero: {}, concept: {}, src: {} };
      const a = w.adPlan(full, 60 / 112), b = w.adPlan(full, 0), c = w.adPlan(Object.assign({}, full, { doors: mk(3, false) }), 60 / 112), d = w.adPlan({ doors: [], zoom: [{}], rows: [], hero: { bmp: {} }, concept: { bmp: {} }, src: { bmp: {} } }, 0), e = w.adPlan({ doors: [], zoom: [], rows: [[1, 2]], hero: null, concept: null, src: { bmp: {} } }, 0);
      const big = w.adPlan(Object.assign({}, full, { doors: mk(8, false) }), 60 / 112);
      return { a: a.list.map((s) => [s.kind, s.t1 - s.t0, s.img && s.img.label]), at: a.total, b: b.list.map((s) => s.kind + ':' + (s.t1 - s.t0).toFixed(2)), bt: b.total, c: c.list.map((s) => [s.kind, s.img && s.img.label]), d: d.list.map((s) => s.kind), e: e.list.map((s) => s.kind), bigT: big.total, nd: big.list.filter((s) => s.kind === 'door').length, estNone: (() => { const S = w.S(); return w.adEst(); })() };
    });
    const beat = 60 / 112, mult = (x) => Math.abs(x / beat - Math.round(x / beat)) < 1e-6;
    ok(P.a.map((s) => s[0]).join(',') === 'hook,door,door,door,door,door,door,zoom,zoom,zoom,rows,cta' || P.a.map((s) => s[0]).join(',').startsWith('hook,door'), '순서: 훅 → 문 몽타주 → 확대 → 규격 → 마지막 문구 → ' + P.a.map((s) => s[0]).join(','));
    ok(P.a[0][2] === '월넛 우드 도어' && P.a.filter((s) => s[0] === 'door').every((s) => s[2] !== '월넛 우드 도어'), '훅에는 흰 문이 아닌 첫 문(월넛)을 쓰고, 6장이면 몽타주에서 그 문은 뺀다');
    ok(mult(P.a[0][1]) && P.a.filter((s) => s[0] === 'door').every((s) => mult(s[1])), '음악 박자가 있으면 훅과 문 컷의 길이가 박자의 배수다(박자 ' + beat.toFixed(3) + '초)');
    ok(P.at > 14 && P.at < 30, '전체 길이 ' + P.at.toFixed(1) + '초 (14~30초 사이)');
    ok(P.b.some((x) => x === 'door:0.90') && P.bt > 14, '음악이 없으면 문 컷은 0.9초');
    ok(P.c.filter((s) => s[0] === 'door').length === 3 && P.c[0][1] === '월넛 우드 도어', '문 사진이 3장 이하면 몽타주에 전부 넣는다(훅의 문도 포함)');
    ok(P.d.join(',') === 'hook,still,zoom,cta' && P.e.join(',') === 'hook,cta', '문 사진이 없으면 첫 화면·소개 사진으로(훅·한 장 더), 그것도 없으면 제품 사진 한 장으로 훅 → 마지막 문구');
    ok(P.bigT < 32 && P.nd <= 8, '문 8장이어도 ' + P.bigT.toFixed(1) + '초 안에 끝난다(몽타주 ' + P.nd + '컷)');
    ok(await page.evaluate(() => window.__wj.adEst()) === null, '사진이 하나도 없으면 길이를 못 재고 영상 만들기를 막는다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 글·숫자는 상세페이지에 적은 것만 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    ok(await page.evaluate(() => window.__wj.adRows().length === 0), '치수를 하나도 안 적었으면 규격 줄이 없다(숫자를 지어내지 않는다)');
    await page.evaluate(() => { const S = window.__wj.S(); S.size = Object.assign({}, S.size, { shape: 'rect', shapeSet: 'user', capW: '70', capH: '54', len: '150' }); S.facts.thick = '32-45'; S.facts.backset = '60mm'; S.facts.bore = '50'; });
    const R = await page.evaluate(() => window.__wj.adRows());
    ok(JSON.stringify(R) === JSON.stringify([['캡 중심 ~ 레버 끝', '150mm'], ['받침(캡) 크기', '70 × 54mm'], ['적용 문 두께', '32-45mm'], ['백셋', '60mm']]), '규격 줄: 입력한 값만, 단위 붙이기, 최대 4줄 → ' + JSON.stringify(R));
    await page.evaluate(() => { const S = window.__wj.S(); S.size.baseSet = 'user'; S.size.base = 'lever'; S.size.shape = 'round'; S.size.cap = '52'; });
    const R2 = await page.evaluate(() => window.__wj.adRows());
    ok(R2[0][0] === '캡 가장자리 ~ 레버 끝' && R2[1][0] === '받침(캡) 지름' && R2[1][1] === '52mm', '길이 기준·받침 모양에 따라 이름이 바뀐다(원형은 지름)');
    ok(await page.evaluate(() => window.__wj.adHookText()) === '크게 확대해서\n확인하세요', '문 사진이 없으면 훅 글은 "크게 확대해서 확인하세요"');
    await putDoors(page, 3, true);
    ok(await page.evaluate(() => window.__wj.adHookText()) === '이 손잡이,\n우리 집 문에 달면?', '문 사진이 3장 이상이면 훅 글은 "이 손잡이, 우리 집 문에 달면?"(질문으로 궁금하게)');
    await page.evaluate(() => { const S = window.__wj.S(); S.colors.items[1].photo.chk = { ok: false, issues: ['x'] }; });
    ok(await page.evaluate(() => window.__wj.adDoorItems().map((d) => d.it.label).join('|')) === '화이트 도어|라이트 그레이 도어', '검수에서 보류된 문 사진은 영상에서 뺀다');
    await page.evaluate(() => { const S = window.__wj.S(); S.colors.items[1].photo.chk = null; S.colors.items[9].label = '사용 컷'; });
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3. 영상 창: 종류 고르기 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    ok(await page.evaluate(() => window.__wj.VD.mode) === 'scroll' && (await page.locator('input[data-vsec]').count()) > 0, '문 사진이 3장 미만이면 처음에는 "상세페이지 훑기"가 골라져 있다(예전과 같다)');
    await page.click('input[name=vmode][value=ad]'); await page.waitForTimeout(200);
    const st = await page.evaluate(() => { const w = window.__wj; return { fmt: w.VD.fmt, music: w.VD.music, sec: document.querySelectorAll('input[data-vsec]').length, speed: document.querySelectorAll('input[name=vspeed]').length, vfmt: document.querySelectorAll('input[name=vfmt]').length, hook: (document.querySelector('#adHook') || {}).value, est: document.querySelector('#vdEst').textContent }; });
    ok(st.fmt === 'v' && st.music === 'bright' && st.sec === 0 && st.speed === 0 && st.vfmt === 0, '쇼츠 광고를 고르면: 세로 고정, 배경음 "밝게"가 기본으로 켜지고, 장면·속도·모양 고르는 칸은 숨는다');
    ok(st.hook === '크게 확대해서\n확인하세요' && /예상 길이 약 \d+초/.test(st.est), '한 줄 글 칸에 기본 글이 들어 있고 예상 길이가 나온다(' + st.est + ')');
    ok(/문에 단 사진 0장/.test(await page.textContent('.opts:has(#adHook)')), '들어가는 것(문 사진 0장 · 확대 · 규격)을 알려 준다');
    await page.fill('#adHook', '우리 집 문에 어울릴까?');
    ok(await page.evaluate(() => window.__wj.VD.adHook) === '우리 집 문에 어울릴까?', '한 줄 글을 고치면 그대로 쓴다');
    ok(!(await items(page)).some((x) => x.id === 'hero') && (await items(page)).some((x) => x.id === 'door'), '점검: 광고 모드에서는 "첫 화면 임시" 경고를 빼고 "문 색상 없음"은 남긴다');
    await page.click('input[name=vmode][value=scroll]'); await page.waitForTimeout(200);
    ok((await page.locator('input[data-vsec]').count()) > 0 && (await page.locator('input[name=vspeed]').count()) === 3, '"상세페이지 훑기"로 돌아가면 예전 칸이 다시 보인다');
    await page.click('#vdClose'); await page.waitForTimeout(100);
    await putDoors(page, 4, true);
    await page.evaluate(() => { window.__wj.VD.mode = null; });
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    ok(await page.evaluate(() => window.__wj.VD.mode) === 'ad' && await page.isChecked('input[name=vmode][value=ad]') && /문에 단 사진 4장/.test(await page.textContent('.opts:has(#adHook)')), '문 사진이 3장 이상이면 처음부터 "쇼츠 광고"가 골라져 있고 "문에 단 사진 4장"이라고 나온다');
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-adh]')].map((b) => b.textContent));
    ok(chips.length === 4 && chips.some((c) => /우리 집 문에 달면/.test(c)), '문 사진이 3장 이상이면 "추천 글" 단추 4개가 나온다 → ' + chips.join(' / '));
    await page.click('[data-adh="1"]'); await page.waitForTimeout(100);
    ok(await page.evaluate(() => window.__wj.VD.adHook) === '손잡이 하나로\n문이 달라 보여요' && (await page.inputValue('#adHook')) === '손잡이 하나로\n문이 달라 보여요', '추천 글 단추를 누르면 한 줄 글 칸과 영상에 그 글이 들어간다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3-2. 효과음 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const R = await page.evaluate(() => {
      const w = window.__wj, mk = (n) => Array.from({ length: n }, (_, i) => ({ label: '색' + i, hand: false, ai: true, bmp: {} }));
      const A = { doors: mk(6), zoom: [{}, {}, {}], rows: [[1, 2], [3, 4]], hero: {}, concept: {}, src: {} }, plan = w.adPlan(A, 60 / 112), sr = 44100;
      const buf = new AudioBuffer({ length: Math.ceil((plan.total + .3) * sr), sampleRate: sr, numberOfChannels: 2 });
      const base = buf.getChannelData(0).slice(); w.adSfx(buf, plan);
      const d = buf.getChannelData(0), rms = (t0, t1) => { let s = 0, n = 0; for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr) && i < d.length; i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / Math.max(1, n)); };
      let mx = 0; for (let i = 0; i < d.length; i++) mx = Math.max(mx, Math.abs(d[i]));
      const door = plan.list.find((s) => s.kind === 'door'), grid = plan.list.find((s) => s.kind === 'grid'), cta = plan.list.find((s) => s.kind === 'cta'), hook = plan.list[0];
      return { baseZero: base.every((v) => v === 0), mx, hook: rms(hook.t0 + .2, hook.t0 + .45), door: rms(door.t0, door.t0 + .1), gap: rms(door.t0 + .6, door.t0 + .95), grid: rms(grid.t0, grid.t0 + .3), cta: rms(cta.t0, cta.t0 + .4), same: Math.abs(buf.getChannelData(1)[Math.floor((hook.t0 + .3) * sr)] - d[Math.floor((hook.t0 + .3) * sr)]) < 1e-9 };
    });
    ok(R.hook > .02 && R.door > .004 && R.grid > .01 && R.cta > .02, '효과음: 훅의 쿵·문 컷의 톡·한눈에 보기·마지막 문구에서 소리가 난다(훅 ' + R.hook.toFixed(3) + ' · 컷 ' + R.door.toFixed(3) + ' · 모음 ' + R.grid.toFixed(3) + ' · 끝 ' + R.cta.toFixed(3) + ')');
    ok(R.gap < R.door * .5, '컷과 컷 사이 빈 곳은 조용하다(소리가 쉬지 않고 이어지지 않는다)');
    ok(R.mx <= 1 && R.mx > .1, '소리가 넘치지 않는다(가장 큰 값 ' + R.mx.toFixed(2) + ')');
    ok(R.same, '왼쪽·오른쪽 소리가 같은 자리에 들어간다');
    const P8 = await page.evaluate(() => { const w = window.__wj, mk = (n) => Array.from({ length: n }, (_, i) => ({ label: '색' + i, hand: false, ai: true, bmp: {} })); const p = w.adPlan({ doors: mk(8), zoom: [], rows: [], hero: null, concept: null, src: null }, 60 / 112), q = w.adPlan({ doors: mk(3), zoom: [], rows: [], hero: null, concept: null, src: null }, 60 / 112); return { doors: p.list.filter((s) => s.kind === 'door').length, grid: p.list.filter((s) => s.kind === 'grid').map((s) => s.imgs.length), small: q.list.map((s) => s.kind).join() }; });
    ok(P8.doors === 5 && P8.grid.join() === '8', '문 사진 8장: 몽타주는 5컷, "한눈에 보기"에는 8장이 모두 들어간다');
    ok(!/grid/.test(P8.small), '문 사진이 3장 이하면 "한눈에 보기"는 넣지 않는다(' + P8.small + ')');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 4. 그려진 장면(픽셀) */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await putDoors(page, 6, true);
    await page.evaluate(() => { const S = window.__wj.S(); S.name = '메탈 방문 레버 손잡이'; S.size = Object.assign({}, S.size, { shape: 'rect', shapeSet: 'user', capW: '70', capH: '54', len: '150' }); S.zoom.items[0].title = '끝이 둥근 레버 윗면'; S.cta.title = '우리 집 문에 달아 보세요'; window.__wj.VD.adHook = ''; });
    const f0 = await frame(page, 0.01), f1 = await frame(page, 1.0), hook2 = await frame(page, 1.0, { hook: '' });
    ok(f0.all.l < 12, '첫 프레임은 어둡게 시작한다(밝기 ' + f0.all.l.toFixed(0) + ')');
    ok(f1.scene === 'hook' && f1.top.white > .02 && f1.top.l > 40, '훅 장면: 위쪽에 큰 글씨(흰색 점 ' + (f1.top.white * 100).toFixed(1) + '%)가 있다');
    ok(f1.bottom.l < 60, '쇼츠 아래쪽(제목·버튼 자리)은 어둡게 비어 있다(밝기 ' + f1.bottom.l.toFixed(0) + ')');
    ok(Math.abs(f1.mid.r - 0x6d) < 70 && f1.mid.l > 30, '훅 사진은 월넛 문(갈색) 색이다(R ' + f1.mid.r.toFixed(0) + ')');
    ok(f1.tag.l > 15, 'AI로 만든 문 사진에는 "연출 사진" 표시 칩이 있다(칩 밝기 ' + f1.tag.l.toFixed(0) + ')');
    await page.evaluate(async () => { const S = window.__wj.S(); S.colors.items.forEach((it) => { if (it.photo) it.photo.ai = false; }); });
    const f1n = await frame(page, 1.0);
    const dif = f1.tagArr.reduce((s, v, i) => s + Math.abs(v - f1n.tagArr[i]), 0) / f1.tagArr.length;
    ok(dif > 6, 'AI가 아닌 사진이면 그 표시 칩이 사라져 그림이 달라진다(평균 차이 ' + dif.toFixed(1) + ')');
    await page.evaluate(() => { const S = window.__wj.S(); S.colors.items.forEach((it) => { if (it.photo) it.photo.ai = true; }); });
    const cuts = []; for (const t of [3.2, 4.3, 5.4, 6.5]) cuts.push(await frame(page, t));
    ok(cuts.every((c) => c.scene === 'door') && new Set(cuts.map((c) => Math.round(c.mid.l / 8))).size >= 3, '몽타주: 컷마다 문 색이 달라진다(밝기 ' + cuts.map((c) => c.mid.l.toFixed(0)).join(' · ') + ')');
    const z = await frame(page, 10.8), ro = await frame(page, 15.6), cta = await frame(page, -0.7), end = await frame(page, -0.03);
    ok(z.scene === 'zoom' && z.top.white > .02, '확대 장면: 위에 제목 글씨가 나온다');
    const gd = await frame(page, 9.4), gd0 = await frame(page, 8.2);
    ok(gd.scene === 'grid' && gd.mid.b > gd.mid.r - 20 && gd.mid.l > 35, '한눈에 보기: 문 색 사진을 한 화면에 모아 보여 준다(밝기 ' + gd.mid.l.toFixed(0) + ')');
    ok(Math.abs(gd.mid.l - gd0.mid.l) > 2 || Math.abs(gd.mid.r - gd0.mid.r) > 2, '한눈에 보기: 사진이 하나씩 튀어나오며 채워진다(처음과 나중 그림이 다르다)');
    const hk0 = await frame(page, 0.15), hk2 = await frame(page, 1.9);
    ok(Math.abs(hk0.mid.l - hk2.mid.l) > 4 || Math.abs(hk0.mid.r - hk2.mid.r) > 4, '훅: 처음엔 손잡이 가까이, 뒤로 물러나며 문 전체를 보여 준다(그림이 움직인다)');
    const dd0 = await frame(page, 3.0), dd1 = await frame(page, 3.6);
    ok(Math.abs(dd0.mid.l - dd1.mid.l) > 1 || Math.abs(dd0.mid.r - dd1.mid.r) > 1 || Math.abs(dd0.top.l - dd1.top.l) > 1, '문 몽타주: 컷 안에서도 움직인다(휙 들어오고 천천히 다가가요)');
    ok(ro.scene === 'rows' && ro.mid.b > ro.mid.r + 25 && ro.mid.white > .005, '규격 카드: 짙은 남색 바탕에 흰 큰 숫자');
    ok(cta.scene === 'cta' && cta.all.b > cta.all.r + 30, '마지막 문구: 파란 바탕');
    ok(end.all.l < cta.all.l * .5, '끝에서 어두워지며 끝난다');
    const hk = await frame(page, 1.0, { hook: '완전히 다른 글입니다' });
    ok(Math.abs(hk.top.white - f1.top.white) > .0005 || Math.abs(hk.top.l - f1.top.l) > 1, '한 줄 글을 바꾸면 훅 그림이 달라진다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 5. 끝까지: 실제로 녹화해서 영상 파일 확인 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await putDoors(page, 4, true);
    await page.evaluate(() => { const S = window.__wj.S(); S.size = Object.assign({}, S.size, { shape: 'rect', shapeSet: 'user', capW: '70', capH: '54', len: '150' }); S.zoom.items[0].title = '끝이 둥근 레버 윗면'; });
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    ok(await page.isChecked('input[name=vmode][value=ad]') && await page.isChecked('input[name=vmusic][value=bright]'), '문 사진 4장: 쇼츠 광고 + 밝은 배경음이 처음부터 골라져 있다');
    const est = await page.evaluate(() => window.__wj.adEst());
    await page.click('#vdGo'); await page.waitForSelector('#vdSave', { timeout: 120000 });
    const msg = await page.textContent('#vdMsg');
    ok(/다 만들었어요/.test(msg) && /배경음 있음/.test(msg), '영상이 만들어지고 "배경음 있음"이라고 나온다 → ' + msg.slice(0, 60));
    const b64 = await page.evaluate(async () => { const b = window.__wj.VD.blob, buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192)); return { d: btoa(s), ext: window.__wj.VD.ext, mode: window.__wj.VD.blobMode, fmt: window.__wj.VD.blobFmt }; });
    const fp = B + '/vid/ad_test.' + b64.ext; fs.mkdirSync(B + '/vid', { recursive: true }); fs.writeFileSync(fp, Buffer.from(b64.d, 'base64'));
    const probe = JSON.parse(require('child_process').execSync('ffprobe -v error -show_streams -of json "' + fp + '"').toString());
    const v = probe.streams.find((s) => s.codec_type === 'video'), a = probe.streams.find((s) => s.codec_type === 'audio');
    let dur = parseFloat(v.duration); if (!isFinite(dur)) { const o = require('child_process').spawnSync('ffmpeg', ['-v', 'error', '-i', fp, '-f', 'null', '-'], { encoding: 'utf8' }); dur = 0; const out = require('child_process').execSync('ffmpeg -i "' + fp + '" -f null - 2>&1 | grep -o "time=[0-9:.]*" | tail -1').toString().trim().replace('time=', '').split(':').reduce((x, y) => x * 60 + parseFloat(y), 0); dur = out; }
    ok(v.width === 1080 && v.height === 1920, '영상 크기 1080×1920 (세로)');
    ok(a && /opus|aac/.test(a.codec_name), '소리 줄기가 있다(' + (a && a.codec_name) + ')');
    ok(Math.abs(dur - est) < 2.5, '길이가 예상(' + est.toFixed(1) + '초)과 비슷하다(' + dur.toFixed(1) + '초)');
    ok(b64.mode === 'ad' && b64.fmt === 'v' && /세로 광고 영상/.test(await page.textContent('#vdPrev')), '결과 화면에 "세로 광고 영상"과 올릴 곳 문구가 나온다');
    // 중간 프레임이 비어 있지 않은지
    require('child_process').execSync('ffmpeg -v error -y -ss 1.0 -i "' + fp + '" -frames:v 1 "' + B + '/vid/ad_f1.png"');
    const L = parseFloat(require('child_process').execSync('ffmpeg -v error -i "' + B + '/vid/ad_f1.png" -vf "scale=1:1,format=gray" -f rawvideo - | od -An -tu1').toString().trim());
    ok(L > 15, '1초 지점 프레임이 까맣지 않다(밝기 ' + L + ')');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
