/* 자동몰 상세페이지 제작기 v94 — 작업 파일 찾기(이름표·작업 폴더·폴더에서 작업 파일만 찾기) */
const http = require('http'), fs = require('fs'), zlib = require('zlib'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const HTML = fs.readFileSync(B + '/w/am_work.html', 'utf8');
const H2C = fs.readFileSync(B + '/h2c/node_modules/html2canvas/dist/html2canvas.min.js');
const PHOTO = B + '/up/white_prod.png';
const JZ = fs.readFileSync(B + '/jz/node_modules/jszip/dist/jszip.min.js');
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
    if (/제목·설명을 쓰는 사람/.test(p)) { window.__log.push({ kind: 'post', p, n: o && o.images ? [].concat(o.images).length : 0, tier: o && o.modelTier }); if (window.__postErr) throw { code: 'upstream_error' }; return window.__postRaw || {}; }
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
    if (/jszip\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: JZ });
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

const COLS = [['#f4f1ea', '화이트 도어'], ['#6d4a2f', '월넛 우드 도어'], ['#c9cdd2', '라이트 그레이 도어'], ['#1c1d20', '블랙 도어']];
const putDoors = (page, n, ai) => page.evaluate(async ({ n, ai, COLS }) => { const w = window.__wj, S = w.S(); for (let i = 0; i < n; i++) { const c = document.createElement('canvas'); c.width = c.height = 400; const g = c.getContext('2d'); g.fillStyle = COLS[i][0]; g.fillRect(0, 0, 400, 400); g.fillStyle = '#2a2d34'; g.fillRect(70, 170, 260, 60); const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', .9)); S.colors.items[i].label = COLS[i][1]; await w.setPhoto('colors.items.' + i + '.photo', b, { ai: !!ai }); } }, { n, ai, COLS });
const RAW = { titles: ['방문 손잡이 레버 | 문에 달면 이렇게 보여요', '레버 손잡이, 문 색 4가지에 달아 봤어요', '레버 길이 150mm, 받침 70×54 한눈에'], desc: '문에 달면 어떻게 보이는지 4가지 문 색으로 보여 드려요. 레버 길이는 캡 중심에서 끝까지 150mm예요.\n받침(캡)은 70 × 54mm예요.\n궁금한 점은 판매자에게 물어보세요.', tags: ['방문손잡이', '레버 손잡이', '#손잡이교체', '문손잡이', '방문손잡이'], hashtags: ['방문손잡이', '#인테리어', '레버손잡이'], pinned: '우리 집 문에 맞는지 궁금하시면 댓글로 문 두께를 알려 주세요.', short: '문에 달면 이렇게 보여요.\n레버 길이 150mm.' };
const fake = (page) => page.evaluate(() => { const w = window.__wj, V = w.VD; V.blob = new Blob(['x'], { type: 'video/webm' }); V.url = URL.createObjectURL(V.blob); V.ext = 'webm'; V.blobFmt = 'v'; V.blobMode = 'ad'; V.post = null; V.postAI = false; V.postTouched = false; V.postAlt = null; V.postMsg = ''; V.postFor = null; });
const setS = (page, fn) => page.evaluate((fn) => { const S = window.__wj.S(); new Function('S', fn)(S); }, fn);
const postLogs = (page) => page.evaluate(() => window.__log.filter((l) => l.kind === 'post'));
const waitPost = (page) => page.waitForFunction(() => !window.__wj.VD.postBusy, null, { timeout: 20000 }).then(() => page.waitForTimeout(250));
const vp = (page, sel) => page.inputValue('#vpBox [data-vp="' + sel + '"]');

const BASE = B;
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();
  const JSZipN = require(BASE + '/jz/node_modules/jszip');
  const OUT = BASE + '/wf_out'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT + '/sub', { recursive: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const mk = (page) => {
    const W = (fn, a) => page.evaluate(fn, a);
    const cur = () => page.evaluate(() => { const w = window.__wj, S = w.S(); return { name: S.name, wid: S.wid || null, libId: S.libId || null, src: !!(S.src && w.PH.has(S.src.id)), doors: S.colors.items.filter((it) => it.photo && w.PH.has(it.photo.id)).length }; });
    const addSrc = async (n) => { await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(1800); await setS(page, 'S.name=' + JSON.stringify(n) + ';'); };
    const newProd = async () => { await page.click('#btnNew'); await page.waitForSelector('#nwGo'); await page.click('#nwGo'); await page.waitForTimeout(600); };
    const toastText = () => page.evaluate(() => document.getElementById('toast').textContent);
    const clearToast = () => page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.hidden = true; });
    const saveInFolder = async () => { await clearToast(); await page.click('#btnSave'); await page.waitForFunction(() => /저장했어요|저장하지/.test(document.getElementById('toast').textContent), null, { timeout: 8000 }); return toastText(); };
    const opfs = () => page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const d = await r.getDirectoryHandle('wjwork', { create: true }); const out = []; for await (const h of d.values()) { if (h.kind !== 'file') continue; const f = await h.getFile(); out.push({ name: h.name, size: f.size, meta: await window.__wj.zipMeta(f) }); } return out.sort((a, b) => (a.name < b.name ? -1 : 1)); });
    const rows = () => page.$$eval('#wfList .libc', (a) => a.map((c) => c.textContent.replace(/\s+/g, ' ')));
    return { W, cur, addSrc, newProd, toastText, clearToast, saveInFolder, opfs, rows };
  };

  /* ===== 가 부분: 클로드 화면처럼 폴더 기억 기능이 없는 곳 ===== */
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
    await ctx.addInitScript(() => { Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }); });
    const { page, errors } = await open(browser, { ctx });
    const h = mk(page);

    await h.addSrc('A제품 거실문'); await putDoors(page, 3, true);
    let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#btnSave')]);
    const nameA = dl.suggestedFilename(); await dl.saveAs(OUT + '/A_work.zip');
    ok(/^detailpage-work-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/.test(nameA), '내려받는 작업 파일 이름에 날짜와 시각이 붙는다(같은 날 여러 번 저장해도 안 겹침) → ' + nameA);
    const zA = await JSZipN.loadAsync(fs.readFileSync(OUT + '/A_work.zip')), mA = JSON.parse(zA.comment);
    ok(mA.wj === 1 && mA.name === 'A제품 거실문' && mA.n === 4 && mA.wid && mA.v >= 94, '작업 파일에 이름표(제품 이름·사진 4장·페이지 번호·버전)가 달린다');
    ok(!!zA.files['state.json'] && !!zA.files['photos/index.json'], '파일 안 모양은 예전과 같다(state.json, photos/…)');
    const tail = await page.evaluate(async (b64) => { const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); return window.__wj.zipMeta(new File([u], 'x.zip')); }, fs.readFileSync(OUT + '/A_work.zip').toString('base64'));
    ok(tail && tail.name === 'A제품 거실문' && tail.wid === mA.wid, '앱이 파일 끝부분만 읽어서도 이름표를 알아낸다');

    await h.newProd(); await h.addSrc('B제품 안방문');
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#btnSave')]); await dl.saveAs(OUT + '/B_work.zip');
    const mB = JSON.parse((await JSZipN.loadAsync(fs.readFileSync(OUT + '/B_work.zip'))).comment);
    ok(mB.name === 'B제품 안방문' && mB.wid && mB.wid !== mA.wid, '다른 페이지는 다른 페이지 번호를 받는다');

    /* 폴더 안에 섞어 둘 다른 파일들 */
    const other = new JSZipN(); other.file('README.txt', '다른 프로그램의 압축 파일'); fs.writeFileSync(OUT + '/other.zip', await other.generateAsync({ type: 'nodebuffer' }));
    fs.writeFileSync(OUT + '/notes.txt', '메모');
    const legacy = await JSZipN.loadAsync(fs.readFileSync(OUT + '/A_work.zip')); legacy.comment = ''; fs.writeFileSync(OUT + '/detailpage-work-2026-11-09.zip', await legacy.generateAsync({ type: 'nodebuffer', compression: 'STORE' }));   // 이름표 없는 예전 파일
    fs.copyFileSync(OUT + '/B_work.zip', OUT + '/sub/nested_B.zip');
    const fake = new JSZipN(); fake.file('x.txt', 'x'); fs.writeFileSync(OUT + '/detailpage-work-fake.zip', await fake.generateAsync({ type: 'nodebuffer' }));   // 이름만 비슷한 다른 zip

    const ext = async (zipPath, dir) => { const z = await JSZipN.loadAsync(fs.readFileSync(zipPath)); for (const [p, e] of Object.entries(z.files)) { if (e.dir) continue; const fp = OUT + '/' + dir + '/' + p; fs.mkdirSync(require('path').dirname(fp), { recursive: true }); fs.writeFileSync(fp, await e.async('nodebuffer')); } };
    await ext(OUT + '/A_work.zip', 'detailpage-work-2026-11-05'); await ext(OUT + '/B_work.zip', 'detailpage-work-2026-11-05 (2)');   // zip을 풀어 둔 "파일 폴더"(윈도 탐색기에서 보이던 것)
    fs.mkdirSync(BASE + '/wf_none', { recursive: true }); fs.writeFileSync(BASE + '/wf_none/x.zip', fs.readFileSync(OUT + '/other.zip')); fs.writeFileSync(BASE + '/wf_none/memo.txt', '메모');
    await page.click('#btnLoad'); await page.waitForSelector('#wfList');
    ok(!(await page.$('#libList')) && /작업 파일만/.test(await page.textContent('.dlg')), '"파일 불러오기"는 이제 작업 파일 목록 창을 연다(바로 탐색기가 뜨지 않는다)');
    const bar = await page.textContent('#wfBar'), info = await page.textContent('#wfInfo');
    ok(/폴더에서 찾기/.test(bar) && !/작업 폴더 정하기/.test(bar) && /이 화면에서는/.test(info), '폴더 기억이 안 되는 화면(클로드 안)에서는 "폴더에서 찾기"와 그 이유 안내가 나온다');
    ok(/폴더에서 찾기/.test(await page.textContent('#wfList')), '처음 목록 자리에는 "폴더를 고르세요" 안내가 있다');
    await page.setInputFiles('#wfDir', OUT);
    await page.waitForFunction(() => document.querySelectorAll('#wfList .libc').length > 0, null, { timeout: 8000 });
    const R = await h.rows(), all = R.join(' | ');
    ok(R.length === 7, '고른 폴더에서 작업 파일 7개만 나온다(작업 zip 3개 + 이름표 없는 예전 zip 2개 + 풀어 둔 폴더 2개) → ' + R.length);
    ok(R.filter((x) => /풀어 둔 폴더/.test(x)).length === 2 && !/photos|index\.json|\.bin/.test(all), '풀어 둔 폴더는 폴더 하나당 한 줄로만 나온다(안의 state.json·사진 파일이 따로 나오지 않음)');
    ok(!/other\.zip|notes\.txt/.test(all), '다른 zip(other.zip)과 메모(notes.txt)는 목록에 나오지 않는다');
    ok(/A제품 거실문.*사진 4장/.test(all) && /B제품 안방문.*사진 1장/.test(all), '이름·사진 수가 목록에 보인다');
    ok(/detailpage-work-2026-11-09\.zip.*예전 방식/.test(all) && /nested_B\.zip/.test(all), '이름표 없는 예전 파일은 "예전 방식" 표시로, 하위 폴더의 작업 파일도 찾는다');
    const iA = R.findIndex((t) => /A_work\.zip/.test(t)), iB = R.findIndex((t) => /B_work\.zip/.test(t));
    ok(iB < iA, '최근에 저장한 것이 위에 온다(B가 A보다 위)');
    await page.screenshot({ path: BASE + '/w/shots/wfile_scan.png' });

    await page.click('#wfList .libc:has-text("A_work.zip") [data-wf="open"]');
    await page.waitForFunction(() => document.getElementById('veil').hidden, null, { timeout: 10000 }); await page.waitForTimeout(500);
    let c = await h.cur();
    ok(c.name === 'A제품 거실문' && c.src && c.doors === 3 && c.wid === mA.wid, '목록에서 A의 "열기"를 누르면 바로 불러와진다(이름·사진·문 색 사진 3장·페이지 번호 유지)');

    await page.click('#btnLoad'); await page.waitForSelector('#wfList'); await page.setInputFiles('#wfDir', OUT);
    await page.waitForFunction(() => document.querySelectorAll('#wfList .libc').length > 0, null, { timeout: 8000 });
    await page.click('#wfList .libc:has-text("detailpage-work-2026-11-09.zip") [data-wf="open"]');
    await page.waitForFunction(() => document.getElementById('veil').hidden, null, { timeout: 10000 }); await page.waitForTimeout(400);
    c = await h.cur();
    ok(c.name === 'A제품 거실문' && c.doors === 3, '이름표 없는 예전 방식 파일도 목록에서 열면 불러와진다');

    /* 이름만 비슷한 다른 zip → 오류 안내만 하고 작업은 그대로 */
    await page.click('#btnLoad'); await page.waitForSelector('#wfList'); await page.setInputFiles('#wfDir', OUT);
    await page.waitForFunction(() => document.querySelectorAll('#wfList .libc').length > 0, null, { timeout: 8000 });
    await h.clearToast();
    await page.click('#wfList .libc:has-text("detailpage-work-fake.zip") [data-wf="open"]'); await page.waitForTimeout(1200);
    c = await h.cur();
    ok(/불러올 수 없어요/.test(await h.toastText()) && c.name === 'A제품 거실문' && !(await page.evaluate(() => document.getElementById('veil').hidden)), '작업 파일이 아닌 zip을 열면 안내만 하고, 지금 작업은 그대로이며 목록 창도 남는다');

    /* 직접 고르기 */
    const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click('#wfOne')]);
    await fc.setFiles(OUT + '/B_work.zip');
    await page.waitForFunction(() => document.getElementById('veil').hidden, null, { timeout: 10000 }); await page.waitForTimeout(400);
    c = await h.cur();
    ok(c.name === 'B제품 안방문' && c.wid === mB.wid, '"파일 하나 직접 고르기"도 그대로 되고, 불러온 뒤 창이 닫힌다');
    /* 풀어 둔 폴더 열기 */
    await page.click('#btnLoad'); await page.waitForSelector('#wfList'); await page.setInputFiles('#wfDir', OUT);
    await page.waitForFunction(() => document.querySelectorAll('#wfList .libc').length > 0, null, { timeout: 8000 });
    ok(/사진 4장 · 풀어 둔 폴더/.test(await page.textContent('#wfList .libc:has-text("풀어 둔 폴더"):has-text("A제품 거실문")')), '풀어 둔 폴더 줄에 "이름 · 사진 4장 · 풀어 둔 폴더"가 나온다');
    await page.screenshot({ path: BASE + '/w/shots/wfile_folder.png' });
    await page.click('#wfList .libc:has-text("풀어 둔 폴더"):has-text("A제품 거실문") [data-wf="open"]');
    await page.waitForFunction(() => document.getElementById('veil').hidden, null, { timeout: 10000 }); await page.waitForTimeout(500);
    c = await h.cur();
    ok(c.name === 'A제품 거실문' && c.src && c.doors === 3 && c.wid === mA.wid, '풀어 둔 폴더를 열면 zip과 똑같이 불러와진다(이름·사진·문 색 사진 3장·페이지 번호)');
    await page.click('#btnLoad'); await page.waitForSelector('#wfList'); await page.setInputFiles('#wfDir', OUT + '/detailpage-work-2026-11-05');
    await page.waitForFunction(() => document.querySelectorAll('#wfList .libc').length > 0, null, { timeout: 8000 });
    ok((await h.rows()).length === 1 && /풀어 둔 폴더/.test((await h.rows())[0]), '풀어 둔 폴더 하나를 직접 골라도 찾아서 한 줄로 보여 준다');
    await page.setInputFiles('#wfDir', BASE + '/wf_none');
    await page.waitForFunction(() => /찾지 못했어요/.test(document.getElementById('wfList').textContent), null, { timeout: 8000 });
    const none = await page.textContent('#wfList');
    ok(/zip 1개/.test(none) && /풀어 둔 작업 폴더는 0개/.test(none) && /state\.json/.test(none), '작업 파일이 없는 폴더를 고르면 무엇을 살펴봤고(zip 몇 개·풀어 둔 폴더 몇 개) 무엇을 찾는지 알려 준다');
    await page.click('#wfClose');
    ok(errors.length === 0, '(가) 화면 오류·콘솔 오류가 없다' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  /* ===== 나 부분: 작업 폴더를 기억할 수 있는 곳(github.io를 크롬·엣지로) — 폴더는 브라우저의 진짜 폴더 손잡이(OPFS)로 대신 시험.
     (이 시험 환경의 OPFS는 한글 파일 이름을 거부해서, 한글 이름이 거부되면 영문 이름으로 다시 저장하는 길도 함께 확인된다) ===== */
  {
    const prof = BASE + '/pw_prof_wf'; fs.rmSync(prof, { recursive: true, force: true });
    const ctx = await chromium.launchPersistentContext(prof, { viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
    await ctx.addInitScript(() => { window.__picks = 0; window.showDirectoryPicker = async () => { window.__picks++; const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('wjwork', { create: true }); }; });
    let { page, errors } = await open(browser, { ctx });
    let h = mk(page);
    const okName = (n) => /^(W1_거실문_작업|detailpage-work-[0-9-]+)\.zip$/.test(n);
    const isWork = (x) => x.meta || /^detailpage-work/.test(x.name);

    await h.addSrc('W1 거실문');
    let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#btnSave')]); await dl.path();
    ok(true, '작업 폴더를 정하기 전에는 예전처럼 내려받기로 저장된다');
    await page.click('#btnLoad'); await page.waitForSelector('#wfList');
    ok(/작업 폴더 정하기/.test(await page.textContent('#wfBar')) && /폴더를 정해 두면/.test(await page.textContent('#wfList')), '폴더를 아직 안 정했으면 "작업 폴더 정하기" 단추와 안내가 나온다');
    await page.click('[data-wf="pick"]'); await page.waitForFunction(() => /작업 폴더: /.test(document.getElementById('wfInfo').textContent), null, { timeout: 5000 });
    ok(await page.evaluate(() => window.__picks) === 1 && /wjwork/.test(await page.textContent('#wfInfo')) && /아직 작업 파일이 없어요/.test(await page.textContent('#wfList')), '폴더를 정하면 이름이 보이고 목록은 비어 있다(폴더 선택창은 1번만)');
    await page.click('#wfClose');

    let gotDl = false; page.on('download', () => { gotDl = true; });
    let msg = await h.saveInFolder(), F = await h.opfs();
    ok(F.length === 1 && okName(F[0].name) && F[0].meta && F[0].meta.name === 'W1 거실문' && /작업 폴더「wjwork」에 저장했어요/.test(msg), '"작업 저장"을 누르면 작업 폴더에 바로 저장된다(이름표 있음) → ' + (F[0] && F[0].name));
    await page.waitForTimeout(500);
    ok(!gotDl, '그때는 내려받기(다운로드)가 따로 일어나지 않는다');
    const at1 = F[0].meta.at, wid1 = F[0].meta.wid, name1 = F[0].name;

    await setS(page, "S.name='W1 거실문 수정본';"); await page.waitForTimeout(150);
    msg = await h.saveInFolder(); F = await h.opfs();
    ok(F.length === 1 && F[0].name === name1 && F[0].meta.name === 'W1 거실문 수정본' && F[0].meta.wid === wid1 && F[0].meta.at > at1 && /덮어썼어요/.test(msg), '같은 페이지를 다시 저장하면 새 파일이 생기지 않고 그 파일에 덮어쓴다(파일 1개 유지)');

    await h.newProd(); await h.addSrc('W2 안방문'); await h.saveInFolder();
    await h.newProd(); await h.addSrc('W2 안방문'); await h.saveInFolder(); F = await h.opfs();
    ok(F.length === 3 && new Set(F.map((x) => x.name)).size === 3 && F.filter((x) => x.meta.name === 'W2 안방문').length === 2, '이름이 같은 다른 페이지 둘은 서로 덮어쓰지 않고 각자 파일로 저장된다(파일 3개) → ' + F.map((x) => x.name).join(', '));

    /* 파일 이름 규칙(같은 이름·다른 페이지 → "(2)", 같은 페이지 → 덮어쓰기, 남의 파일은 그대로) */
    const nm = await page.evaluate(async () => {
      const w = window.__wj, r = await navigator.storage.getDirectory(), d = await r.getDirectoryHandle('wjwork'), o = {};
      const f0 = await d.getFileHandle('Z_test.zip', { create: true }), w0 = await f0.createWritable(); await w0.write(new Blob(['남의 파일 내용'])); await w0.close();   // 작업 파일이 아닌 다른 파일(같은 이름)
      const mkz = async (wid, name, txt) => { const z = new JSZip(); z.file('a.txt', txt); const meta = { wj: 1, wid, name, at: Date.now(), n: 0, v: 94 }; return [await z.generateAsync({ type: 'blob', comment: JSON.stringify(meta) }), meta]; };
      let [b1, m1] = await mkz('p1', 'P1', '내 파일 1'); o.a = await w.putWork('Z_test.zip', b1, m1, d);
      let [b2, m2] = await mkz('p2', 'P2', '내 파일 2'); o.b = await w.putWork('Z_test.zip', b2, m2, d);
      let [b3, m3] = await mkz('p1', 'P1', '내 파일 1 수정'); o.c = await w.putWork('Z_test.zip', b3, m3, d);
      const rd = async (n) => (await (await d.getFileHandle(n)).getFile()).text();
      o.foreign = await rd('Z_test.zip'); o.f2 = await (await JSZip.loadAsync(await (await d.getFileHandle('Z_test (2).zip')).getFile())).file('a.txt').async('string');
      await d.removeEntry('Z_test (2).zip'); await d.removeEntry('Z_test (3).zip');   // 아래 목록 시험이 헷갈리지 않게 치워 둬요
      return o;
    });
    ok(nm.foreign === '남의 파일 내용' && nm.a === 'Z_test (2).zip' && nm.b === 'Z_test (3).zip', '폴더에 같은 이름의 남의 파일이 있어도 덮어쓰지 않고 "(2)", "(3)"으로 저장한다 → ' + nm.a + ', ' + nm.b);
    ok(nm.c === 'Z_test (2).zip' && nm.f2 === '내 파일 1 수정', '같은 페이지(번호 p1)를 다시 저장하면 자기 파일 "Z_test (2).zip"에 덮어쓴다(새 파일 안 만듦)');

    const rowsOk = (await h.opfs()).filter(isWork).length;
    await page.click('#btnLoad'); await page.waitForSelector('#wfList');
    await page.waitForFunction((n) => document.querySelectorAll('#wfList .libc').length === n, rowsOk, { timeout: 8000 });
    const R = await h.rows();
    ok(R.length === 3 && /W2 안방문/.test(R[0]) && /W1 거실문 수정본/.test(R[2]) && !/Z_test/.test(R.join(' ')), '"파일 불러오기"를 열면 작업 폴더의 작업 파일 3개만 자동으로 바로 나온다(폴더를 다시 안 골라도 됨, 같은 폴더의 다른 zip은 안 나옴)');
    await page.screenshot({ path: BASE + '/w/shots/wfile_dir.png' });
    await page.click('#wfList .libc:has-text("W1 거실문 수정본") [data-wf="open"]');
    await page.waitForFunction(() => document.getElementById('veil').hidden, null, { timeout: 10000 }); await page.waitForTimeout(500);
    let c = await h.cur();
    ok(c.name === 'W1 거실문 수정본' && c.wid === wid1 && c.src, '목록에서 열면 W1이 불러와지고 페이지 번호가 그대로다');
    await setS(page, "S.name='W1 거실문 3번째';"); await page.waitForTimeout(150);
    await h.saveInFolder(); F = await h.opfs();
    ok(F.filter(isWork).length === 3 && F.find((x) => x.meta && x.meta.wid === wid1).meta.name === 'W1 거실문 3번째' && F.find((x) => x.meta && x.meta.wid === wid1).name === name1, '불러온 파일을 고쳐서 다시 저장해도 같은 파일에 덮어쓴다(파일이 늘지 않음)');

    /* 내 상세페이지 목록의 "파일" 단추도 같은 폴더로 */
    const n0 = (await h.opfs()).length;
    await page.click('#btnLib'); await page.waitForSelector('.libc'); await h.clearToast();
    await page.click('.libc.cur [data-lib="zip"]'); await page.waitForFunction(() => /저장했어요/.test(document.getElementById('toast').textContent), null, { timeout: 8000 });
    F = await h.opfs();
    ok(F.length === n0 && /작업 폴더「wjwork」/.test(await h.toastText()), '내 상세페이지 목록의 "파일" 단추도 작업 폴더의 같은 페이지 파일에 저장된다(파일이 늘지 않음)');
    await page.click('#libClose');

    /* 새로 고침해도 폴더를 기억한다 */
    await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForFunction(() => window.__wj && window.__wj.LIB.ready, null, { timeout: 8000 }); await page.waitForTimeout(500);
    await page.click('#btnLoad'); await page.waitForSelector('#wfList');
    await page.waitForFunction(() => document.querySelectorAll('#wfList .libc').length >= 3, null, { timeout: 8000 });
    ok(await page.evaluate(() => window.__picks) === 0 && /wjwork/.test(await page.textContent('#wfInfo')), '새로 고침해도 작업 폴더를 기억해서 폴더 선택창 없이 목록이 바로 나온다');
    await page.click('#wfClose');
    const nBefore = (await h.opfs()).length; msg = await h.saveInFolder();
    ok((await h.opfs()).length === nBefore && /작업 폴더「wjwork」/.test(msg), '새로 고침 뒤 "작업 저장"도 같은 폴더로 간다');

    /* 작업 폴더 안에 zip을 풀어 둔 폴더가 있어도 찾아서 연다 */
    const unz = await page.evaluate(async () => {
      const r = await navigator.storage.getDirectory(), d = await r.getDirectoryHandle('wjwork'); let zn = null;
      for await (const x of d.values()) { if (x.kind === 'file' && /^detailpage-work/.test(x.name)) { zn = x.name; break; } }
      const z = await JSZip.loadAsync(await (await d.getFileHandle(zn)).getFile()), root = await d.getDirectoryHandle('unzipped-1', { create: true });
      for (const [p, e] of Object.entries(z.files)) { if (e.dir) continue; const ps = p.split('/'); let dh = root; for (let i = 0; i < ps.length - 1; i++) dh = await dh.getDirectoryHandle(ps[i], { create: true }); const fh = await dh.getFileHandle(ps[ps.length - 1], { create: true }), w = await fh.createWritable(); await w.write(await e.async('blob')); await w.close(); }
      return JSON.parse(z.comment);
    });
    await page.click('#btnLoad'); await page.waitForSelector('#wfList');
    await page.waitForFunction(() => /풀어 둔 폴더/.test(document.getElementById('wfList').textContent), null, { timeout: 8000 });
    ok(/unzipped-1/.test(await page.textContent('#wfList .libc:has-text("풀어 둔 폴더")')), '작업 폴더 안에 zip을 풀어 둔 폴더(unzipped-1)가 있으면 그것도 목록에 나온다');
    await page.click('#wfList .libc:has-text("풀어 둔 폴더") [data-wf="open"]');
    await page.waitForFunction(() => document.getElementById('veil').hidden, null, { timeout: 10000 }); await page.waitForTimeout(500);
    c = await h.cur();
    ok(c.name === unz.name && c.wid === unz.wid && c.src, '작업 폴더의 풀어 둔 폴더도 열면 그대로 불러와진다');

    /* 브라우저가 허락을 다시 물을 때 / 거절할 때 */
    await page.evaluate(() => { window.__req = 0; FileSystemHandle.prototype.queryPermission = async () => 'prompt'; FileSystemHandle.prototype.requestPermission = async () => { window.__req++; return 'granted'; }; });
    await page.click('#btnLoad'); await page.waitForSelector('#wfList');
    ok(/작업 폴더 열기/.test(await page.textContent('#wfBar')) && /허락을 다시 물어요/.test(await page.textContent('#wfInfo')), '허락이 필요하면 목록 창에 "작업 폴더 열기" 단추가 나온다');
    await page.click('[data-wf="grant"]'); await page.waitForFunction(() => document.querySelectorAll('#wfList .libc').length >= 3, null, { timeout: 8000 });
    ok(await page.evaluate(() => window.__req) >= 1, '"작업 폴더 열기"를 누르면 그때 허락을 묻고 목록을 보여 준다');
    await page.click('#wfClose');
    const r0 = await page.evaluate(() => window.__req); await h.saveInFolder();
    ok(await page.evaluate(() => window.__req) === r0 + 1, '"작업 저장"을 누르면 바로 그 순간 허락을 묻는다(나중에 물으면 브라우저가 거절해서)');
    await page.evaluate(() => { FileSystemHandle.prototype.queryPermission = async () => 'denied'; });
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#btnSave')]);
    ok(!!dl.suggestedFilename(), '허락을 못 받으면 저장을 포기하지 않고 예전처럼 내려받기로 저장한다');

    ok(errors.length === 0, '(나) 화면 오류·콘솔 오류가 없다' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? ('실패 ' + fails + '개') : '모두 통과'); process.exit(fails ? 1 : 0);
})();
