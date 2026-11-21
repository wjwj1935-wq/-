/* 자동몰 상세페이지 제작기 v97 — 사고 싶게 만드는 구역(핵심 포인트·문 맞춤·설치 그림·FAQ) */
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
  const W = (page, fn, a) => page.evaluate(fn, a);
  const redraw = async (page) => { const v = await page.inputValue('[data-k="name"]'); await page.fill('[data-k="name"]', v + ' '); await page.fill('[data-k="name"]', v); await page.waitForTimeout(350); };
  const cards = (page) => W(page, () => window.__wj.pointCards().map((c) => ({ k: c.k, big: c.big, title: c.title, body: c.body, chip: c.chip })));
  const sec = (page, slice) => page.locator('#paper [data-slice="' + slice + '"]');
  const DEF_MEMO = '레버 작동 각도는 30도이고, 내려갔다 원위치로 돌아와요. 적은 동작으로 열려요(우리 회사 제품의 특징이에요).';

  /* 1. 핵심 포인트: 적어 둔 사실이 있을 때만 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    let C = await cards(page);
    ok(C.length === 2 && C[0].k === 'angle' && C[0].big === '30°' && C[1].k === 'maker' && C[1].big === '11', '처음 상태: 작동 각도(30°)와 회사 소개 첫 숫자(등록 특허 11) 카드만 있다 → ' + C.map((c) => c.k + ':' + c.big).join(', '));
    ok(/30도만 내리면 열려요/.test(C[0].body) && /제자리로 돌아와요/.test(C[0].body), '각도 카드 글은 "아는 내용"에 적힌 말(30도 · 원위치로 돌아와요)에서 나온다');
    ok(await sec(page, '01_핵심포인트').count() === 1 && /이 손잡이를 고르는 이유/.test(await sec(page, '01_핵심포인트').textContent()), '첫 화면 바로 아래에 "이 손잡이를 고르는 이유" 구역이 생긴다');
    const names = await W(page, () => [...document.querySelectorAll('#paper [data-slice]')].map((s) => s.dataset.slice));
    ok(names[0] === '01_첫화면' && names[1] === '01_핵심포인트' && names[2] === '02_소개', '순서: 첫 화면 → 핵심 포인트 → 소개 → ' + names.slice(0, 4).join(', '));
    const img = await W(page, async () => { const im = document.querySelector('#paper .ptd'); await im.decode(); return { w: im.naturalWidth, h: im.naturalHeight, src: im.src.slice(0, 22) }; });
    ok(img.w === 660 && img.h === 528 && /^data:image\/png/.test(img.src), '작동 각도 그림이 이미지로 들어간다(660×528, 화면에서 직접 그림)');
    const red = await W(page, async () => { const im = document.querySelector('#paper .ptd'), c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let r = 0, b = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] < 110) r++; if (d[i] < 80 && d[i + 1] > 60 && d[i + 1] < 120 && d[i + 2] > 130) b++; } return { r, b }; });
    ok(red.r > 400 && red.b > 300, '그림에 빨간 각도 호와 파란 "누른 자리" 선이 그려져 있다(빨강 ' + red.r + '점 · 파랑 ' + red.b + '점)');
    // 각도 바꾸기 · 없애기
    await setS(page, "S.memo='무광 니켈 마감이에요.';"); await redraw(page);
    ok(!(await cards(page)).some((c) => c.k === 'angle'), '"아는 내용"에 각도가 없으면 각도 카드를 만들지 않는다(지어내지 않는다)');
    await setS(page, "S.points.angle='45';"); await redraw(page);
    C = await cards(page);
    ok(C[0].k === 'angle' && C[0].big === '45°' && !/제자리/.test(C[0].body), '각도 칸에 45를 적으면 45° 카드가 생기고, "돌아와요"는 적지 않았으니 안 쓴다');
    await setS(page, "S.points.angle='0';"); await redraw(page);
    ok(!(await cards(page)).some((c) => c.k === 'angle'), '각도 칸에 0을 적으면 각도 카드를 뺀다');
    await setS(page, "S.points.angle='';S.memo=" + JSON.stringify(DEF_MEMO) + ";S.points.aTitle='가볍게 열리는 레버';S.points.aBody='직접 쓴 설명';"); await redraw(page);
    C = await cards(page);
    ok(C[0].title === '가볍게 열리는 레버' && C[0].body === '직접 쓴 설명', '각도 카드의 제목·설명을 직접 쓰면 그 글을 쓴다');
    // 규격을 적으면 카드가 늘어난다
    await setS(page, "S.facts.thick='32-45';S.facts.backset='60';S.facts.bore='54';S.facts.finish='무광 니켈';S.facts.material='아연 합금';"); await redraw(page);
    C = await cards(page);
    const fit = C.find((c) => c.k === 'fit'), fin = C.find((c) => c.k === 'finish');
    ok(fit && fit.big === '32-45mm' && /백셋\s60mm · 문\s구멍\s지름\s54mm/.test(fit.body), '문 두께를 적으면 "32-45mm · 이 두께의 문에 맞아요" 카드가 생긴다');
    ok(fin && fin.big === '무광 니켈' && fin.title === '마감·색상' && /재질 아연 합금/.test(fin.body), '마감을 적으면 마감 카드가 생긴다');
    await putDoors(page, 4, true); await redraw(page);
    C = await cards(page);
    ok(C.find((c) => c.k === 'doors') && C.find((c) => c.k === 'doors').big === '4가지', '문 색 사진이 3장 이상이면 "4가지 · 문 색별로 미리 확인" 카드가 생긴다');
    // 첫 화면·마지막 딱지
    const chips = await W(page, () => ({ hero: [...document.querySelectorAll('#paper .hero .hk span')].map((s) => s.textContent), cta: [...document.querySelectorAll('#paper .cta .hk span')].map((s) => s.textContent) }));
    ok(chips.hero.length === 3 && chips.hero[0] === '30° 가벼운 작동' && chips.hero[1] === '문 두께 32-45mm' && chips.cta.join() === chips.hero.join(), '첫 화면과 마지막 문구 아래에 딱지 3개가 나온다 → ' + chips.hero.join(' / '));
    await setS(page, "S.points.hide.doors=true;S.points.custom[0]={big:'좌우 공용',title:'어느 방향 문에도',body:''};"); await redraw(page);
    C = await cards(page);
    ok(!C.find((c) => c.k === 'doors') && C.find((c) => c.k === 'c0') && C.find((c) => c.k === 'c0').big === '좌우 공용', '"카드 빼기"에 체크하면 그 카드가 빠지고, 직접 쓴 카드는 들어간다');
    await setS(page, "S.points.chips=false;"); await redraw(page);
    ok(await page.locator('#paper .hk').count() === 0, '딱지 넣기를 끄면 첫 화면·마지막의 딱지가 사라진다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 우리 집 문에 맞을까요? */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    ok(/제품 규격/.test(await sec(page, '02_규격').textContent()) && await page.locator('#paper .fitc').count() === 0, '규격을 안 적었으면 예전처럼 "제품 규격" 안내 칸만 있다');
    await setS(page, "S.facts.thick='32-45';S.facts.material='아연 합금';"); await redraw(page);
    let t = await sec(page, '02_규격').textContent();
    ok(/우리 집 문에 맞을까요\?/.test(t) && /아래 1가지만 재서/.test(t) && await page.locator('#paper .fitc').count() === 1 && await page.locator('#paper .fitg.n1').count() === 1, '문 두께만 적으면 재는 그림 카드가 1개만 나온다(적은 값만)');
    await setS(page, "S.facts.backset='60';S.facts.bore='54';"); await redraw(page);
    const fc = await W(page, async () => { const out = []; for (const c of document.querySelectorAll('#paper .fitc')) { const im = c.querySelector('img'); await im.decode(); out.push({ l: c.querySelector('span').textContent, v: c.querySelector('b').textContent, w: im.naturalWidth }); } return out; });
    ok(fc.length === 3 && fc.map((c) => c.l + ' ' + c.v).join(' | ') === '문 두께 32-45mm | 백셋 60mm | 문 구멍 지름 54mm' && fc.every((c) => c.w === 400), '세 값을 다 적으면 그림 카드 3개: ' + fc.map((c) => c.l + ' ' + c.v).join(' | '));
    ok(/아래 3가지만 재서/.test(await sec(page, '02_규격').textContent()) && await page.locator('#paper .fxrow').count() === 4 && await page.locator('#paper .fxh').count() === 1, '그림 카드 아래에 기존 규격 표(4줄)가 그대로 있다');
    await setS(page, "S.facts.lock='없음(통로용)';"); await redraw(page);
    ok(/잠금 기능\s*없음\(통로용\)/.test((await sec(page, '02_규격').textContent()).replace(/\s+/g, ' ')), '"잠금 기능"을 적으면 규격 표에 한 줄 더 나온다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3. 설치 안내: 그림 6단계 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    ok(await W(page, () => window.__wj.guideMode()) === 'pics', '순서 글을 고친 적이 없으면 그림 6단계로 보여 준다');
    const g = await W(page, async () => { const out = []; for (const c of document.querySelectorAll('#paper .gpc')) { const im = c.querySelector('img'); await im.decode(); out.push({ n: c.querySelector('.gpi i').textContent, t: c.querySelector('h3').textContent, w: im.naturalWidth, h: im.naturalHeight, jpg: /^data:image\/jpeg/.test(im.src) }); } return out; });
    ok(g.length === 6 && g.map((x) => x.n).join('') === '123456' && g.every((x) => x.w === 1104 && x.jpg), '설치 그림 6장이 실제로 열리는 이미지로 들어 있다(1104px, 번호 1~6)');
    ok(g.map((x) => x.t).join(' → ') === '백셋 재기 → 래치 넣기 → 바깥 손잡이 끼우기 → 안쪽 손잡이와 나사 → 받이판 달기 → 작동 확인', '순서: ' + g.map((x) => x.t).join(' → '));
    const distinct = await W(page, () => new Set(window.__wj.GUIDE_IMG.map((u) => u.length + ':' + u.slice(200, 260))).size);
    ok(distinct === 6, '6장이 서로 다른 그림이다');
    ok(/일반적인 레버형 손잡이의 설치 순서를 보여 주는 예시 그림/.test(await sec(page, '06_설치안내2').textContent()) && await sec(page, '06_설치안내').locator('.gpc').count() === 3 && await sec(page, '06_설치안내2').locator('.gpc').count() === 3, '그림 아래에 "예시 그림이에요. 제품 모양·구성품과 다를 수 있어요"가 적혀 있다');
    ok(!/\d+\s*mm/.test(await sec(page, '06_설치안내').textContent() + await sec(page, '06_설치안내2').textContent()), '설치 글에는 숫자 치수를 넣지 않았다(제품마다 달라서)');
    await setS(page, "S.guide.ps[0].t='구멍 위치 재기';S.guide.ps[0].d='직접 고친 설명';"); await redraw(page);
    ok(/구멍 위치 재기/.test(await sec(page, '06_설치안내').textContent()) && /직접 고친 설명/.test(await sec(page, '06_설치안내').textContent()), '단계 제목·설명을 고치면 그대로 나온다');
    await setS(page, "S.guide.mode='text';"); await redraw(page);
    ok(await page.locator('#paper .gpc').count() === 0 && await page.locator('#paper .gs').count() === 5, '"글로만"으로 바꾸면 예전 5줄 순서로 돌아간다');
    await setS(page, "S.guide.mode='';S.guide.steps[0]='우리 제품만의 순서 글';"); await redraw(page);
    ok(await W(page, () => window.__wj.guideMode()) === 'text' && /우리 제품만의 순서 글/.test(await sec(page, '06_설치안내').textContent()), '순서 글을 직접 고쳐 둔 작업은 (자동일 때) 글로만 그대로 둔다');
    // 예전 저장본을 열어도
    const old = await W(page, () => { const w = window.__wj, S = JSON.parse(JSON.stringify(w.S())); delete S.points; S.guide = { eyebrow: 'GUIDE', title: '이렇게 진행돼요', time: '', steps: ['기존 손잡이와 나사를 풀어 떼어 내요.', '문 앞면의 받침을 문에 먼저 고정해요.', '전체와 바깥쪽 손잡이를 문 구멍에 맞춰 끼워요.', '나사를 조여 손잡이를 단단히 고정해요.', '레버를 눌러 문이 잘 열리고 닫히는지 확인해요.'] }; const r = w.fromSaved(S); return { pts: !!r.points && r.points.custom.length === 2 && typeof r.points.hide === 'object', ps: r.guide.ps.length, note: r.guide.picNote, steps: r.guide.steps.length }; });
    ok(old.pts && old.ps === 6 && /예시 그림/.test(old.note) && old.steps === 5, '예전 버전에서 저장한 작업을 열어도 새 칸(핵심 포인트·그림 6단계)이 채워진다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 4. 자주 묻는 질문: 규격을 반영한 답 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const faq = () => W(page, () => [...document.querySelectorAll('#paper [data-slice="07_질문"] .qa')].map((q) => ({ q: q.querySelector('.q span').textContent, a: q.querySelector('.a').innerText })));
    let F = await faq();
    ok(/문 두께와 문 구멍\(백셋\) 크기를 먼저 확인해 주세요/.test(F[0].a) && /판매자에게 확인해 주세요/.test(F[1].a), '규격을 안 적었으면 처음 문구 그대로다');
    await setS(page, "S.facts.thick='32-45';S.facts.backset='60';S.facts.bore='54';S.facts.finish='무광 니켈';S.facts.parts='손잡이 1세트, 래치, 받이판, 나사';S.facts.lock='없음(통로용)';S.facts.dir='좌우 공용';"); await redraw(page);
    F = await faq();
    ok(/문 두께 32-45mm, 백셋 60mm, 문 구멍 지름 54mm인 문에 맞아요/.test(F[0].a), '"우리 집 문에 맞나요?" → 적어 둔 세 값으로 답한다');
    ok(/잠금 기능: 없음\(통로용\)/.test(F[1].a) && /마감·색상은 무광 니켈/.test(F[2].a), '"잠금 기능" · "색상" 질문도 적어 둔 값으로 답한다');
    ok(/설치 방법 그림 순서대로/.test(F[3].a) && /구성품: 손잡이 1세트, 래치, 받이판, 나사/.test(F[3].a), '"혼자 달 수 있나요?" → 설치 그림을 가리키고 구성품을 알려 준다');
    ok(/좌우 방향: 좌우 공용/.test(F.find((x) => /방향/.test(x.q)).a), '"열리는 방향" 질문 → 적어 둔 좌우 방향으로 답한다');
    await setS(page, "S.faq.items[0].a='제가 직접 고친 답이에요.';"); await redraw(page);
    ok((await faq())[0].a === '제가 직접 고친 답이에요.', '답을 직접 고치면 고친 글을 그대로 쓴다(자동으로 바꾸지 않는다)');
    ok(await W(page, () => window.__wj.S().faq.items[1].a) === '잠금 기능과 관련해서는 판매자에게 확인해 주세요.', '저장된 답 글 자체는 바꾸지 않는다(보여 줄 때만 구체적으로)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 5. 고치는 칸(4단계) */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await W(page, () => { const d = document.querySelector('#p4'); d.open = true; const s = document.querySelector('#s-points'); s.open = true; });
    await page.waitForSelector('[data-k="points.angle"]');
    await page.fill('[data-k="points.angle"]', '25'); await page.waitForTimeout(300);
    ok((await cards(page))[0].big === '25°' && /25°/.test(await sec(page, '01_핵심포인트').textContent()), '4단계 "핵심 포인트"에서 각도 칸을 고치면 미리보기가 바로 바뀐다');
    await page.check('[data-chk="points.hide.maker"]'); await page.waitForTimeout(300);
    ok(!(await cards(page)).some((c) => c.k === 'maker'), '"제조사 카드 빼기"에 체크하면 그 카드가 빠진다');
    await page.fill('[data-k="points.custom.0.big"]', '좌우 공용'); await page.fill('[data-k="points.custom.0.title"]', '어느 방향 문에도'); await page.waitForTimeout(300);
    ok(/좌우 공용/.test(await sec(page, '01_핵심포인트').textContent()), '직접 쓰는 카드 칸에 적으면 카드가 생긴다');
    await W(page, () => { document.querySelector('#s-guide').open = true; });
    await page.selectOption('[data-k="guide.mode"]', 'text'); await page.waitForTimeout(300);
    ok(await page.locator('#paper .gs').count() === 5 && await page.locator('#paper .gpc').count() === 0, '설치 안내의 "보여 주는 방식"을 "글로만"으로 고르면 바로 바뀐다');
    await page.selectOption('[data-k="guide.mode"]', 'pics'); await page.waitForTimeout(300);
    ok(await page.locator('#paper .gpc').count() === 6 && await page.locator('[data-k="guide.ps.5.t"]').count() === 1 && await page.locator('[data-k="facts.lock"]').count() === 1, '그림 6단계의 글 칸 6쌍과 "잠금 기능" 칸이 있다');
    // 미리보기에서 새 구역을 누르면 그 칸으로 간다
    await page.click('#paper [data-slice="01_핵심포인트"] h2'); await page.waitForTimeout(300);
    ok(await W(page, () => document.activeElement && document.activeElement.dataset.k) === 'points.title', '미리보기에서 "이 손잡이를 고르는 이유"를 누르면 그 글 칸으로 간다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 6. 이미지로 저장했을 때도 새 구역이 그림으로 나온다 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await putDoors(page, 4, true);
    await setS(page, "S.facts.thick='32-45';S.facts.backset='60';S.facts.bore='54';S.hero.title='우리 집 문에 깔끔하게';"); await redraw(page);
    const html = await W(page, () => window.__wj.renderPage(true));
    ok(/data-slice="01_핵심포인트"/.test(html) && !/data-jump/.test(html) && /class="gpc"/.test(html) && /class="fitc"/.test(html) && /class="hk hkc"/.test(html) && !/class="hk"/.test(html), '저장용 그림(내보내기)에도 핵심 포인트·문 맞춤 카드·설치 그림·마지막 딱지가 들어간다(첫 화면이 임시 사진 카드일 때는 첫 화면 딱지를 뺀다)');
    // 실제 html2canvas로 구역을 그려 본다: 핵심 포인트 · 규격 · 설치 안내
    const shot = await W(page, async () => {
      const host = document.createElement('div'); host.className = 'export-host'; host.innerHTML = '<div class="pg" id="tRoot">' + window.__wj.renderPage(true) + '</div>'; document.body.appendChild(host);
      await Promise.all([...host.querySelectorAll('img')].map((im) => im.decode().catch(() => {})));
      const out = {};
      for (const name of ['01_핵심포인트', '02_규격', '06_설치안내', '06_설치안내2']) {
        const el = host.querySelector('[data-slice="' + name + '"]'), cv = await html2canvas(el, { scale: 1, useCORS: true, backgroundColor: '#ffffff', logging: false }), g = cv.getContext('2d');
        const reg = (x0, y0, x1, y1) => { const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let r = 0, gg = 0, b = 0, n = 0, mn = 255, mx = 0; for (let i = 0; i < d.length; i += 16) { const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; if (l < mn) mn = l; if (l > mx) mx = l; } return { r: r / n, g: gg / n, b: b / n, range: mx - mn }; };
        const rect = (sel) => { const e = el.querySelector(sel); if (!e) return null; const a = e.getBoundingClientRect(), b = el.getBoundingClientRect(); return [Math.round(a.left - b.left), Math.round(a.top - b.top), Math.round(a.right - b.left), Math.round(a.bottom - b.top)]; };
        out[name] = { w: cv.width, h: cv.height };
        if (name === '01_핵심포인트') { const r = rect('.ptd'); out[name].dia = reg(r[0] + 10, r[1] + 10, r[2] - 10, r[3] - 10); const f = rect('.ptf'); out[name].card = reg(f[2] - 60, f[1] + 20, f[2] - 20, f[1] + 60); }
        if (name === '02_규격') { const r = rect('.fitc img'); out[name].img = reg(r[0] + 4, r[1] + 4, r[2] - 4, r[3] - 4); }
        if (/^06_설치안내/.test(name)) { const r = rect('.gpi'); out[name].img = reg(r[0] + 100, r[1] + 60, r[2] - 100, r[3] - 60); }
      }
      host.remove(); return out;
    });
    ok(shot['01_핵심포인트'].w === 860 && shot['01_핵심포인트'].dia.range > 120 && shot['01_핵심포인트'].card.b > shot['01_핵심포인트'].card.r + 15, '이미지로 그려도 각도 그림이 보이고(밝기 차이 ' + shot['01_핵심포인트'].dia.range.toFixed(0) + ') 카드 바탕이 남색이다');
    ok(shot['02_규격'].img.range > 60, '이미지로 그려도 "재는 곳" 그림이 보인다(밝기 차이 ' + shot['02_규격'].img.range.toFixed(0) + ')');
    ok(shot['06_설치안내'].img.range > 40 && shot['06_설치안내'].img.r > shot['06_설치안내'].img.b - 5 && shot['06_설치안내2'].img.range > 40 && shot['06_설치안내'].h > 1500 && shot['06_설치안내'].h < 2500 && shot['06_설치안내2'].h > 1500 && shot['06_설치안내2'].h < 2500, '이미지로 그려도 설치 그림(나무 문 색)이 보이고, 두 조각(1~3번 ' + shot['06_설치안내'].h + 'px · 4~6번 ' + shot['06_설치안내2'].h + 'px)으로 나뉘어 한 조각이 2500px를 넘지 않는다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? ('실패 ' + fails + '개') : '모두 통과'); process.exit(fails ? 1 : 0);
})();
