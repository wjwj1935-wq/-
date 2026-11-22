/* 자동몰 상세페이지 제작기 v74 — 자동 업그레이드 시험 (작은 서버로 인터넷 주소를 흉내 낸다) */
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = (process.env.AM_DEV || '/tmp/am_dev');
const NEW_HTML = fs.readFileSync(BASE + '/w/am_work.html', 'utf8');                       // 버전 103
const OLD_HTML = NEW_HTML.replace('VER=103,', 'VER=100,').replace('버전 103</small>', '버전 100</small>');   // 열어 둔 옛 화면(버전 100)
if (OLD_HTML === NEW_HTML) throw new Error('옛 화면을 만들지 못했어요');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

/* 서버: ver = version.json 의 값, mode = 옛 화면을 주는 방식
   cache: 그냥 주소는 옛 화면(캐시), 주소에 t= 가 붙으면 새 화면 / stale: 늘 옛 화면 / fresh: 늘 새 화면 */
const state = { ver: 100, mode: 'cache', hits: [] };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/version.json') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ v: state.ver })); return; }
  if (u.pathname === '/' || u.pathname === '/index.html') {
    state.hits.push(req.url);
    const useNew = state.mode === 'fresh' || (state.mode === 'cache' && u.searchParams.has('t'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(useNew ? NEW_HTML : OLD_HTML); return;
  }
  res.writeHead(404); res.end('no');
});

