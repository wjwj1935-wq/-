/* 자동몰 상세페이지 제작기 v70 — 영상 자동 등록(유튜브) 시험: 가짜 구글 로그인 + 가짜 유튜브 서버 */
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = (process.env.AM_DEV || '/tmp/am_dev');
const HTML = fs.readFileSync(BASE + '/w/am_work.html', 'utf8');
const H2C = fs.readFileSync(BASE + '/h2c/node_modules/html2canvas/dist/html2canvas.min.js');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const SEED = { v: 3, name: '시험 손잡이',
  hero: { badge: '검정 레버 방문 손잡이', title: '문에 차분하게 어울리는\n검정 레버 손잡이', sub: '문에 달았을 때의 모습을 먼저 보고 고르세요.' },
  concept: { eyebrow: 'CONCEPT', title: '가는 결이 있는 긴 레버', body: '길고 얇은 레버에 가는 결이 얇게 나 있어요.', photo: null },
  cta: { title: '우리 집 문에 달아 보세요', sub: '궁금한 점은 판매자에게 물어보세요.' },
  size: { len: '150', wid: '20', cap: '', shape: 'rect', capW: '70', capH: '54', ref: 'card', extra: [], note: '' } };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(HTML); return; }
  res.writeHead(404); res.end('no');
});
let PORT = 0;

/* 가짜 유튜브: 받은 요청을 적어 두고, mode 에 따라 답한다 */
const yt = { inits: [], puts: [], mode: 'ok', forcePrivate: false, putDelay: 0, lastPriv: 'private' };
const CORS = (origin) => ({ 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': 'authorization,content-type,x-upload-content-length,x-upload-content-type', 'access-control-allow-methods': 'POST,PUT,OPTIONS', 'access-control-expose-headers': 'Location' });
async function ytRoute(route) {
  const rq = route.request(), h = rq.headers(), origin = h['origin'];
  if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS(origin) });
  const json = (status, obj, extra) => route.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json' }, CORS(origin), extra || {}), body: JSON.stringify(obj) });
  if (rq.method() === 'POST') {
    const body = rq.postData() || '';
    yt.inits.push({ url: rq.url(), headers: h, body });
    if (yt.mode === 'auth') return json(401, { error: { code: 401, message: 'Invalid Credentials' } });
    if (yt.mode === 'quota') return json(403, { error: { code: 403, message: 'quota', errors: [{ reason: 'quotaExceeded' }] } });
    if (yt.mode === 'disabled') return json(403, { error: { code: 403, message: 'API has not been used', errors: [{ reason: 'accessNotConfigured' }] } });
    if (yt.mode === 'nosynth' && /containsSyntheticMedia/.test(body)) return json(400, { error: { code: 400, message: 'Invalid JSON payload received. Unknown name "containsSyntheticMedia" at \'video.status\'' } });
    try { yt.lastPriv = JSON.parse(body).status.privacyStatus; } catch (e) {}
    return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json', 'Location': 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=SESS1' }, CORS(origin)), body: '' });
  }
  if (rq.method() === 'PUT') {
    const buf = rq.postDataBuffer();
    yt.puts.push({ url: rq.url(), headers: h, len: buf ? buf.length : -1 });
    if (yt.putDelay) await new Promise((r) => setTimeout(r, yt.putDelay));
    return json(200, { id: 'VID123', status: { privacyStatus: yt.forcePrivate ? 'private' : yt.lastPriv } });
  }
  return route.fulfill({ status: 405, body: '' });
}
const GSI = "window.__gsi={calls:[],n:0,fail:false};window.google={accounts:{oauth2:{initTokenClient:function(cfg){window.__gsi.calls.push({client_id:cfg.client_id,scope:cfg.scope});return {requestAccessToken:function(){setTimeout(function(){if(window.__gsi.fail){cfg.error_callback({type:'popup_closed'});}else{window.__gsi.n++;cfg.callback({access_token:'tok-'+window.__gsi.n,expires_in:3599,scope:cfg.scope});}},30);}};}}}};";

