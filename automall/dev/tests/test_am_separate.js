/* 자동몰(v100)이 손잡이 제작기(v99)와 "따로" 작동하는지 시험:
   같은 github.io 주소(같은 브라우저 저장 공간)에 두 앱을 나란히 열어 두고, 저장·사진 보관소·키·버전 확인이 섞이지 않는지 본다. */
const fs = require('fs'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const ORIGIN = 'https://wjwj1935-wq.github.io', U99 = ORIGIN + '/-/', UAM = ORIGIN + '/-/automall/';
const H99 = fs.readFileSync(B + '/staff/상세페이지_제작기_v99.html', 'utf8'), HAM = fs.readFileSync(B + '/staff/자동몰_상세페이지_제작기_v103.html', 'utf8');
const PHOTO = B + '/up/white_prod.png';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const reqs = [];
  await ctx.route('**/*', (r) => {
    const u = r.request().url(), nu = u.split(/[?#]/)[0];
    if (/^(file|data|blob|about):/.test(u)) return r.continue();
    if (u.startsWith(ORIGIN)) {
      reqs.push(nu);
      if (nu === U99 || nu === U99 + 'index.html') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: H99 });
      if (nu === UAM || nu === UAM + 'index.html') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HAM });
      if (nu === U99 + 'version.json') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"v":99}' });
      if (nu === UAM + 'version.json') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"v":100}' });
      return r.fulfill({ status: 404, body: 'nf' });
    }
    return r.abort();
  });
  const errors = [];
  const open = async (url) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(url + '#wjdebug'); await p.waitForSelector('#paper .sec', { state: 'attached', timeout: 20000 }); await p.waitForFunction(() => window.__wj && window.__wj.LIB && window.__wj.LIB.ready, null, { timeout: 15000 }); await p.waitForTimeout(600); return p; };
  const keys = (p) => p.evaluate(() => Object.keys(localStorage).sort());
  const dbs = (p) => p.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
  const libN = (p) => p.evaluate(() => window.__wj.LIB.list.length);
  const nameOf = (p) => p.inputValue('[data-k="name"]');

  /* 1. 손잡이 제작기(99)에서 제품 하나를 만든다 */
  let a = await open(U99);
  ok(/버전 99/.test(await a.textContent('.brand small')) && await a.title() === '손잡이 상세페이지 제작기', '(99) 열린 앱은 "손잡이 상세페이지 제작기 · 버전 99"이다');
  await a.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await a.waitForTimeout(2200);
  await a.fill('[data-k="name"]', '99번 손잡이'); await a.waitForTimeout(3200);
  const k99 = await keys(a), d99 = await dbs(a);
  ok(k99.includes('wj-dp-v3') && d99.includes('wj-dp') && await libN(a) === 1, '(99) 작업 상태는 wj-dp-v3, 사진·내 상세페이지 보관소는 wj-dp에 저장되고 "내 상세페이지"가 1개다');
  ok(!k99.some((k) => /^am-/.test(k)) && !d99.includes('am-dp'), '(99) 자동몰 이름(am-…)의 저장 공간은 만들어지지 않았다');

  /* 2. 같은 주소·같은 브라우저에서 자동몰(100)을 연다 → 99의 작업이 안 보여야 한다 */
  const b = await open(UAM);
  ok(/버전 103/.test(await b.textContent('.brand small')) && await b.title() === '자동몰 상세페이지 제작기' && (await b.textContent('.brand h1')) === '자동몰 상세페이지 제작기', '(자동몰) 열린 앱은 "자동몰 상세페이지 제작기 · 버전 103"이다');
  ok(await nameOf(b) !== '99번 손잡이' && await libN(b) === 0 && !/내 상세페이지 \d/.test(await b.textContent('#btnLib')), '(자동몰) 99에서 만든 제품(이름·사진·내 상세페이지)이 보이지 않고 처음 상태로 열린다');
  const before = await keys(b);
  await b.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await b.waitForTimeout(2200);
  await b.fill('[data-k="name"]', '자동몰 제품'); await b.waitForTimeout(3200);
  await b.evaluate(() => { document.querySelector('#p2').open = true; });
  await b.fill('#gKey', 'AIzaFAKE_TEST_KEY'); await b.check('#gRem'); await b.waitForTimeout(500);
  const kAm = await keys(b), dAm = await dbs(b), newK = kAm.filter((k) => !before.includes(k));
  ok(kAm.includes('am-dp-v1') && dAm.includes('am-dp') && await libN(b) === 1, '(자동몰) 작업 상태는 am-dp-v1, 사진·내 상세페이지 보관소는 am-dp에 따로 저장되고 "내 상세페이지"가 1개다');
  ok(kAm.includes('am-gk') && !kAm.includes('wj-gk') && newK.every((k) => /^am-/.test(k)), '(자동몰) "기억하기"로 저장한 키는 am-gk에 저장되고, 새로 생긴 저장 이름은 전부 am-으로 시작한다 → ' + newK.join(', '));
  ok(await a.evaluate(() => JSON.parse(localStorage.getItem('wj-dp-v3')).name) === '99번 손잡이' && (await keys(a)).includes('wj-dp-v3'), '(99) 자동몰이 저장하는 동안에도 99의 저장본은 그대로(이름 "99번 손잡이")다');

  /* 3. 99를 새로 고쳐도 자기 것만 보인다 */
  await a.reload(); await a.waitForSelector('#paper .sec', { state: 'attached' }); await a.waitForFunction(() => window.__wj && window.__wj.LIB && window.__wj.LIB.ready); await a.waitForTimeout(800);
  ok(await nameOf(a) === '99번 손잡이' && await libN(a) === 1 && await b.evaluate(() => window.__wj.LIB.list[0].name || '') !== '99번 손잡이', '(99) 새로 고쳐도 99의 제품만 보이고, 자동몰의 제품은 99의 "내 상세페이지"에 섞이지 않는다');

  /* 4. 새 버전 확인은 각자 자기 주소의 version.json만 본다 */
  await b.waitForTimeout(1500);
  const amChecks = reqs.filter((u) => u === UAM + 'version.json').length, rootChecks = reqs.filter((u) => u === U99 + 'version.json').length;
  ok(amChecks >= 1 && rootChecks >= 1, '새 버전 확인: 자동몰은 /-/automall/version.json, 99는 /-/version.json을 본다(자동몰 ' + amChecks + '번 · 99 ' + rootChecks + '번)');
  const bReqs = []; b.on('request', (r) => bReqs.push(r.url().split(/[?#]/)[0]));
  await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await b.waitForTimeout(800);
  ok(!bReqs.includes(U99 + 'version.json'), '자동몰 화면은 99의 version.json(/-/version.json)을 보지 않는다');

  /* 5. 99에서 "작업 저장"한 파일을 자동몰에서 "파일 불러오기"로 열 수 있다(이동 길) */
  const [dz] = await Promise.all([a.waitForEvent('download', { timeout: 30000 }), a.click('#btnSave')]);
  const zp = B + '/staff/test_am_import.zip'; await dz.saveAs(zp);
  await b.setInputFiles('#loadFile', zp); await b.waitForTimeout(3000);
  ok(await nameOf(b) === '99번 손잡이', '99에서 저장한 작업 파일(zip)을 자동몰에서 열면 그 제품("99번 손잡이")이 그대로 열린다');
  await b.waitForTimeout(3000);
  ok(await libN(b) >= 2 && await libN(a) === 1, '불러온 제품과 원래 자동몰 제품이 자동몰의 "내 상세페이지"에 보관되고, 99의 목록은 그대로 1개다(자동몰 ' + await libN(b) + ' · 99 ' + await libN(a) + ')');
  ok(errors.length === 0, '화면 오류가 없다' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
