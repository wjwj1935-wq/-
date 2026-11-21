/* 자동몰 상세페이지 제작기 v92 — 영상 제목·설명·태그를 클로드가 자동으로 (클로드는 가짜) */
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

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 요청 내용 · 걸러내기 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await setS(page, "S.name='메탈 방문 손잡이';S.hero.title='은은한 은색 레버';S.size=Object.assign({},S.size,{shape:'rect',shapeSet:'user',capW:'70',capH:'54',len:'150'});S.facts.thick='32-45';S.cta.title='우리 집 문에 달아 보세요';");
    await putDoors(page, 4, true);
    const f = await page.evaluate(() => window.__wj.postFacts());
    ok(/제품 이름: 메탈 방문 손잡이/.test(f) && /크기·규격\(영상에 나와요\): 캡 중심 ~ 레버 끝 150mm \/ 받침\(캡\) 크기 70 × 54mm/.test(f) && /영상 속 문 사진 4장: 화이트 도어, 월넛 우드 도어/.test(f) && /AI로 만든 사진 사용: 예/.test(f), '클로드에게 줄 "확인된 정보": 제품 이름·크기 규격·영상 속 문 사진 4장·AI 사진 사용 여부가 들어 있다');
    const pr = await page.evaluate(() => window.__wj.POST_PROMPT(window.__wj.postFacts()));
    ok(/알 수 없는.*|확인된 정보에 없는 사양·치수·재질·인증·수치·가격·날짜·실적은 절대 쓰지 마세요/.test(pr) && /과장\(최고·최초·완벽·100%·유일·혁신·무조건\)/.test(pr) && /titles: 쇼츠 제목 후보 3개. 각 40자 이내/.test(pr), '요청문에 "없는 사양·숫자 금지 · 과장·가격 금지 · 제목 후보 3개(40자)" 규칙이 있다');
    const N = await page.evaluate((RAW) => {
      const w = window.__wj, al = w.postAllowed(), bad = Object.assign({}, RAW, { titles: ['최고의 방문 손잡이를 만나보세요', '방문 손잡이 2.5kg 초경량', '방문 손잡이 레버 | 문에 달면', '방문 손잡이 레버 | 문에 달면', '   ', '레버 손잡이 150mm 한눈에'], desc: '문에 달면 이렇게 보여요. 무게는 500g이에요. 지금 할인 중이에요! 받침은 70 × 54mm예요.\n궁금한 점은 판매자에게 물어보세요.', tags: ['방문손잡이', '#레버 손잡이', '최고손잡이', '2026신상', '방문손잡이'], hashtags: ['방문손잡이', '#가격할인', '#인테리어'], pinned: '가격이 궁금하면 댓글 주세요. 문 두께를 알려 주세요.' });
      const a = w.postNorm(bad, al); let err = null; try { w.postNorm({ titles: ['최고', '100%'] }, al); } catch (e) { err = e && e.code; }
      return { a, err, al: [...al].sort() };
    }, RAW);
    ok(JSON.stringify(N.a.titles) === JSON.stringify(['방문 손잡이 레버 | 문에 달면', '레버 손잡이 150mm 한눈에']) && N.a.dropped >= 2, '제목 후보: 과장("최고")·없는 숫자(2.5kg)·빈 것·중복은 빼고, 있는 숫자(150mm)는 남긴다 → ' + JSON.stringify(N.a.titles));
    ok(/70 × 54mm/.test(N.a.desc) && !/500g/.test(N.a.desc) && !/할인/.test(N.a.desc) && /판매자에게 물어보세요/.test(N.a.desc), '설명: 새 숫자(500g)·할인 문장은 빼고, 규격(70 × 54mm)·안내 문장은 남긴다 → ' + JSON.stringify(N.a.desc));
    ok(JSON.stringify(N.a.tags) === JSON.stringify(['방문손잡이', '레버손잡이']) && JSON.stringify(N.a.hashtags) === JSON.stringify(['#방문손잡이', '#인테리어']), '태그: # 떼고 띄어쓰기 없앰, 중복·과장·없는 숫자·가격 말 빼고, 해시태그는 #를 붙인다 → ' + JSON.stringify(N.a.tags) + ' ' + JSON.stringify(N.a.hashtags));
    ok(!/가격/.test(N.a.pinned) && /문 두께를 알려 주세요/.test(N.a.pinned), '고정 댓글: 가격 말이 든 문장만 빼고 나머지는 남긴다');
    ok(N.err === 'invalid_json', '쓸 만한 제목이 하나도 없으면 실패로 처리한다(기본 문구를 그대로 둔다)');
    ok(N.al.includes('150') && N.al.includes('70') && N.al.includes('54') && N.al.includes('4') && !N.al.includes('500'), '글에 써도 되는 숫자는 입력한 값과 영상에 들어간 문 사진 수(4)뿐이다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 영상이 만들어지면 자동으로 · 후보 단추 · 되돌리기 · 직접 고치면 건드리지 않음 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await setS(page, "S.name='메탈 방문 손잡이';S.size=Object.assign({},S.size,{shape:'rect',shapeSet:'user',capW:'70',capH:'54',len:'150'});S.about.body='우리는 안전을 가장 먼저 생각해요.';");
    await putDoors(page, 4, true);
    await page.evaluate((raw) => { window.__postRaw = raw; }, RAW);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    const draft0 = await page.evaluate(() => window.__wj.vPostDraft().ys.t);
    await fake(page); await page.evaluate(() => window.__wj.showVideo()); await waitPost(page);
    let lg = await postLogs(page);
    ok(lg.length === 1 && lg[0].n === 0 && lg[0].tier === 'default', '영상이 보이면 클로드가 자동으로 한 번 쓴다(사진 없이 글만, 정확한 모델)');
    ok(await vp(page, 'ys.t') === '방문 손잡이 레버 | 문에 달면 이렇게 보여요' && await page.evaluate(() => window.__wj.VD.post.yl.t) === '방문 손잡이 레버 | 문에 달면 이렇게 보여요', '쇼츠 제목 칸과 가로 영상 제목에 첫 후보가 들어간다(기본 문구 "' + draft0.slice(0, 14) + '…" 대신)');
    const ysd = await vp(page, 'ys.d');
    ok(/문에 달면 어떻게 보이는지/.test(ysd) && /#방문손잡이 #인테리어 #레버손잡이/.test(ysd) && /※ 영상 속 문 사진은 AI로 만든 연출 이미지예요\./.test(ysd) && /안전을 가장 먼저 생각해요/.test(ysd), '설명: 클로드 글 + 해시태그 + AI 연출 이미지 안내(앱이 붙임) + 회사 소개의 안전 문장');
    ok(await vp(page, 'ys.g') === '방문손잡이, 레버손잡이, 손잡이교체, 문손잡이' && /문 두께를 알려 주세요/.test(await vp(page, 'ys.p')), '태그 칸과 고정 댓글 칸이 생기고 채워진다');
    ok(/문에 달면 이렇게 보여요\./.test(await vp(page, 'ig.d')) && /AI로 만든 연출/.test(await vp(page, 'tt.d')), '인스타그램·틱톡 문구도 새로 쓰고 AI 안내를 붙인다');
    ok((await page.locator('[data-valt]').count()) === 3 && /클로드가 쓴 제목·설명이에요/.test(await page.textContent('#vpBox')), '제목 후보 단추 3개와 안내 글이 나온다');
    await page.click('[data-valt="1"]'); await page.waitForTimeout(150);
    ok(await vp(page, 'ys.t') === '레버 손잡이, 문 색 4가지에 달아 봤어요' && await page.evaluate(() => window.__wj.VD.post.yl.t) === '레버 손잡이, 문 색 4가지에 달아 봤어요', '후보 2번을 누르면 제목이 바뀐다');
    // 다시 열어도 같은 영상이면 다시 쓰지 않는다
    await page.evaluate(() => window.__wj.showVideo()); await page.waitForTimeout(400);
    ok((await postLogs(page)).length === 1, '같은 영상을 다시 열어도 클로드를 또 부르지 않는다');
    // 되돌리기
    await page.click('[data-vai="reset"]'); await page.waitForTimeout(150);
    ok(await vp(page, 'ys.t') === draft0 && (await page.locator('[data-valt]').count()) === 0 && /처음 문구로 되돌렸어요/.test(await page.textContent('#vpBox')), '"처음 문구로 되돌리기": 기본 제목으로 돌아가고 후보 단추가 사라진다');
    // 다시 쓰기 단추
    await page.click('[data-vai="run"]'); await waitPost(page);
    ok((await postLogs(page)).length === 2 && await vp(page, 'ys.t') === '방문 손잡이 레버 | 문에 달면 이렇게 보여요', '"다시 쓰기" 단추로 한 번 더 쓴다');
    // 직접 고치면 새 영상에서도 자동으로 덮어쓰지 않는다
    await page.fill('#vpBox [data-vp="ys.t"]', '내가 쓴 제목');
    await page.evaluate(() => { const V = window.__wj.VD; V.url = URL.createObjectURL(new Blob(['y'], { type: 'video/webm' })); V.postAI = false; V.post = null; V.postFor = null; V.postTouched = true; });
    await page.evaluate(() => window.__wj.showVideo()); await page.waitForTimeout(500);
    ok((await postLogs(page)).length === 2, '직접 고친 적이 있으면 새 영상이 나와도 자동으로 쓰지 않는다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3. 실패·끄기·AI 사진이 없을 때 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await setS(page, "S.name='메탈 방문 손잡이';");
    await page.evaluate((raw) => { window.__postRaw = raw; window.__postErr = true; }, RAW);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    const draft0 = await page.evaluate(() => window.__wj.vPostDraft().ys.t);
    await fake(page); await page.evaluate(() => window.__wj.showVideo()); await waitPost(page);
    ok(await vp(page, 'ys.t') === draft0 && /클로드가 제목·설명을 쓰지 못해서 기본 문구를 그대로 뒀어요/.test(await page.textContent('#vpBox')), '클로드가 실패하면 기본 문구를 그대로 두고 알려 준다');
    await page.evaluate(() => { window.__postErr = false; });
    await page.click('[data-vai="run"]'); await waitPost(page);
    ok(await vp(page, 'ys.t') === '방문 손잡이 레버 | 문에 달면 이렇게 보여요' && !/AI로 만든 연출 이미지/.test(await vp(page, 'ys.d')), '다시 시키면 되고, AI 사진이 없으면 AI 안내 문장은 붙이지 않는다');
    // 클로드 쓰기 끄면 자동으로 안 쓴다
    await page.evaluate(() => { window.__log.length = 0; window.__wj.UI.useAI = false; });
    await fake(page); await page.evaluate(() => window.__wj.showVideo()); await page.waitForTimeout(500);
    ok((await postLogs(page)).length === 0 && await vp(page, 'ys.t') === draft0, '"제품 글을 클로드가 쓰기"를 끄면 자동으로 쓰지 않는다');
    // 클로드가 없으면 조용히 기본 문구
    await page.evaluate(() => { window.__wj.UI.useAI = true; window.claude = null; });
    await fake(page); await page.evaluate(() => window.__wj.showVideo()); await page.waitForTimeout(500);
    ok(await vp(page, 'ys.t') === draft0 && !/쓰지 못했어요/.test(await page.textContent('#vpBox')), '클로드를 쓸 수 없으면 아무 소리 없이 기본 문구를 쓴다');
    await page.click('[data-vai="run"]'); await page.waitForTimeout(300);
    ok(/클로드 키를 2단계에서 넣어 주세요/.test(await page.textContent('#toast')), '단추를 눌렀는데 클로드가 없으면 "클로드 키를 2단계에서 넣어 주세요"라고 알려 준다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 4. 끝까지: 실제로 광고 영상을 녹화한 뒤 자동으로 제목·설명이 채워지는지 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await setS(page, "S.name='메탈 방문 손잡이';S.size=Object.assign({},S.size,{shape:'rect',shapeSet:'user',capW:'70',capH:'54',len:'150'});");
    await putDoors(page, 4, true);
    await page.evaluate((raw) => { window.__postRaw = raw; }, RAW);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo'); await page.click('#vdGo'); await page.waitForSelector('#vdSave', { timeout: 120000 });
    await waitPost(page);
    ok((await postLogs(page)).length === 1 && await vp(page, 'ys.t') === '방문 손잡이 레버 | 문에 달면 이렇게 보여요' && /#방문손잡이/.test(await vp(page, 'ys.d')), '광고 영상을 실제로 만들고 나면 제목·설명이 자동으로 채워진다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
