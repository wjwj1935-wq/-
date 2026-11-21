/* 자동몰 상세페이지 제작기 v93 — 내 상세페이지(자동 보관·목록·다시 불러오기) */
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

  /* 한 창(context) 안에서 새로 고침해도 IndexedDB·localStorage가 남는다. JSZip은 로컬 파일로 대신 준다. */
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  let { page, errors } = await open(browser, { ctx });
  const W = (fn, a) => page.evaluate(fn, a);
  const list = () => page.evaluate(() => window.__wj.LIB.list.map((e) => ({ id: e.id, name: e.name, label: e.label, pin: !!e.pin, n: e.n, ids: e.ids.slice(), thumb: !!e.thumb, at: e.at })));
  const idbHas = (ids) => page.evaluate(async (ids) => new Promise((res) => { const r = indexedDB.open('am-dp'); r.onsuccess = () => { const db = r.result, st = db.transaction('p', 'readonly').objectStore('p'), out = {}; let n = 0; ids.forEach((id) => { const q = st.get(id); q.onsuccess = () => { out[id] = !!q.result; if (++n === ids.length) res(out); }; }); if (!ids.length) res({}); }; }), ids);
  const idbKeys = () => page.evaluate(async () => new Promise((res) => { const r = indexedDB.open('am-dp'); r.onsuccess = () => { const q = r.result.transaction('p', 'readonly').objectStore('p').getAllKeys(); q.onsuccess = () => res(q.result); }; }));
  const cur = () => page.evaluate(() => { const w = window.__wj, S = w.S(); return { id: S.libId || null, name: S.name, src: !!(S.src && w.PH.has(S.src.id)), srcId: S.src && S.src.id, doors: S.colors.items.filter((it) => it.photo && w.PH.has(it.photo.id)).length }; });
  const btn = () => page.textContent('#btnLib');
  const nameIt = (n) => setS(page, "S.name=" + JSON.stringify(n) + ";");
  const newProd = async () => { await page.click('#btnNew'); await page.waitForSelector('#nwGo'); await page.click('#nwGo'); await page.waitForTimeout(500); };
  const addSrc = async (n) => { await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(1800); await nameIt(n); };

  /* 1. 빈 화면은 보관하지 않는다 */
  {
    ok((await btn()).trim() === '내 상세페이지', '처음에는 단추가 "내 상세페이지"(개수 없음)');
    await W(() => window.__wj.libSaveNow());
    ok((await list()).length === 0 && (await cur()).id === null, '사진이 하나도 없는 빈 화면은 목록에 남기지 않는다');
    ok(await W(() => !!document.getElementById('btnLoad') && document.getElementById('btnLoad').textContent.trim() === '파일 불러오기'), '기존 zip 단추 이름은 "파일 불러오기"');
  }

  /* 2. 사진을 넣으면 (고치고 2.5초 뒤) 자동으로 보관된다 */
  let A;
  {
    await addSrc('A제품 거실문');
    await page.waitForTimeout(3600);
    const L = await list(), c = await cur();
    ok(L.length === 1 && L[0].name === 'A제품 거실문' && L[0].thumb && c.id === L[0].id, '사진을 넣고 3초쯤 뒤 목록에 자동으로 1개 생긴다(그림·이름·번호 맞음)');
    ok((await btn()).trim() === '내 상세페이지 1', '단추에 개수가 나온다("내 상세페이지 1")');
    const keys = await idbKeys();
    ok(keys.includes('lib:' + L[0].id), '보관소(IndexedDB)에 "lib:번호" 칸이 실제로 생겼다');
    await putDoors(page, 4, true);
    await W(() => window.__wj.libSaveNow());
    const L2 = await list();
    ok(L2.length === 1 && L2[0].n === 5 && L2[0].ids.length === 5, '문 색 사진 4장을 더하면 같은 항목이 갱신된다(사진 5장, 새 항목 안 생김)');
    A = L2[0];
    ok((await idbHas(A.ids)) && Object.values(await idbHas(A.ids)).every(Boolean), '보관된 사진 5장이 모두 보관소에 있다');
  }

  /* 3. 새 제품: 지금 제품이 먼저 보관되고, 새 제품은 빈 화면이라 안 남는다 */
  let B;
  {
    await newProd();
    const c = await cur(), L = await list();
    ok(c.id === null && c.src === false && L.length === 1 && L[0].id === A.id, '새 제품을 시작해도 A가 목록에 그대로 있고, 빈 새 제품은 안 생긴다');
    const has = await idbHas(A.ids);
    ok(Object.values(has).every(Boolean), '새 제품으로 바꿔도 A의 사진 5장은 보관소에서 지워지지 않는다(예전에는 지워졌어요)');
    await addSrc('B제품 안방문');
    await W(() => window.__wj.libSaveNow());
    const L2 = await list();
    B = L2.find((e) => e.name === 'B제품 안방문');
    ok(L2.length === 2 && B && B.id !== A.id && B.n === 1, '새 제품에 사진을 넣으면 목록에 B가 따로 생긴다(총 2개)');
  }

  /* 4. 목록 창 */
  {
    await page.click('#btnLib'); await page.waitForSelector('.libc');
    const cards = await page.$$eval('.libc', (a) => a.map((c) => ({ t: c.textContent.replace(/\s+/g, ' '), cur: c.classList.contains('cur'), open: !!c.querySelector('[data-lib="open"]'), del: !!c.querySelector('[data-lib="del"]'), img: !!c.querySelector('img') })));
    ok(cards.length === 2 && /B제품 안방문/.test(cards[0].t) && /A제품 거실문/.test(cards[1].t), '목록은 최근에 만진 것이 위에 온다(B, A)');
    ok(cards[0].cur && /지금 열려 있어요/.test(cards[0].t) && !cards[0].open && !cards[0].del, '지금 열린 B에는 "열기"·"지우기"가 없고 "지금 열려 있어요" 표시가 있다');
    ok(!cards[1].cur && cards[1].open && cards[1].del && cards[1].img && /사진 5장/.test(cards[1].t), 'A에는 열기·지우기 단추, 그림, "사진 5장"이 있다');
    ok(/2 \/ 20개/.test(await page.textContent('#libN')), '제목 옆에 "2 / 20개"가 나온다');
    ok(/이 주소의 이 브라우저에만/.test(await page.textContent('.dlg')), '"이 브라우저에만 있어요" 안내가 있다(다른 주소로는 안 보임)');
    await page.screenshot({ path: BASE + '/w/shots/lib_dialog.png' });
  }

  /* 5. A 열기 */
  {
    await page.click('.libc:not(.cur) [data-lib="open"]');
    await page.waitForFunction(() => document.getElementById('veil').hidden, null, { timeout: 8000 });
    await page.waitForTimeout(600);
    const c = await cur();
    ok(c.id === A.id && c.name === 'A제품 거실문' && c.src && c.doors === 4, 'A를 열면 이름·원본 사진·문 색 사진 4장이 그대로 돌아온다');
    const L = await list(), has = await idbHas(B.ids);
    ok(L.length === 2 && Object.values(has).every(Boolean), '열기 전에 B가 보관되어 있고 B의 사진도 그대로 있다');
    ok(/열었어요/.test(await page.textContent('#toast')), '"페이지를 열었어요" 알림이 뜬다');
    const sh = await page.$$eval('#paper .sec', (a) => a.length);
    ok(sh > 3, '열린 상세페이지가 미리보기에 그려진다');
  }

  /* 6. 새로 고침해도 목록·사진이 남고, B를 열 수 있다 */
  {
    await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' });
    await page.waitForFunction(() => window.__wj && window.__wj.LIB.ready, null, { timeout: 8000 }); await page.waitForTimeout(700);
    const L = await list(), c = await cur();
    ok(L.length === 2 && c.id === A.id && c.src, '새로 고침 뒤에도 목록 2개가 남고 지금 페이지(A)도 이어진다');
    ok((await btn()).trim() === '내 상세페이지 2', '새로 고침 뒤 단추에 개수 2가 나온다');
    await page.click('#btnLib'); await page.waitForSelector('.libc');
    await page.click('.libc:not(.cur) [data-lib="open"]'); await page.waitForFunction(() => document.getElementById('veil').hidden, null, { timeout: 8000 }); await page.waitForTimeout(500);
    const c2 = await cur();
    ok(c2.id === B.id && c2.name === 'B제품 안방문' && c2.src, '새로 고침 뒤에도 B를 열면 사진이 보관소에서 돌아온다');
  }

  /* 7. 이름 바꾸기 · 🔒 */
  {
    await page.click('#btnLib'); await page.waitForSelector('.libc');
    await page.click('.libc:not(.cur) [data-lib="name"]');
    await page.waitForSelector('.libin');
    await page.fill('.libin', '거실 문 손잡이(흰색)'); await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    ok(/거실 문 손잡이\(흰색\)/.test(await page.textContent('.libc:not(.cur)')) && (await list()).find((e) => e.id === A.id).label === '거실 문 손잡이(흰색)', 'Enter로 이름을 바꾸면 목록과 보관소에 반영된다');
    ok((await page.textContent('#veil .dlg')).length > 0 && !(await page.evaluate(() => document.getElementById('veil').hidden)), 'Enter로 이름을 바꿔도 창이 닫히지 않는다');
    await page.click('.libc:not(.cur) [data-lib="name"]'); await page.fill('.libin', '   '); await page.click('[data-lib="rensave"]'); await page.waitForTimeout(250);
    ok(/A제품 거실문/.test(await page.textContent('.libc:not(.cur)')), '이름을 비워 저장하면 제품 이름으로 돌아간다');
    await page.click('.libc:not(.cur) [data-lib="name"]'); await page.click('[data-lib="rencancel"]');
    ok(!(await page.$('.libin')), '이름 바꾸기를 취소하면 입력칸이 사라진다');
    await page.click('.libc:not(.cur) [data-lib="pin"]'); await page.waitForTimeout(250);
    ok((await list()).find((e) => e.id === A.id).pin === true && /🔒 안 지우는 중/.test(await page.textContent('.libc:not(.cur)')), '"안 지우기" 단추를 누르면 "🔒 안 지우는 중"으로 바뀐다');
    await page.click('#libClose');
  }

  /* 8. 가득 차면 가장 오래 안 만진 것부터 지운다(🔒·지금 열린 것은 빼고), 지워진 것의 사진도 보관소에서 정리 */
  {
    await W(() => { window.__wj.LIB.max = 3; });
    const mk = async (n) => { await newProd(); await addSrc(n); await W(() => window.__wj.libSaveNow()); };
    await mk('C제품'); await page.waitForTimeout(30);
    const L1 = await list();
    ok(L1.length === 3 && L1.some((e) => e.id === A.id), '한도(3)까지는 아무것도 안 지워진다(A, B, C)');
    const bIds = B.ids.slice();
    await mk('D제품');
    const L2 = await list(), cD = await cur();
    ok(L2.length === 3 && !L2.some((e) => e.id === B.id) && L2.some((e) => e.id === A.id) && L2.some((e) => e.id === cD.id), '한도를 넘으면 가장 오래 안 만진 B가 지워지고, 🔒 한 A와 지금 열린 D는 남는다');
    const has = await idbHas(bIds);
    ok(Object.values(has).every((v) => !v), '지워진 B가 쓰던 사진은 보관소에서도 정리된다(공간이 새지 않는다)');
    ok(/B제품 안방문.*지웠어요/.test(await page.textContent('#toast')), '자동으로 지웠을 때 어떤 페이지를 지웠는지 알려 준다');
    const hasA = await idbHas(A.ids);
    ok(Object.values(hasA).every(Boolean), '🔒 한 A의 사진은 그대로 있다');
  }

  /* 9. 지우기(두 번 확인) · 지금 열린 것은 못 지움 */
  {
    await W(() => { window.__wj.LIB.max = 20; });
    await page.click('#btnLib'); await page.waitForSelector('.libc');
    const before = (await list()).length;
    const target = await page.$$eval('.libc', (a) => a.map((c) => ({ id: c.dataset.id, cur: c.classList.contains('cur'), t: c.textContent })).filter((c) => !c.cur && /C제품/.test(c.t))[0]);
    await page.click('.libc[data-id="' + target.id + '"] [data-lib="del"]');
    ok(/정말 지울까요/.test(await page.textContent('.libc[data-id="' + target.id + '"]')) && (await list()).length === before, '✕를 한 번 누르면 바로 지우지 않고 "정말 지울까요?"를 묻는다');
    await page.click('.libc[data-id="' + target.id + '"] [data-lib="delno"]');
    ok((await page.$('.libc[data-id="' + target.id + '"] [data-lib="open"]')) && (await list()).length === before, '취소하면 그대로 남는다');
    const cIds = (await list()).find((e) => e.id === target.id).ids.slice();
    await page.click('.libc[data-id="' + target.id + '"] [data-lib="del"]'); await page.click('.libc[data-id="' + target.id + '"] [data-lib="delgo"]'); await page.waitForTimeout(400);
    ok((await list()).length === before - 1 && !(await page.$('.libc[data-id="' + target.id + '"]')), '"지우기"를 누르면 목록에서 사라진다');
    ok(Object.values(await idbHas(cIds)).every((v) => !v), '지운 C의 사진도 보관소에서 정리된다');
    const dcur = await page.$('.libc.cur [data-lib="del"]');
    ok(!dcur, '지금 열린 페이지에는 지우기 단추가 없다');
    await page.click('#libClose');
  }

  /* 10. 사진을 바꾸면 이전 사진이 보관소에 쌓이지 않는다 */
  {
    const before = await cur(), oldId = before.srcId;
    await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#a33'; g.fillRect(0, 0, 300, 300); g.fillStyle = '#fff'; g.fillRect(90, 120, 120, 60); const b = await new Promise((r) => c.toBlob(r, 'image/png')); await window.__wj.setPhoto('src', b); });
    await W(() => window.__wj.libSaveNow()); await page.waitForTimeout(300);
    const after = await cur(), ent = (await list()).find((e) => e.id === after.id);
    const has = await idbHas([oldId, after.srcId]);
    ok(after.srcId !== oldId && ent.ids.includes(after.srcId) && !ent.ids.includes(oldId), '보관 항목이 새 사진을 가리키고 이전 사진은 뺀다');
    ok(has[after.srcId] === true && has[oldId] === false, '바꾼 뒤 이전 사진은 보관소에서 지워지고 새 사진은 남는다(쌓이지 않는다)');
  }

  /* 11. 만드는 중에는 열지 않는다 */
  {
    const L = await list(), id0 = (await cur()).id, other = L.find((e) => e.id !== id0);
    await W(() => { window.__wj.G.busy = true; });
    const r = await W((id) => window.__wj.libOpen(id), other.id);
    ok(r === false && (await cur()).id === id0 && /만들거나 저장하는 중/.test(await page.textContent('#toast')), '구글이 사진을 만드는 중에는 다른 페이지를 열지 않고 안내만 한다');
    await W(() => { window.__wj.G.busy = false; });
    const nb = await page.evaluate(() => { window.__wj.G.busy = true; document.getElementById('btnLib').click(); const shown = !document.getElementById('veil').hidden; window.__wj.G.busy = false; return shown; });
    ok(nb === false, '만드는 중에는 "내 상세페이지" 단추도 창을 열지 않는다');
  }

  /* 12. 파일(zip)로 내려받고 → 다른 곳에서 불러오기: 새 페이지로 들어가고 기존 페이지를 덮어쓰지 않는다 */
  {
    const c0 = await cur(), L0 = await list();
    await page.click('#btnLib'); await page.waitForSelector('.libc');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('.libc.cur [data-lib="zip"]')]);
    const zp = BASE + '/w/lib_test.zip'; await dl.saveAs(zp);
    const z = await JSZipN.loadAsync(fs.readFileSync(zp)), st = JSON.parse(await z.files['state.json'].async('string')), idx = JSON.parse(await z.files['photos/index.json'].async('string'));
    ok(st.libId === c0.id && idx.length === L0.find((e) => e.id === c0.id).ids.length && z.files['photos/' + idx[0].id + '.bin'], '"파일" 단추: 지금 페이지의 글과 사진이 zip에 들어 있다(기존 작업 저장과 같은 모양)');
    await page.click('#libClose');
    await page.waitForTimeout(200);
    await newProd();
    const nBefore = (await list()).length;
    await page.setInputFiles('#loadFile', zp); await page.waitForTimeout(1800);
    await W(() => window.__wj.libSaveNow()); await page.waitForTimeout(200);
    const c2 = await cur(), L2 = await list();
    ok(c2.src && c2.id !== c0.id && L2.length === nBefore + 1 && L2.find((e) => e.id === c0.id), 'zip을 불러오면 새 번호의 새 페이지로 보관되고, 원래 페이지는 덮어쓰이지 않는다');
  }

  /* 13. 이미 쓰던 사람(예전 버전에서 저장된 작업) 열 때: 처음 한 번 자동으로 보관 */
  {
    await page.evaluate(() => { const S = window.__wj.S(); delete S.libId; });
    await W(() => window.__wj.libSaveNow());
    ok((await cur()).id !== null, 'libId 없는 작업(예전 저장본)도 보관하면 번호가 생긴다');
  }

  /* 14. 되살리기(이전 작업)와 같이 써도 번호가 꼬이지 않고, 보관본에는 이전 제품 사본이 안 들어간다 */
  {
    await putDoors(page, 2, true);   // AI로 만든 사진이 있어야 "이전 작업 되살리기"용 사본이 생겨요
    await W(() => window.__wj.libSaveNow());
    const prevC = await cur();
    await newProd();
    const c1 = await cur();
    ok(c1.id === null && await W(() => !!window.__wj.S().prev), '새 제품 직후: 번호는 비어 있고 "이전 작업 되살리기"용 사본(prev)이 생긴다');
    await addSrc('E제품'); await W(() => window.__wj.libSaveNow());
    const idE = (await cur()).id;
    const pv = await W(async (id) => { const e = await window.__wj.idb.get('lib:' + id); return JSON.parse(e.s).prev; }, idE);
    ok(pv === null, '보관본에는 이전 제품 사본(prev)을 넣지 않는다(지운 페이지의 사진이 다른 항목 안에 남지 않게)');
    await W(() => document.querySelector('[data-act="restoreprev"]').click()); await page.waitForTimeout(900);
    const c2 = await cur();
    ok(c2.id === prevC.id && c2.src, '"이전 작업 되살리기"를 누르면 이전 페이지(같은 번호)로 돌아온다');
    await W(() => window.__wj.libSaveNow());
    const L = await list();
    ok(L.some((e) => e.id === idE) && L.some((e) => e.id === prevC.id) && new Set(L.map((e) => e.id)).size === L.length, '되살린 뒤에도 E와 이전 페이지가 목록에 한 번씩만 있다');
  }

  /* 15. 새 제품 안내 글이 보관 사실을 알려 준다 */
  {
    await page.click('#btnNew'); await page.waitForSelector('#nwGo');
    ok(/내 상세페이지<\/b>에 자동으로 보관/.test(await page.innerHTML('#veil .dlg')), '새 제품 창이 "내 상세페이지에 자동으로 보관돼요"라고 알려 준다');
    await page.click('#nwNo');
  }

  ok(errors.length === 0, '화면 오류·콘솔 오류가 없다' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); server.close();
  console.log(fails ? ('실패 ' + fails + '개') : '모두 통과'); process.exit(fails ? 1 : 0);
})();