async function open(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/*', (r) => { const u = r.request().url(); if (/html2canvas\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: H2C }); if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) return r.continue(); return r.abort(); });
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: GSI }));
  await page.route('https://www.googleapis.com/upload/youtube/v3/videos**', ytRoute);
  await page.addInitScript((s) => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', s); } catch (e) {} }, JSON.stringify(seed));
  await page.goto('http://127.0.0.1:' + PORT + '/');
  await page.waitForSelector('#paper .sec', { state: 'attached' });
  await page.waitForTimeout(800);
  return { ctx, page, errors };
}
async function makeVideo(page, fmt) {
  await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
  await page.evaluate(() => document.querySelectorAll('input[data-vsec]').forEach((c) => { const on = /마지막/.test(c.dataset.vsec); if (c.checked !== on && !c.disabled) c.click(); }));
  await page.click('input[name=vspeed][value=fast]');
  if (fmt) await page.click('input[name=vfmt][value=' + fmt + ']');
  await page.click('#vdGo'); await page.waitForSelector('#vdSave', { timeout: 120000 });
  await page.click('#vdClose'); await page.waitForTimeout(200);
}
const reset = () => { yt.inits = []; yt.puts = []; yt.mode = 'ok'; yt.forcePrivate = false; yt.putDelay = 0; };
const waitMsg = (page, re, t) => page.waitForFunction((s) => new RegExp(s).test((document.querySelector('#ytMsg') || {}).textContent || ''), re, { timeout: t || 20000 });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 버튼 위치 · 영상이 없을 때 */
  {
    const { ctx, page, errors } = await open(browser, SEED);
    const order = await page.evaluate(() => [...document.querySelectorAll('.top-actions > *')].map((e) => e.id || e.tagName));
    const i = order.indexOf('btnVideo');
    ok(i >= 0 && order[i + 1] === 'btnPost', '버튼: "상세페이지로 영상 만들기" 바로 다음에 자동 등록 버튼이 있다 → ' + JSON.stringify(order));
    ok((await page.textContent('#btnPost')).trim() === '영상 자동 등록' && await page.getAttribute('#btnPost', 'class') === 'btn', '버튼: 글자 "영상 자동 등록", 다른 버튼과 같은 모양');
    await page.click('#btnPost'); await page.waitForSelector('#ytGo');
    ok(await page.isDisabled('#ytGo') && /아직 만든 영상이 없어요/.test(await page.textContent('.ytd')), '영상 없음: 올리기 버튼이 꺼져 있고 영상을 먼저 만들라고 알려 준다');
    ok(/틱톡 · 그 밖의 곳은요\?/.test(await page.textContent('.ytd')) && /Make 연결/.test(await page.textContent('#mkBlk')), '안내: 틱톡·그 밖의 곳 안내가 있고, 인스타그램·페이스북은 Make 연결 칸으로 안내한다');
    ok(await page.locator('.ytd details.sub[open]').count() === 1 && /클라이언트 ID/.test(await page.textContent('.ytd details.sub')), '안내: 클라이언트 ID가 없으면 "처음 한 번" 설명이 펼쳐져 있다');
    ok((await page.textContent('.ytd details.sub')).includes('http://127.0.0.1:' + PORT), '안내: 구글에 넣을 "승인된 자바스크립트 원본"으로 지금 사이트 주소가 적혀 있다');
    await page.click('#ytMake'); await page.waitForSelector('#vdGo');
    ok(true, '영상 없음: "영상 만들러 가기"를 누르면 영상 만들기 창이 열린다');
    ok(errors.length === 0, '버튼·창: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 2. 세로 영상(쇼츠): 올리기 한 번 */
  {
    reset();
    const { ctx, page, errors } = await open(browser, SEED);
    await makeVideo(page);
    await page.click('#btnPost'); await page.waitForSelector('#ytGo');
    ok(await page.inputValue('[data-yp="t"]') === '문에 차분하게 어울리는 검정 레버 손잡이', '쇼츠: 제목이 상세페이지 첫 화면 제목으로 채워져 있다');
    ok(/#방문손잡이/.test(await page.inputValue('[data-yp="d"]')) && await page.locator('[data-yp="g"]').count() === 0, '쇼츠: 설명에 해시태그가 있고 태그 칸은 없다(가로 영상에만 있어요)');
    ok(await page.isChecked('input[name=ytpriv][value=private]') && !(await page.isChecked('#ytAi')), '쇼츠: 공개 범위는 처음에 "비공개"이고 AI 표시는 꺼져 있다(AI 사진 없음)');
    await page.click('#ytGo');
    await waitMsg(page, '클라이언트 ID를 먼저');
    ok(yt.inits.length === 0, '쇼츠: 클라이언트 ID가 없으면 유튜브로 아무것도 보내지 않는다');
    await page.fill('#ytCid', 'test-123.apps.googleusercontent.com');
    ok(await page.evaluate(() => localStorage.getItem('am-ytcid')) === 'test-123.apps.googleusercontent.com', '쇼츠: 클라이언트 ID가 이 브라우저에 저장된다');
    await page.click('#ytGo');
    await waitMsg(page, '유튜브에 올렸어요');
    const g = await page.evaluate(() => window.__gsi.calls);
    ok(g.length === 1 && g[0].client_id === 'test-123.apps.googleusercontent.com' && g[0].scope === 'https://www.googleapis.com/auth/youtube.upload', '로그인: 넣은 클라이언트 ID와 "유튜브 올리기" 권한 하나만 요청한다 → ' + JSON.stringify(g));
    const I = yt.inits[0], body = JSON.parse(I.body);
    ok(/uploadType=resumable/.test(I.url) && /part=snippet(,|%2C)status/.test(I.url), '유튜브 요청: 이어 올리기(resumable) 주소와 part=snippet,status → ' + I.url);
    ok(I.headers['authorization'] === 'Bearer tok-1' && /^application\/json/.test(I.headers['content-type']), '유튜브 요청: 로그인 토큰과 JSON 형식을 보낸다');
    const sz = yt.puts[0].len;
    ok(I.headers['x-upload-content-type'] === 'video/mp4' && Number(I.headers['x-upload-content-length']) === sz && sz > 10000, `유튜브 요청: 영상 종류(mp4)와 크기(${sz}바이트)를 미리 알린다`);
    ok(body.snippet.title === '문에 차분하게 어울리는 검정 레버 손잡이' && /크기: 총 길이\(캡 중심~끝\) 150mm/.test(body.snippet.description) && body.snippet.categoryId === '22', '유튜브 요청: 제목·설명·카테고리가 맞다');
    ok(body.snippet.tags.indexOf('방문손잡이') >= 0 && body.snippet.tags.every((t) => !/[#<>,]/.test(t)), '유튜브 요청: 태그는 설명의 해시태그에서 # 없이 만든다 → ' + JSON.stringify(body.snippet.tags));
    ok(body.status.privacyStatus === 'private' && body.status.selfDeclaredMadeForKids === false && !('containsSyntheticMedia' in body.status), '유튜브 요청: 비공개·아동용 아님, AI 표시 없음');
    ok(yt.puts.length === 1 && /upload_id=SESS1/.test(yt.puts[0].url) && yt.puts[0].headers['content-type'] === 'video/mp4', '이어 올리기: 받은 주소(upload_id)로 영상 파일을 mp4로 올린다');
    const res = await page.evaluate(() => [...document.querySelectorAll('#ytRes a')].map((a) => a.href + '|' + a.target + '|' + a.rel));
    ok(res[0] && res[0].startsWith('https://www.youtube.com/shorts/VID123|_blank|') && /noopener/.test(res[0]), '결과: 쇼츠 주소로 가는 "올린 영상 보기" 링크가 나온다 → ' + res[0]);
    ok(res[1] && res[1].startsWith('https://studio.youtube.com/video/VID123/edit'), '결과: 유튜브 스튜디오(공개 바꾸기) 링크가 나온다');
    ok(/나만 볼 수 있어요/.test(await page.textContent('#ytRes')), '결과: 비공개라서 나만 볼 수 있고 공개로 바꾸는 방법을 알려 준다');
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('am-ytlog') || '[]'));
    ok(log.length === 1 && log[0].id === 'VID123' && /올린 기록/.test(await page.textContent('#ytLog')), '기록: 올린 기록이 저장되고 창에 나온다');
    ok(!(await page.isDisabled('#ytGo')) && await page.textContent('#ytClose') === '닫기', '올린 뒤: 버튼이 원래대로 돌아온다');

    /* 3. 같은 로그인으로 또 올리면 로그인 창을 다시 띄우지 않는다 · 공개 범위·AI 표시 */
    yt.inits = []; yt.puts = [];
    await page.click('input[name=ytpriv][value=unlisted]');
    await page.check('#ytAi');
    await page.click('#ytGo'); await waitMsg(page, '유튜브에 올렸어요');
    const b2 = JSON.parse(yt.inits[0].body);
    ok(b2.status.privacyStatus === 'unlisted' && b2.status.containsSyntheticMedia === true, '두 번째: 일부 공개와 AI 생성 표시가 요청에 들어간다');
    ok((await page.evaluate(() => window.__gsi.calls.length)) === 1 && yt.inits[0].headers['authorization'] === 'Bearer tok-1', '두 번째: 로그인 창을 다시 띄우지 않고 같은 로그인을 쓴다');
    ok(/일부 공개/.test(await page.textContent('#ytRes')), '두 번째: 결과에 공개 범위가 나온다');

    /* 4. 유튜브가 비공개로 바꿔 올린 경우 사실대로 알려 준다 */
    yt.inits = []; yt.puts = []; yt.forcePrivate = true;
    await page.click('input[name=ytpriv][value=public]');
    await page.click('#ytGo'); await waitMsg(page, '유튜브에 올렸어요');
    ok(/“공개”를 골랐지만 유튜브가 “비공개”로 올렸어요/.test(await page.textContent('#ytRes')) && /심사 전까지/.test(await page.textContent('#ytRes')), '비공개로 바뀐 경우: 공개를 골랐지만 비공개로 올라간 이유(심사 전 규칙)를 알려 준다');
    ok(errors.length === 0, '쇼츠: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 5. 오류 안내 */
  {
    reset();
    const { ctx, page, errors } = await open(browser, SEED);
    await makeVideo(page);
    await page.click('#btnPost'); await page.waitForSelector('#ytGo');
    await page.fill('#ytCid', 'test-123.apps.googleusercontent.com');
    yt.mode = 'quota'; await page.click('#ytGo'); await waitMsg(page, '한도');
    ok(yt.puts.length === 0, '오류(한도): 쉬운 말로 알려 주고 영상은 보내지 않는다');
    yt.mode = 'disabled'; await page.click('#ytGo'); await waitMsg(page, 'YouTube Data API v3');
    ok(true, '오류(API 꺼짐): "YouTube Data API v3를 켜 달라"고 알려 준다');
    yt.mode = 'auth'; await page.click('#ytGo'); await waitMsg(page, '로그인이 만료');
    const callsBefore = await page.evaluate(() => window.__gsi.calls.length);
    yt.mode = 'ok'; await page.click('#ytGo'); await waitMsg(page, '유튜브에 올렸어요');
    ok((await page.evaluate(() => window.__gsi.calls.length)) === callsBefore + 1, '오류(로그인 만료): 다시 누르면 로그인부터 다시 한다');
    yt.inits = []; yt.puts = []; yt.mode = 'nosynth';
    await page.check('#ytAi');
    await page.click('#ytGo'); await waitMsg(page, '유튜브에 올렸어요');
    ok(yt.inits.length === 2 && /containsSyntheticMedia/.test(yt.inits[0].body) && !/containsSyntheticMedia/.test(yt.inits[1].body), 'AI 표시 항목을 유튜브가 모르면: 그 항목을 빼고 한 번 더 보내 올린다');
    await page.evaluate(() => { window.__gsi.fail = true; });
    await page.evaluate(() => { /* 로그인 만료를 흉내: 아래에서 새 로그인을 요구 */ });
    ok(errors.length === 0, '오류 안내: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }
  /* 5b. 로그인 창을 닫은 경우 */
  {
    reset();
    const { ctx, page } = await open(browser, SEED);
    await makeVideo(page);
    await page.click('#btnPost'); await page.waitForSelector('#ytGo');
    await page.fill('#ytCid', 'test-123.apps.googleusercontent.com');
    await page.evaluate(() => { window.__gsi.fail = true; });
    await page.click('#ytGo'); await waitMsg(page, '로그인 창이 닫혔어요');
    ok(yt.inits.length === 0, '로그인 창을 닫으면: 안내만 하고 유튜브로 아무것도 보내지 않는다');
    await ctx.close();
  }

  /* 6. 가로 영상: 태그 칸 · 일반 영상 주소 */
  {
    reset();
    const { ctx, page, errors } = await open(browser, SEED);
    await makeVideo(page, 'h');
    await page.click('#btnPost'); await page.waitForSelector('#ytGo');
    ok(/가로 영상/.test(await page.textContent('.ytd .msg')) && await page.locator('[data-yp="g"]').count() === 1, '가로: 가로 영상을 올린다고 알려 주고 태그 칸이 있다');
    await page.fill('[data-yp="g"]', '방문손잡이, 레버, 우진');
    await page.fill('#ytCid', 'test-123.apps.googleusercontent.com');
    await page.click('#ytGo'); await waitMsg(page, '유튜브에 올렸어요');
    const body = JSON.parse(yt.inits[0].body);
    ok(JSON.stringify(body.snippet.tags) === JSON.stringify(['방문손잡이', '레버', '우진']), '가로: 고친 태그가 그대로 요청에 들어간다 → ' + JSON.stringify(body.snippet.tags));
    const href = await page.getAttribute('#ytRes a', 'href');
    ok(href === 'https://www.youtube.com/watch?v=VID123', '가로: 일반 영상 주소로 가는 링크가 나온다 → ' + href);
    ok(errors.length === 0, '가로: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 7. 올리는 중 멈추기 · 창 닫힘 막기 */
  {
    reset();
    const { ctx, page, errors } = await open(browser, SEED);
    await makeVideo(page);
    await page.click('#btnPost'); await page.waitForSelector('#ytGo');
    await page.fill('#ytCid', 'test-123.apps.googleusercontent.com');
    yt.putDelay = 6000;
    await page.click('#ytGo');
    await page.waitForFunction(() => /올리는 중이에요/.test((document.querySelector('#ytMsg') || {}).textContent || ''), null, { timeout: 20000 });
    ok(await page.textContent('#ytClose') === '멈추기', '올리는 중: 닫기 버튼이 "멈추기"로 바뀐다');
    await page.mouse.click(4, 4); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    ok(await page.locator('#ytGo').isVisible(), '올리는 중: 바깥을 누르거나 Esc를 눌러도 창이 닫히지 않는다');
    await page.click('#ytClose');
    await waitMsg(page, '멈췄어요');
    await page.waitForTimeout(300);
    ok(await page.textContent('#ytClose') === '닫기' && !(await page.isDisabled('#ytGo')) && (await page.evaluate(() => (JSON.parse(localStorage.getItem('am-ytlog') || '[]')).length)) === 0, '멈추기: 멈춘 뒤 버튼이 돌아오고 올린 기록은 남지 않는다');
    // 멈춘 뒤 다시 올리면 된다
    yt.putDelay = 0; yt.inits = []; yt.puts = [];
    await page.click('#ytGo'); await waitMsg(page, '유튜브에 올렸어요');
    ok(true, '멈추기: 멈춘 뒤 다시 올리면 끝까지 올라간다');
    ok(errors.length === 0, '멈추기: 오류 없음 ' + JSON.stringify(errors));
    // 릴스·틱톡 안내 버튼
    await page.click('#ytToVideo'); await page.waitForSelector('#vdGo');
    ok(await page.locator('#vdPrev [data-vch]').count() === 3, '릴스·틱톡: "올릴 곳 문구·바로가기 열기"를 누르면 올릴 곳 칸(쇼츠·릴스·틱톡)이 나온다');
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건');
  process.exit(fails ? 1 : 0);
})();
