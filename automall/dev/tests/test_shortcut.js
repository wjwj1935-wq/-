/* v99 바로가기(바탕화면·휴대폰 아이콘) — 인터넷 주소가 아닌 파일로 열었을 때 / 인터넷 주소(github.io)로 열린 것처럼 했을 때 / 아이폰 */
const fs = require('fs'), { pathToFileURL } = require('url'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev'), R = '/home/user/-/automall/';
const FILE = B + '/staff/자동몰_상세페이지_제작기_v103.html', SITE = 'https://wjwj1935-wq.github.io/-/automall/';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const html = fs.readFileSync(FILE, 'utf8'), served = [];
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (/^(file|data|blob|about):/.test(u)) return r.continue();
    if (u.startsWith(SITE)) {
      served.push(u); const p = u.slice(SITE.length).split(/[?#]/)[0];
      if (p === '' || p === 'index.html') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      if (p === 'version.json') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"v":101}' });
      if (p === 'manifest.json') return r.fulfill({ status: 200, contentType: 'application/manifest+json', body: fs.readFileSync(R + 'manifest.json') });
      if (/^icons\/[\w-]+\.png$/.test(p) && fs.existsSync(R + p)) return r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(R + p) });
      return r.fulfill({ status: 404, body: 'nf' });
    }
    return r.abort();
  });
  const errors = [];

  /* A. 파일로 열었을 때(직원용 단일 파일): 설치 단추는 없고, 바탕화면용 바로가기 파일만 나온다 */
  let page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(FILE).href + '#wjdebug'); await page.waitForSelector('#paper .sec', { state: 'attached' });
  ok(/버전 103/.test(await page.textContent('.brand small')) && await page.locator('#btnShortcut').count() === 1, '파일로 열면 "버전 103"이고 윗줄에 "바로가기" 단추가 있다');
  await page.click('#btnShortcut'); await page.waitForSelector('#scFile');
  const t1 = await page.textContent('.dlg');
  ok(/바로가기 만들기/.test(t1) && await page.locator('#scInstall').count() === 0 && /아이폰/.test(t1) && /안드로이드/.test(t1), '파일로 연 경우: 설치 단추는 안 보이고 "바로가기 파일 받기"·아이폰·안드로이드 안내가 보인다');
  const [d1] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#scFile')]);
  const p1 = B + '/staff/test_shortcut.url'; await d1.saveAs(p1);
  const txt = fs.readFileSync(p1, 'utf8');
  ok(d1.suggestedFilename() === 'automall.url' && txt === '[InternetShortcut]\r\nURL=' + SITE + '\r\nIconIndex=0\r\n', '"바로가기 파일 받기"는 automall.url을 내려주고, 안에는 인터넷 주소(' + SITE + ')가 들어 있다');
  await page.click('#scClose'); ok(await page.evaluate(() => document.getElementById('veil').hidden), '닫기를 누르면 창이 닫힌다');

  /* B. 인터넷 주소로 열린 것처럼(github.io): 설치 단추가 보이고, 브라우저가 설치를 허락하면 설치 창을 띄운다 */
  page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(SITE); await page.waitForSelector('#paper .sec', { state: 'attached' });
  ok(await page.evaluate(() => location.origin) === 'https://wjwj1935-wq.github.io', '(시험) 주소가 github.io로 열렸다');
  const mf = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const m = await (await fetch(l.href)).json(); const ics = await Promise.all(m.icons.map(async (i) => { const r = await fetch(new URL(i.src, l.href)); return [i.src, r.status, r.headers.get('content-type')]; })); return { m, ics, apple: document.querySelector('link[rel=apple-touch-icon]').getAttribute('href') }; });
  ok(mf.m.display === 'standalone' && mf.m.start_url === './' && mf.ics.every((x) => x[1] === 200 && /png/.test(x[2])), '설치 설정(manifest.json)이 읽히고 아이콘 2개가 모두 열린다 → ' + mf.ics.map((x) => x[0] + ' ' + x[1]).join(', '));
  await page.click('#btnShortcut'); await page.waitForSelector('#scInstall');
  ok(await page.locator('#scFile').count() === 1 && /1\. 앱처럼 설치하기/.test(await page.textContent('.dlg')), '인터넷 주소로 열면 "1. 앱처럼 설치하기"와 "2. 윈도우 바탕화면용 파일 받기"가 둘 다 보인다');
  await page.click('#scInstall'); await page.waitForTimeout(300);
  ok(/바로 설치할 수 없어요/.test(await page.textContent('#scNote')) || /주소창/.test(await page.textContent('#scNote')), '브라우저가 아직 설치를 허락하지 않았으면 이유 안내가 나온다(안 눌려도 오류 없음)');
  await page.evaluate(() => { const ev = new Event('beforeinstallprompt', { cancelable: true }); ev.prompt = () => { window.__prompted = true; }; ev.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(ev); });
  await page.click('#btnShortcut', { force: true }).catch(() => {}); await page.waitForTimeout(100);
  await page.evaluate(() => { document.getElementById('veil').hidden = true; });
  await page.click('#btnShortcut'); await page.waitForSelector('#scInstall');
  await page.click('#scInstall'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__prompted === true) && await page.evaluate(() => document.getElementById('veil').hidden), '설치가 가능하다는 신호가 오면 단추가 설치 창을 띄우고, 설치를 받아들이면 창이 닫힌다');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled'))); await page.waitForTimeout(200);
  ok(/바로가기가 만들어졌어요/.test(await page.textContent('#toast')), '설치가 끝나면 "바로가기가 만들어졌어요" 알림이 뜬다');

  /* C. 아이폰 */
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 800 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', acceptDownloads: true });
  await ctx2.route('**/*', (r) => { const u = r.request().url(); if (/^(file|data|blob|about):/.test(u)) return r.continue(); if (u.startsWith(SITE)) { const p = u.slice(SITE.length).split(/[?#]/)[0]; if (p === '' || p === 'index.html') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }); return r.fulfill({ status: 404, body: 'nf' }); } return r.abort(); });
  const pg2 = await ctx2.newPage(); pg2.on('pageerror', (e) => errors.push(e.message));
  await pg2.goto(SITE); await pg2.waitForSelector('#paper .sec', { state: 'attached' });
  await pg2.evaluate(() => { document.getElementById('btnShortcut').click(); }); await pg2.waitForSelector('#scInstall');
  ok(/아이폰·아이패드는 이 버튼이 안 돼요/.test(await pg2.textContent('#scNote')), '아이폰에서는 "이 버튼이 안 돼요. 사파리에서 홈 화면에 추가"로 안내한다');
  ok(errors.length === 0, '화면 오류가 없다' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
