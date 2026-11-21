/* 자동몰 상세페이지 제작기 v90 — 영상·이미지 저장 전 '만들기 전 점검' (클로드는 가짜) */
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

const items = (page) => page.evaluate((ctx) => window.__wj.preItems(ctx).map((x) => ({ l: x.lvl, id: x.id, t: x.text })), 'video');
const itemsE = (page) => page.evaluate(() => window.__wj.preItems('export').map((x) => ({ l: x.lvl, id: x.id, t: x.text })));
const openVideo = async (page) => { await page.click('#btnVideo'); await page.waitForSelector('#vdGo'); await page.waitForTimeout(150); };
const openExport = async (page) => { await page.click('#btnExport'); await page.waitForSelector('#exGo'); await page.waitForTimeout(150); };
const setS = (page, fn, arg) => page.evaluate(({ fn, arg }) => { const S = window.__wj.S(); new Function('S', 'a', fn)(S, arg); }, { fn, arg });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 무료 점검: 영상 창에는 첫 화면·문 색상·소리, 둘 다에는 표기·치수 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await openVideo(page);
    let L = await items(page);
    ok(L.some((x) => x.id === 'hero' && /원본 사진\(임시\)/.test(x.t)) && L.some((x) => x.id === 'door' && /문 색상.*하나도 없어요/.test(x.t)) && L.some((x) => x.id === 'silent' && /배경음이 "없음"/.test(x.t)), '영상 창: 임시 첫 화면·문 색상 없음·소리 없음이 ⚠로 나온다');
    ok(L.every((x) => x.l === 'warn') && !(await page.isDisabled('#vdGo')), '이런 것은 알려만 주고 영상 만들기를 막지 않는다');
    ok(/만들기 전 점검/.test(await page.textContent('#preBox')) && /클로드 점검.*아직 안 했어요/.test(await page.textContent('#preBox')), '창 안에 "만들기 전 점검" 상자와 "클로드 점검은 아직 안 했어요"가 보인다');
    await page.click('input[name=vmusic][value=calm]'); await page.waitForTimeout(150);
    ok(!(await items(page)).some((x) => x.id === 'silent') && !/배경음이 "없음"/.test(await page.textContent('#preBox')), '배경음을 고르면 "소리 없음" 경고가 바로 사라진다');
    await page.click('#vdClose'); await page.waitForTimeout(100);
    await openExport(page);
    const E = await itemsE(page);
    ok(!E.some((x) => ['hero', 'door', 'silent'].includes(x.id)), '이미지 저장 창에는 첫 화면·문 색상·소리 경고를 따로 넣지 않는다(이미 있는 안내와 겹치므로)');
    await page.click('#exClose'); await page.waitForTimeout(100);
    // 재질 표기
    await setS(page, "S.facts.material='아연.철.스텐.알루미늄';");
    ok((await itemsE(page)).some((x) => x.id === 'material' && /"아연\.철\.스텐\.알루미늄"/.test(x.t) && /"·"로 나눠/.test(x.t)), '재질을 마침표로 이어 적으면 알려 준다');
    await setS(page, "S.facts.material='아연합금 · 스테인리스';");
    ok(!(await itemsE(page)).some((x) => x.id === 'material'), '"·"로 나눠 적으면 괜찮다');
    // 총 폭 비율
    const wid = async (w) => { await setS(page, "S.size=Object.assign({},S.size,{shape:'rect',shapeSet:'user',capW:'70',capH:'54',len:'150',wid:a});", w); return (await itemsE(page)).find((x) => x.id === 'wid'); };
    ok((await wid('5')) && /너무 가늘어요/.test((await wid('5')).t) && (await wid('60')) && /너무 넓어요/.test((await wid('60')).t) && !(await wid('22')) && !(await wid('10')), '총 폭이 받침 짧은 변(54)의 12% 미만(5)이거나 95% 초과(60)이면 알려 주고, 22·10은 괜찮다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 글의 색 표현이 사진 인식과 다르면 ⛔ — 확인 체크 전에는 영상·저장 잠김 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await setS(page, "S.name='검정 레버 방문 손잡이';S.hero.badge='검정 레버 방문 손잡이';S.hero.title='문에 차분하게 어울리는\\n검정 레버 손잡이';S.recog={id:S.src.id,kind:'레버형',lever:'',rosette:'',finish:'어두운 건메탈 회색 무광',features:[]};");
    const b = (await items(page)).find((x) => x.id === 'color');
    ok(b && b.l === 'bad' && /"검정"이라고 썼는데/.test(b.t) && /사진 인식/.test(b.t) && /어두운 건메탈 회색/.test(b.t), '글에는 "검정", 사진 인식은 "건메탈 회색" → ⛔ 불일치가 나온다');
    await openVideo(page);
    ok(await page.isDisabled('#vdGo') && (await page.locator('input[data-pre="ack"]').count()) === 1, '영상 창: ⛔가 있으면 영상 만들기가 꺼져 있고 확인 체크 칸이 있다');
    await page.check('input[data-pre="ack"]'); await page.waitForTimeout(100);
    ok(!(await page.isDisabled('#vdGo')), '"확인했어요"에 체크하면 영상 만들기가 켜진다');
    await page.click('#vdClose'); await page.waitForTimeout(100);
    ok((await page.evaluate(() => window.__wj.gateInfo())).hard.some((x) => /"검정"이라고 썼는데/.test(x)), '이미지 저장 전 점검표에도 같은 ⛔가 들어간다');
    await openExport(page);
    ok(await page.isDisabled('#exGo') && (await page.locator('#exAck').count()) === 1, '이미지 저장 창: 저장 단추가 잠겨 있고 "알고 있어요" 칸이 있다');
    await page.click('#exClose'); await page.waitForTimeout(100);
    // 직접 적은 마감·색상이 있으면 그것을 기준으로
    await setS(page, "S.facts.finish='무광 블랙';");
    ok(!(await items(page)).some((x) => x.id === 'color'), '규격에 "무광 블랙"이라고 직접 적었으면 글과 맞아서 걸리지 않는다');
    await setS(page, "S.facts.finish='새틴 니켈';");
    const b2 = (await items(page)).find((x) => x.id === 'color');
    ok(b2 && /규격의 마감·색상 칸/.test(b2.t), '규격에 "새틴 니켈"이라고 적었다면 그 칸을 근거로 불일치를 알려 준다');
    await setS(page, "S.facts.finish='';S.name='메탈 방문 손잡이';S.hero.badge='메탈 방문 손잡이';S.hero.title='우리 집 문에 깔끔하게';");
    ok(!(await items(page)).some((x) => x.id === 'color'), '글에 색 말이 없으면 걸리지 않는다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3. 클로드 점검: 글·모양 설명·치수 비율 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await setS(page, "S.name='메탈 방문 손잡이';S.hero.title='은은한 은색 레버';S.concept.title='둥근 레버';S.zoom.items[0].title='끝이 둥근 레버 윗면';S.size=Object.assign({},S.size,{shape:'rect',shapeSet:'user',capW:'70',capH:'54',len:'150',wid:'10'});");
    await page.evaluate(() => { window.__preRaw = { color: { ok: false, why: '사진 속 금속은 짙은 건메탈이에요.' }, words: [{ id: 'concept', ok: true, why: '' }, { id: 'zoom1', ok: false, why: '레버 끝이 각진 면이에요.' }, { id: 'zoom2', ok: true, why: '' }, { id: 'zoom3', ok: true, why: '' }], ratio: 0.35 }; });
    await openVideo(page);
    await page.click('[data-pre="run"]'); await page.waitForFunction(() => window.__log.some((l) => l.kind === 'pre') && !window.__wj.PRE.busy, null, { timeout: 20000 }); await page.waitForTimeout(300);
    const lg = await page.evaluate(() => window.__log.filter((l) => l.kind === 'pre'));
    if (process.env.DBG) console.log(JSON.stringify(lg.map((l) => ({ n: l.n, tier: l.tier, p: l.p.slice(-760) }))));
    ok(lg.length === 1 && lg[0].n === 1 && lg[0].tier === 'default' && /제품 이름·첫 화면 글: 메탈 방문 손잡이 \/ 고급스러운 메탈 방문 손잡이 \/ 은은한 은색 레버/.test(lg[0].p) && /확대1: 끝이 둥근 레버 윗면/.test(lg[0].p) && /소개: 둥근 레버/.test(lg[0].p), '클로드에 사진 1장과 글(제품 이름·첫 화면·소개·확대 3곳)·치수를 보낸다');
    const L = await items(page);
    ok(L.some((x) => x.id === 'aicolor' && x.l === 'bad' && /사진 속 금속은 짙은 건메탈/.test(x.t)) && L.some((x) => x.id === 'ai_zoom1' && x.l === 'bad' && /확대 1/.test(x.t) && /레버 끝이 각진 면/.test(x.t)) && !L.some((x) => x.id === 'ai_concept' || x.id === 'ai_zoom2'), '색이 다르다(⛔)와 확대 1 설명이 다르다(⛔)가 나오고, 맞다고 한 소개·확대 2는 안 나온다');
    ok(L.some((x) => x.id === 'airatio' && x.l === 'warn' && /약 0\.35배/.test(x.t) && /0\.19배/.test(x.t)), '사진의 비율(0.35)과 입력한 치수 비율(0.19)이 크게 다르면 ⚠로 알려 준다');
    ok(await page.isDisabled('#vdGo') && /클로드 점검을 마쳤어요/.test(await page.textContent('#preBox')), '⛔가 있어서 영상 만들기는 잠겨 있고, 점검을 마쳤다고 나온다');
    await page.click('#vdClose'); await page.waitForTimeout(100);
    await openExport(page);
    ok(await page.isDisabled('#exGo') && /클로드 점검: 제품 이름·첫 화면 글의 색·마감이 사진과 달라 보여요/.test(await page.textContent('.gate')), '이미지 저장 창에서도 같은 결과가 점검표(⛔)로 들어간다');
    await page.click('#exClose'); await page.waitForTimeout(100);
    // 글을 고치면 점검 결과는 낡은 것
    await setS(page, "S.hero.title='은은한 건메탈 레버';");
    ok(!(await items(page)).some((x) => /^ai/.test(x.id)), '글이 바뀌면 이전 점검 결과로는 막지 않는다');
    await openVideo(page);
    ok(/글이나 사진이 바뀌었어요. 다시 점검해 주세요/.test(await page.textContent('#preBox')) && !(await page.isDisabled('#vdGo')), '"글이나 사진이 바뀌었어요. 다시 점검해 주세요"라고 알려 주고 잠금은 풀린다');
    // 모두 맞다고 나오면
    await page.evaluate(() => { window.__log.length = 0; window.__preRaw = { color: { ok: true, why: '' }, words: [{ id: 'concept', ok: true }, { id: 'zoom1', ok: true }, { id: 'zoom2', ok: true }, { id: 'zoom3', ok: true }], ratio: 0.2 }; });
    await page.click('[data-pre="run"]'); await page.waitForFunction(() => window.__log.some((l) => l.kind === 'pre') && !window.__wj.PRE.busy, null, { timeout: 20000 }); await page.waitForTimeout(300);
    ok(!(await items(page)).some((x) => x.l === 'bad' || /^ai/.test(x.id)) && !(await page.isDisabled('#vdGo')), '모두 맞다고 나오면 걸리는 것도 없고(비율 0.2도 0.19와 비슷) 잠기지도 않는다');
    // 실패하면
    await page.evaluate(() => { window.__preErr = true; window.__wj.PRE.cache = null; });
    await page.click('[data-pre="run"]'); await page.waitForFunction(() => !window.__wj.PRE.busy && /끊겼어요|점검하지 못했어요/.test(document.querySelector('#toast').textContent), null, { timeout: 20000 });
    ok(await page.evaluate(() => window.__wj.PRE.cache === null), '클로드가 실패하면 알기 쉬운 안내만 나오고 점검 결과는 남기지 않는다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 4. 클로드를 쓸 수 없을 때 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await page.addInitScript(() => { }).catch(() => {});
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.evaluate(() => { window.claude = null; });
    await openVideo(page);
    await page.click('[data-pre="run"]'); await page.waitForTimeout(400);
    ok(/클로드 키를 2단계에서 넣어 주세요/.test(await page.textContent('#toast')) && !(await page.evaluate(() => window.__wj.PRE.busy)), '클로드를 쓸 수 없으면 "클로드 키를 2단계에서 넣어 주세요"라고 알려 준다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
