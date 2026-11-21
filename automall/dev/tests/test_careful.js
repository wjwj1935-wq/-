/* 자동몰 상세페이지 제작기 v86 — 천천히 확실하게 만들기 (구글·클로드는 가짜: 칸마다 정해 둔 대로 실패·성공을 흉내) */
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

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 정상: 한 장씩 보내고, 칸마다 검수가 합격 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const pr = await prepare(page);
    ok(pr.ok === true && pr.n >= 4, '준비: 기준 사진이 확정되고 편집할 문 색상 칸이 ' + pr.n + '개 있다');
    ok(await page.evaluate(() => window.__wj.UI.careful === true), '기본: 천천히 확실하게 모드가 켜져 있다');
    ok(sc.maxIn === 1, '기준 사진 후보 ' + sc.baseBytes.length + '장도 한 장씩 보냈다(동시에 보낸 최대 ' + sc.maxIn + '개)');
    sc.reqs = []; sc.maxIn = 0;
    const r = await run(page);
    ok(r.done === pr.n && r.passN === pr.n && r.holds.length === 0 && r.fails === 0 && !r.stopped, '정상: ' + pr.n + '칸 모두 검수 합격 → ' + JSON.stringify({ d: r.done, p: r.passN, h: r.holds.length }));
    ok(sc.maxIn === 1 && sc.reqs.length === pr.n, '한 장씩: 구글에 동시에 보낸 최대 ' + sc.maxIn + '개, 요청 ' + sc.reqs.length + '번');
    const t = await tile(page, '월넛');
    ok(t.has && t.chk && t.chk.ok && !t.hold && /jpeg/.test(t.type), '월넛 칸: 사진이 있고 검수 합격, 보류 기록 없음, JPG로 줄여 저장(' + t.type + ')');
    const g = await page.evaluate(() => window.__wj.gateInfo());
    ok(g.hard.length === 0, '저장 전 점검표: 걸린 곳 없음 ' + JSON.stringify(g.hard));
    const log = await page.evaluate(() => window.__log.filter((l) => l.kind === 'check'));
    ok(log.length >= pr.n && log.some((l) => /문 색이 달라요/.test(l.p) && /월넛/.test(l.p)), '검수 요청이 칸마다 가고, 문 색이 요청과 같은지 묻는다(' + log.length + '번)');
    ok(log.some((l) => /손 모양이 이상해요/.test(l.p) && /한 손이 레버를 잡아 내리는/.test(l.p)), '손이 나오는 사용 컷 검수에는 손 모양을 묻는다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 2. 구글이 그림을 안 줘도(차단) 그 칸만 다시 해서 성공 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const pr = await prepare(page); sc.reqs = [];
    sc.rules['월넛'] = ['blocked', 'blocked'];   // 이 칸: 1·2번째 요청은 차단, 3번째부터 성공
    const r = await run(page);
    const wal = sc.reqs.filter((q) => /월넛/.test(q.key));
    ok(r.done === pr.n && r.holds.length === 0 && !r.stopped, '차단 2번 → 3번째에 성공: 모든 칸이 만들어졌다 → ' + JSON.stringify({ d: r.done, h: r.holds.length, s: r.stopped }));
    ok(wal.length === 3 && wal[2].act === 'ok', '월넛 칸 요청은 3번(차단·차단·성공)');
    ok(sc.reqs.length === pr.n + 2, '다른 칸은 한 번씩만 요청(전체 ' + sc.reqs.length + '번 = ' + pr.n + ' + 2)');
    ok(wal[2].model === 'gemini-3-pro-image-preview' && wal[0].model === 'gemini-2.5-flash-image', '사다리: 1·2번째는 값싼 편집 모델, 3번째는 정밀 모델(' + wal.map((q) => q.model.replace('gemini-', '')).join(' → ') + ')');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 3. 검수에서 두 번 떨어졌다가 3번째에 합격 — 지적한 점이 다음 지시문에 들어간다 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await prepare(page); sc.reqs = [];
    await page.evaluate(() => { window.__checkRules['월넛'] = ['레버 방향이 달라요', '문 색이 달라요', true]; });
    const r = await run(page, ['월넛']);
    const wal = sc.reqs.filter((q) => /월넛/.test(q.key));
    ok(r.done === 1 && r.passN === 1 && r.holds.length === 0, '검수 2번 불합격 → 3번째 합격: 보류 없음');
    ok(wal.length === 3 && !/이전에 만든 이미지는 원본과 이렇게 달랐습니다/.test(wal[0].text), '1번째 지시문에는 지적 사항이 없다');
    ok(/이전에 만든 이미지는 원본과 이렇게 달랐습니다: 레버 방향이 달라요/.test(wal[1].text) && /문 색이 달라요/.test(wal[2].text), '2·3번째 지시문에 바로 앞 검수의 지적 사항이 들어간다');
    ok(wal[2].model === 'gemini-3-pro-image-preview', '3번째 시도는 정밀 모델');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 4. 끝까지 합격 못 하면 '보류' — 4번 시도, 마지막은 단순한 구도, 이유 저장, 저장 전 점검표가 막음, '이대로 쓸게요'로 풂 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const pr = await prepare(page); sc.reqs = [];
    await page.evaluate(() => { window.__checkRules['월넛'] = { dflt: '레버 방향이 반대예요' }; });
    const r = await run(page);
    const wal = sc.reqs.filter((q) => /월넛/.test(q.key));
    ok(wal.length === 4, '합격 못 하면 최대 4번까지 시도한다(' + wal.length + '번)');
    ok(!/가장 단순하게 만들어 주세요/.test(wal[2].text) && /가장 단순하게 만들어 주세요/.test(wal[3].text), '4번째만 가장 단순한 구도 문장이 붙는다');
    ok(r.done === pr.n && r.holds.length === 1 && r.holds[0].e === false && r.passN === pr.n - 1, '결과: 월넛만 보류(사진은 남음), 나머지 ' + (pr.n - 1) + '칸은 합격 → ' + JSON.stringify({ d: r.done, p: r.passN, h: r.holds.length }));
    const t = await tile(page, '월넛');
    ok(t.has && t.chk && !t.chk.ok && t.hold && /레버 방향이 반대예요/.test(t.hold.why), '월넛 칸: 사진은 있지만 검수 불합격, 보류 이유 저장("' + (t.hold && t.hold.why) + '")');
    const html = await page.evaluate(() => document.querySelector('[data-pk="colors.items.' + window.__wj.S().colors.items.findIndex((it) => /월넛/.test(it.label)) + '.photo"]').innerText);
    ok(/보류/.test(html) && /이대로 쓸게요/.test(html), '3단계 화면: 그 칸에 "보류"와 "이대로 쓸게요" 단추가 보인다');
    if (process.env.SHOT) { const el = await page.$('[data-pk="colors.items.' + (await page.evaluate(() => window.__wj.S().colors.items.findIndex((it) => /월넛/.test(it.label)))) + '.photo"]'); await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: B + '/w/shots/careful_row.png' }); }
    const g = await page.evaluate(() => window.__wj.gateInfo());
    ok(g.hard.length === 1 && /보류된 칸 1개/.test(g.hard[0]), '저장 전 점검표: 보류 칸 1개가 걸린다');
    await page.click('#btnExport'); await page.waitForSelector('#exGo');
    ok(await page.isDisabled('#exGo') && (await page.locator('#exAck').count()) === 1, '저장 창: 걸린 곳이 있으면 저장 단추가 꺼져 있고 "알고 있어요" 칸이 있다');
    if (process.env.SHOT) await page.screenshot({ path: B + '/w/shots/careful_gate.png' });
    await page.check('#exAck');
    ok(!(await page.isDisabled('#exGo')), '"알고 있어요"에 체크하면 저장 단추가 켜진다');
    await page.click('#exClose'); await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('[data-act="acceptchk"]').click()); await page.waitForTimeout(200);
    const t2 = await tile(page, '월넛');
    ok(t2.chk && t2.chk.ok && t2.chk.manual && !t2.hold, '"이대로 쓸게요": 사장님이 확인한 칸으로 바뀌고 보류 기록이 지워진다');
    ok((await page.evaluate(() => window.__wj.gateInfo())).hard.length === 0, '그 뒤 저장 전 점검표에 걸린 곳이 없다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 5. 그림이 아예 안 올 때: 그 칸만 빈 보류, 나머지는 계속, 이유는 새로 고침해도 남음 */
  {
    resetSc();
    const ctx0 = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const { ctx, page, errors } = await open(browser, { ctx: ctx0 });
    const pr = await prepare(page); sc.reqs = [];
    sc.rules['검정'] = { dflt: 'blocked' };
    const r = await run(page);
    const blk = sc.reqs.filter((q) => /검정/.test(q.key));
    ok(blk.length === 4, '계속 차단되면 그 칸만 4번 시도한다(' + blk.length + '번)');
    ok(r.done === pr.n - 1 && r.fails === 1 && r.holds.length === 1 && r.holds[0].e === true && !r.stopped, '나머지 ' + (pr.n - 1) + '칸은 끝까지 만들어진다(멈추지 않음) → ' + JSON.stringify({ d: r.done, f: r.fails, h: r.holds.length, s: r.stopped }));
    const t = await tile(page, '블랙');
    ok(!t.has && t.hold && /구글이 이 장면을 만들지 않았어요/.test(t.hold.why), '블랙 칸: 사진 없음 + 이유 저장("' + (t.hold && t.hold.why.slice(0, 40)) + '…")');
    const g = await page.evaluate(() => window.__wj.gateInfo());
    ok(g.hard.some((x) => /문 색상 빈 칸 1개/.test(x) && /이유/.test(x)), '저장 전 점검표: 빈 칸 1개와 이유가 나온다');
    await page.waitForTimeout(700);
    await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForFunction(() => window.__wj); await page.waitForTimeout(900);
    const t3 = await tile(page, '블랙');
    ok(!t3.has && t3.hold && /구글이 이 장면을/.test(t3.hold.why), '새로 고침 뒤에도 보류 이유가 남아 있다');
    const row = await page.evaluate(() => document.querySelector('[data-pk="colors.items.' + window.__wj.S().colors.items.findIndex((it) => /블랙/.test(it.label)) + '.photo"]').innerText);
    ok(/보류 · 못 만들었어요/.test(row), '새로 고침 뒤 3단계 화면에도 이유가 보인다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 6. 한도(429)·구글 오류(500): 전체를 멈추지 않고 그 칸만 기다렸다 다시 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const pr = await prepare(page); sc.reqs = [];
    sc.rules['월넛'] = ['429', '429', '429', '500', 'ok'];   // 첫 시도: 429가 3번(안쪽 재시도 2번 포함), 둘째 시도: 500 하나, 그다음 성공
    const r = await run(page);
    ok(r.done === pr.n && r.holds.length === 0 && !r.stopped && r.fails === 0, '429·500 뒤에도 전체가 멈추지 않고 모든 칸이 만들어졌다 → ' + JSON.stringify({ d: r.done, h: r.holds.length, s: r.stopped }));
    const wal = sc.reqs.filter((q) => /월넛/.test(q.key));
    ok(wal.length === 5 && wal.slice(0, 4).every((q) => q.act !== 'ok'), '월넛 칸 요청 ' + wal.length + '번(실패 4번 뒤 성공)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 7. 잔액 부족(402): 바로 멈춘다 — 이유를 보여 주고, 남은 칸은 건드리지 않는다 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const pr = await prepare(page); sc.reqs = [];
    sc.rules['검정'] = { dflt: '402' };
    const r = await run(page);
    const names = await page.evaluate(() => window.__wj.S().colors.items.map((it) => it.label));
    ok(/잔액|크레딧/.test(r.stopped || ''), '잔액 부족이면 이유를 알리며 멈춘다("' + (r.stopped || '').slice(0, 30) + '…")');
    const tb = await tile(page, '블랙');
    const after = await page.evaluate(() => { const w = window.__wj, S = w.S(); return S.colors.items.map((it, i) => ({ l: it.label, has: !!(it.photo && w.PH.get(it.photo.id)), h: !!w.holdOf('colors.items.' + i + '.photo') })); });
    const bi = names.findIndex((x) => /블랙/.test(x));
    const rest = after.slice(bi + 1).filter((x, k) => !/화이트/.test(x.l));
    ok(!tb.has && tb.hold && rest.every((x) => !x.has && !x.h), '블랙 칸은 보류, 그 뒤 칸은 건드리지 않았다(사진 없음·기록 없음)');
    ok(sc.reqs.filter((q) => /검정/.test(q.key)).length === 1, '잔액 문제는 다시 시도하지 않는다(블랙 요청 1번)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 8. 구글이 계속 안 줄 때(3칸 연속 완전 실패): 멈추고 이어서 만들라고 알린다 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const pr = await prepare(page); sc.reqs = [];
    ['월넛', '밝은 회색', '검정'].forEach((k) => { sc.rules[k] = { dflt: 'blocked' }; });
    const r = await run(page);
    ok(/구글이 계속 그림을 주지 않아요/.test(r.stopped || '') && r.fails === 3, '3칸 연속 완전 실패 → 멈춘다 → ' + JSON.stringify({ s: (r.stopped || '').slice(0, 20), f: r.fails }));
    ok(r.done === 0 || r.done < pr.n - 3, '남은 칸은 시작하지 않았다(만든 칸 ' + r.done + ' / ' + pr.n + ')');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 9. 최대 요금 상한 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await prepare(page); sc.reqs = [];
    await page.evaluate(() => { window.__wj.G.capUsd = '0.08'; });
    const r = await run(page);
    ok(/최대 요금\(\$0\.08\)에 닿아서 멈췄어요/.test(r.stopped || ''), '상한 $0.08: 값싼 모델 2장($0.078)까지 만들고 3번째 전에 멈춘다 → "' + (r.stopped || '').slice(0, 40) + '…"');
    ok(sc.reqs.length === 2, '구글 요청은 2번뿐(' + sc.reqs.length + '번)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 10. 빈 그림·바뀌지 않은 그림은 컴퓨터가 먼저 걸러 다시 만든다 (무료 점검) */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await prepare(page); sc.reqs = [];
    sc.dupSrc = sc.baseBytes[0];
    sc.rules['월넛'] = ['blank', 'ok'];
    sc.rules['밝은 회색'] = ['dup', 'ok'];
    const r = await run(page);
    const w1 = sc.reqs.filter((q) => /월넛/.test(q.key)), w2 = sc.reqs.filter((q) => /밝은 회색/.test(q.key));
    ok(w1.length === 2 && w2.length === 2 && r.holds.length === 0, '빈 그림 1번, 기준 사진 그대로인 그림 1번을 거르고 다시 만들어 성공 → ' + JSON.stringify({ a: w1.length, b: w2.length, h: r.holds.length }));
    const t = await tile(page, '월넛'), t2 = await tile(page, '라이트');
    ok(t.has && t.chk && t.chk.ok && t2.has && t2.chk && t2.chk.ok, '두 칸 모두 정상 그림이 들어가 검수 합격');
    const sn = await page.evaluate(async () => { const w = window.__wj, S = w.S(), p = S.base, m = w.PH.get(p.id); return await w.sane({ kind: 'edit', i: 1 }, m.blob); });
    ok(sn.ok === false && /거의 똑같은 그림/.test(sn.why), '직접 확인: 기준 사진과 같은 그림은 "거의 똑같은 그림"으로 걸린다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 11. 만들기 전 확인 문구 · 설정 · 검수 문장 · 같은 그림 점검 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    await prepare(page);
    await page.evaluate(() => document.querySelector('#gAll').click()); await page.waitForTimeout(200);
    const why = await page.textContent('#gWhy');
    ok(/천천히 확실하게 모드/.test(why) && /최대 4번/.test(why) && /최대 약 \$\d/.test(why), '만들기 전 확인 문구에 모드·최대 4번·최대 요금이 나온다 → "' + why.slice(-110) + '"');
    await page.evaluate(() => document.querySelector('[data-act="gno"]').click());
    ok((await page.locator('#useSlow').isChecked()) && (await page.locator('#capUsd').count()) === 1, '2단계 설정: "천천히 확실하게" 체크와 "최대 요금" 칸이 있다');
    await page.uncheck('#useSlow');
    ok(await page.evaluate(() => window.__wj.UI.careful === false && localStorage.getItem('am-slow') === '0'), '끄면 저장돼 다음에 열어도 꺼져 있다');
    await page.evaluate(() => document.querySelector('#gAll').click()); await page.waitForTimeout(200);
    ok(!/천천히 확실하게 모드/.test(await page.textContent('#gWhy')), '끄면 확인 문구에 모드 설명이 없다');
    await page.evaluate(() => document.querySelector('[data-act="gno"]').click());
    const ck = await page.evaluate(() => window.__wj.chkPrompt('edit', '', { scene: '짙은 월넛 우드 결의 실내 문', hand: false }));
    ok(/문 색·재질이 이 설명과 눈에 띄게 다르거나/.test(ck) && /"문 색이 달라요"/.test(ck), '검수문(편집): 문 색이 요청과 다르면 불합격 규칙이 있다');
    await run(page, ['월넛', '라이트']);
    const g = await page.evaluate(() => {
      const w = window.__wj, S = w.S(), tl = S.colors.items.filter((it) => w.PH.has(it.photo && it.photo.id) && it.photo.ai), hs = Array.from({ length: 48 }, (_, i) => (i * 5) % 255);
      tl[0].photo.hs = hs.slice(); tl[1].photo.hs = hs.map((v) => v + 1);
      return w.gateInfo();
    });
    ok(g.hard.some((x) => /거의 같은 그림이 있어요/.test(x)), '저장 전 점검표: 색 지문이 같은 두 칸은 "거의 같은 그림"으로 걸린다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 12. 예전 방식(끄기): 동시에 여러 장, 칸마다 검수는 끝에 한꺼번에 */
  {
    resetSc();
    const { ctx, page, errors } = await open(browser, { slow0: true });
    const pr = await prepare(page); sc.reqs = []; sc.maxIn = 0;
    ok(await page.evaluate(() => window.__wj.UI.careful === false), '예전 방식: 저장된 설정대로 꺼진 채로 열린다');
    const r = await run(page);
    ok(r.done === pr.n && sc.maxIn >= 2 && sc.maxIn <= 3, '예전 방식은 동시에 보낸다(최대 ' + sc.maxIn + '개)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 13. 저장소에서 사진을 못 찾으면 알려 준다 */
  {
    resetSc();
    const ctx0 = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const { ctx, page, errors } = await open(browser, { ctx: ctx0 });
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2000);
    await page.evaluate(() => { const S = window.__wj.S(); S.colors.items[1].photo = { id: 'nope-1', w: 100, h: 100, ai: true }; localStorage.setItem('am-dp-v1', JSON.stringify(S)); });
    await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(1500);
    const tx = await page.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');
    ok(/저장소에서 사진 1장을 찾지 못해 그 칸이 비었어요/.test(tx), '열 때 사진 1장이 저장소에 없으면 안내 글이 뜬다 → "' + tx.slice(0, 40) + '"');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  /* 14. '한 번에 만들기' 끝까지: 보류 칸이 있으면 자동 저장을 하지 않고 점검표를 먼저 보여 준다 / 없으면 자동 저장 */
  for (const bad of [true, false]) {
    resetSc();
    const { ctx, page, errors } = await open(browser);
    const downloads = []; page.on('download', (d) => downloads.push(d.suggestedFilename()));
    await page.fill('[data-k="name"]', '시험 레버').catch(() => {});
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
    await page.evaluate(() => { const S = window.__wj.S(); S.name = '시험 레버'; S.lvDir = { id: S.src.id, dir: 'L', auto: false }; });
    await page.click('#btnOne'); await page.waitForSelector('#onGo'); await page.click('#onGo');
    await page.waitForFunction(() => document.querySelector('#veil').hidden === true && window.__wj.S().baseCands.filter(Boolean).length > 0, null, { timeout: 90000 });
    ok(true, (bad ? '[보류 있음] ' : '[모두 합격] ') + '첫 번째 눌렀을 때: 기준 사진 후보까지 만들고 멈춘다');
    await page.evaluate(() => document.querySelector('[data-act="basepick"][data-k="0"]').click()); await page.waitForTimeout(300);
    if (bad) await page.evaluate(() => { window.__checkRules['월넛'] = { dflt: '레버 방향이 반대예요' }; });
    await page.click('#btnOne'); await page.waitForSelector('#onGo'); await page.click('#onGo');
    await page.waitForSelector('#exGo', { timeout: 120000 }); await page.waitForTimeout(2500);
    const dlg = await page.textContent('.dlg');
    if (bad) {
      ok(/보류된 칸이 있어요\(/.test(dlg) && (await page.locator('#exAck').count()) === 1 && await page.isDisabled('#exGo'), '보류 칸이 있으면: 저장 창에 보류 안내와 점검표가 뜨고 저장 단추가 잠겨 있다');
      ok(downloads.length === 0, '보류 칸이 있으면: 자동 저장을 하지 않는다(내려받은 파일 ' + downloads.length + '개)');
      ok(!/자동으로 저장해요/.test(await page.textContent('#exMsg')), '보류 칸이 있으면: 안내 글에 "자동으로 저장해요"가 없다');
    } else {
      ok((await page.locator('#exAck').count()) === 0, '모두 합격이면: 점검표(알고 있어요 칸)가 없다');
      await page.waitForFunction(() => /저장했어요/.test((document.querySelector('#exMsg') || {}).textContent || ''), null, { timeout: 90000 }).catch(() => {});
      ok(downloads.length === 1 && /\.jpg$/.test(downloads[0]), '모두 합격이면: 긴 이미지 한 장이 자동으로 저장된다(' + downloads.join(',') + ')');
    }
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await ctx.close();
  }

  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과');
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