async function open(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) r.continue(); else r.abort(); });
  await page.addInitScript(() => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', JSON.stringify({ v: 3, name: '시험 손잡이' })); } catch (e) {} });
  if (opts.blockSession) await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } }); });
  if (opts.clock) await page.clock.install({ time: new Date('2026-11-07T10:00:00') });
  state.hits = [];
  await page.goto('http://127.0.0.1:' + PORT + '/');
  await page.waitForSelector('#paper .sec', { state: 'attached' });
  await page.waitForTimeout(900);
  return { ctx, page, errors };
}
const ver = (page) => page.locator('.brand small').textContent();
const waitVer = (page, n, t) => page.waitForFunction((x) => new RegExp('버전 ' + x).test((document.querySelector('.brand small') || {}).textContent || ''), n, { timeout: t || 15000 });
const chipShown = (page) => page.evaluate(() => !document.querySelector('#updChip').hidden);
let PORT = 0;

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 열 때: 새 버전이 있으면 알아서 바뀐다(캐시가 옛 화면을 줘도) */
  {
    state.ver = 103; state.mode = 'cache';
    const { ctx, page, errors } = await open(browser);
    await waitVer(page, 103);
    await page.waitForTimeout(500);
    const loc = await page.evaluate(() => ({ p: location.pathname, s: location.search }));
    ok(/버전 103/.test(await ver(page)), '열 때: 새 버전(102)으로 저절로 바뀐다');
    ok(loc.p === '/' && loc.s === '', '열 때: 주소창이 깨끗하게 돌아온다 → ' + JSON.stringify(loc));
    ok(state.hits.length === 2 && /[?&]t=\d+/.test(state.hits[1]) && /v=103/.test(state.hits[1]), '열 때: 새로고침 주소에 시간이 붙는다 → ' + JSON.stringify(state.hits));
    ok(await page.inputValue('[data-k="name"]') === '시험 손잡이', '열 때: 작업(제품 이름)이 그대로 남는다');
    ok(!(await chipShown(page)), '열 때: 새 화면에는 "새 버전" 버튼이 없다');
    ok(errors.length === 0, '열 때: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 2. 열어 둔 채 다른 창에 갔다가 돌아오면 바뀐다 */
  {
    state.ver = 100; state.mode = 'cache';
    const { ctx, page } = await open(browser);
    ok(/버전 100/.test(await ver(page)) && !(await chipShown(page)), '돌아올 때: 같은 버전이면 아무 일도 없다');
    state.ver = 103;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitVer(page, 103);
    ok(true, '돌아올 때: 새 버전이 나온 뒤 창으로 돌아오면 저절로 바뀐다');
    ok(await page.inputValue('[data-k="name"]') === '시험 손잡이', '돌아올 때: 작업이 그대로 남는다');
    await ctx.close();
  }

  /* 3. 열어 둔 채 가만히 있으면 1분마다 확인해서 바뀐다 (손을 쓰는 중이면 기다린다) */
  {
    state.ver = 100; state.mode = 'cache';
    const { ctx, page } = await open(browser, { clock: true });
    state.ver = 103;
    await page.clock.fastForward(30000);
    await page.mouse.click(700, 500);                      // 만지는 중
    await page.clock.fastForward(31000);                   // 1분 확인 시각
    await page.waitForTimeout(1500);
    ok(/버전 100/.test(await ver(page)) && await chipShown(page), '열어 둔 채(만지는 중): 바로 바꾸지 않고 "새 버전" 버튼만 보여 준다');
    await page.clock.fastForward(60000);                   // 1분 더 가만히
    await page.waitForTimeout(800);
    await page.clock.fastForward(3000);
    await waitVer(page, 103);
    ok(true, '열어 둔 채(가만히 있음): 45초 넘게 안 만지면 저절로 바뀐다');
    await ctx.close();
  }

  /* 4. 작업 중(창이 열려 있음)에는 바꾸지 않고, 끝나면 바꾼다 */
  {
    state.ver = 100; state.mode = 'cache';
    const { ctx, page } = await open(browser);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    state.ver = 103;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(2500);
    ok(/버전 100/.test(await ver(page)) && state.hits.length === 1 && await chipShown(page), '작업 중(영상 창 열림): 바꾸지 않고 "새 버전" 버튼만 보여 준다');
    await page.click('#vdClose'); await page.waitForTimeout(200);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitVer(page, 103);
    ok(true, '작업 중: 창을 닫은 뒤에는 저절로 바뀐다');
    await ctx.close();
  }

  /* 5. 캐시가 계속 옛 화면만 주면: 같은 버전은 최대 2번만 시도하고 멈춘다 */
  {
    state.ver = 103; state.mode = 'stale';
    const { ctx, page } = await open(browser);
    await page.waitForTimeout(7000);
    ok(state.hits.length === 3, '계속 옛 화면일 때: 처음 열기 + 자동 새로고침 2번, 모두 3번만 받는다 → ' + state.hits.length + '번');
    ok(/버전 100/.test(await ver(page)) && await chipShown(page), '계속 옛 화면일 때: 멈추고 "새 버전" 버튼을 보여 준다');
    const before = state.hits.length;
    await page.waitForTimeout(3000);
    ok(state.hits.length === before, '계속 옛 화면일 때: 더는 새로고침을 반복하지 않는다');
    // 버튼을 누르면 (이제 새 화면이 오면) 바뀐다
    state.mode = 'fresh';
    await page.click('#updChip');
    await waitVer(page, 103);
    ok(true, '계속 옛 화면일 때: 버튼을 누르면 새 화면으로 바뀐다');
    await ctx.close();
  }

  /* 6. 이 브라우저가 시도 횟수를 적어 둘 수 없으면(무한 반복 위험) 자동으로 바꾸지 않고 버튼만 */
  {
    state.ver = 103; state.mode = 'stale';
    const { ctx, page } = await open(browser, { blockSession: true });
    await page.waitForTimeout(3500);
    ok(state.hits.length === 1, '기록 못 하는 브라우저: 자동 새로고침을 반복하지 않는다 (페이지를 ' + state.hits.length + '번만 받음)');
    ok(/버전 100/.test(await ver(page)) && await chipShown(page), '기록 못 하는 브라우저: 대신 "새 버전" 버튼을 보여 준다');
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건');
  process.exit(fails ? 1 : 0);
})();
