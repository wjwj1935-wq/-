/* 자동몰 상세페이지 제작기 v77 — 제품 규격(백셋·문 두께·재질·구성품) 입력칸과 상세페이지 구역 시험 */
const http = require('http'), fs = require('fs'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const JSZip = require(B + '/jz/node_modules/jszip');
const HTML = fs.readFileSync(B + '/w/am_work.html', 'utf8');
const H2C = fs.readFileSync(B + '/h2c/node_modules/html2canvas/dist/html2canvas.min.js');
const JZ = fs.readFileSync(B + '/jz/node_modules/jszip/dist/jszip.min.js');
const WHITE = B + '/up/white_prod.png';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let PORT = 0;
const server = http.createServer((q, r) => { if (q.url.split('?')[0] === '/') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(HTML); } else { r.writeHead(404); r.end('no'); } });
async function open(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url();
    if (/html2canvas\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: H2C });
    if (/jszip\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: JZ });
    if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) return r.continue(); return r.abort(); });
  await page.addInitScript(() => {   // html2canvas는 원본 그대로 두고, 어느 구역을 그렸는지만 기록한다
    let h = null; window.__h2c = [];
    Object.defineProperty(window, 'html2canvas', { configurable: true, get() { return h; }, set(v) { if (typeof v === 'function') { const f = function (el) { window.__h2c.push(el && el.dataset && el.dataset.slice); return v.apply(this, arguments); }; Object.assign(f, v); h = f; } else h = v; } });
  });
  if (seed) await page.addInitScript((s) => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', s); } catch (e) {} }, JSON.stringify(seed));
  await page.goto('http://127.0.0.1:' + PORT + '/'); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(800);
  return { ctx, page, errors };
}
const openSub = (page) => page.evaluate(() => { document.querySelectorAll('#side details').forEach((d) => { d.open = true; }); });
const fill = async (page, k, v) => { await page.fill('[data-k="' + k + '"]', v); await page.waitForTimeout(120); };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 처음(아무것도 안 적음): 안내 칸만, 기본 질문 답에 근거 없는 말이 없다 */
  {
    const { ctx, page, errors } = await open(browser);
    await openSub(page);
    ok(await page.locator('#s-facts').count() === 1 && /제품 규격/.test(await page.textContent('#s-facts summary')), '입력칸: 4단계에 "제품 규격" 묶음이 있다');
    const keys = await page.evaluate(() => [...document.querySelectorAll('#s-facts [data-k]')].map((e) => e.dataset.k));
    ok(['backset', 'thick', 'bore', 'material', 'finish', 'dir', 'parts', 'origin', 'cert', 'note'].every((k) => keys.indexOf('facts.' + k) >= 0), '입력칸: 백셋·문 두께·문 구멍·재질·마감·방향·구성품·제조국·인증·작은 글 칸이 있다 → ' + keys.join(','));
    ok(keys.every((k) => { return true; }) && (await page.evaluate(() => [...document.querySelectorAll('#s-facts input[data-k], #s-facts textarea[data-k]')].every((e) => e.value === ''))), '입력칸: 처음에는 모두 비어 있다(숫자를 미리 채워 두지 않는다)');
    ok(await page.locator('#paper [data-slice="02_규격"] .sizeph').count() === 1 && await page.locator('#paper .fxrow').count() === 0, '미리보기: 아직 안 적으면 안내 칸만 나온다(표는 없다)');
    const names = await page.evaluate(() => [...document.querySelectorAll('#paper [data-slice]')].map((s) => s.dataset.slice));
    ok(names[1] === '01_핵심포인트' && names[2] === '02_소개' && names[3] === '02_규격' && names[4] === '03_확대', '순서: (핵심 포인트) → 소개 → 제품 규격 → 확대 순서로 들어간다 → ' + names.join(' / '));
    const txt = await page.textContent('#paper');
    ok(!/대부분 규격이 비슷해요/.test(txt) && !/은회색 계열/.test(txt), '기본 질문 답: "대부분 규격이 비슷해요", "은회색 계열" 같은 근거 없는 말이 없다');
    ok(/문 두께와 문 구멍\(백셋\) 크기를 먼저 확인해 주세요/.test(txt) && /정확한 색상 이름과 다른 색상은 판매자에게 문의해 주세요/.test(txt), '기본 질문 답: 확인하라는 말로 바뀌었다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 2. 적으면 표가 나온다 · 숫자에는 mm · 안 적은 줄은 안 나온다 · 눌러서 고치기 */
  let SAVED = null;
  {
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(WHITE); await page.waitForTimeout(2200);
    await openSub(page);
    await fill(page, 'facts.backset', '60'); await fill(page, 'facts.thick', '35~45'); await fill(page, 'facts.bore', '54'); await fill(page, 'facts.material', '시험용 재질 이름');
    await fill(page, 'facts.finish', '무광 블랙'); await fill(page, 'facts.dir', '좌우 공용'); await fill(page, 'facts.parts', '레버 2개, 받침 2개'); await fill(page, 'facts.origin', '대한민국');
    await page.click('#s-facts [data-act="add"][data-l="facts.extra"]'); await page.waitForTimeout(200);
    await fill(page, 'facts.extra.0.l', '손잡이 무게'); await fill(page, 'facts.extra.0.v', '300g');
    await fill(page, 'facts.note', '※ 시험용 작은 글');
    await page.waitForTimeout(500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#paper .fxrow')].map((r) => [r.querySelector('b').textContent, r.querySelector('span').textContent]));
    console.log('   표:', rows.map((r) => r.join('=')).join(' | '));
    ok(rows.length === 9 && rows[0][0] === '백셋' && rows[0][1] === '60mm' && rows[1][1] === '35~45mm' && rows[2][1] === '54mm', '표: 숫자만 적으면 mm가 붙고(60mm · 35~45mm · 54mm) 줄이 순서대로 나온다');
    ok(rows[3][1] === '시험용 재질 이름' && rows[4][1] === '무광 블랙' && rows.some((r) => r[0] === '손잡이 무게' && r[1] === '300g'), '표: 글로 적은 칸은 적은 그대로, 기타 규격도 나온다');
    ok(!rows.some((r) => r[0] === '인증·시험'), '표: 안 적은 "인증·시험" 줄은 나오지 않는다(지어내지 않는다)');
    ok(/※ 시험용 작은 글/.test(await page.textContent('#paper [data-slice="02_규격"] .note')) && await page.locator('#paper [data-slice="02_규격"] .sizeph').count() === 0, '표: 맨 아래 작은 글이 나오고 안내 칸은 사라진다');
    // 글자 모양: 폰에서 읽히게 26px 이상
    const fs2 = await page.evaluate(() => [...document.querySelectorAll('#paper .fxrow b, #paper .fxrow span')].map((e) => parseFloat(getComputedStyle(e).fontSize)));
    ok(fs2.every((f) => f >= 26), '표: 글자가 모두 26px 이상이다(폰에서 약 12px) → 최소 ' + Math.min(...fs2));
    // 눌러서 고치기
    await page.evaluate(() => document.querySelectorAll('#side details.sub').forEach((d) => { d.open = false; }));
    await page.click('#paper .fxrow >> nth=1'); await page.waitForTimeout(500);
    const act = await page.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.k);
    ok(act === 'facts.thick' && await page.evaluate(() => document.querySelector('#s-facts').open), '눌러서 고치기: 표의 "적용 문 두께" 줄을 누르면 그 입력칸이 열리고 커서가 간다 → ' + act);
    // 쇼핑몰 올리기: 올리는 이미지에 규격 구역이 들어가고, 안내 글에 값이 적힌다
    await page.click('#btnMarket'); await page.waitForSelector('#msGo'); await page.click('#msGo');
    await page.waitForFunction(() => /다 만들었어요/.test((document.querySelector('#msMsg') || {}).textContent || ''), null, { timeout: 180000 });
    const sl = await page.evaluate(() => window.__h2c);
    ok(sl.indexOf('02_규격') >= 0, '올리는 상세 이미지: 규격 구역이 그려진다 → ' + sl.join(','));
    const dl = page.waitForEvent('download'); await page.click('#msZip'); const d = await dl; await d.saveAs(B + '/mkt_out/facts.zip');
    const z = await JSZip.loadAsync(fs.readFileSync(B + '/mkt_out/facts.zip')), rd = await z.files['README.txt'].async('string');
    ok(/\[앱에 입력해 둔 제품 규격\][^\r\n]*\r\n- 백셋: 60mm\r\n- 적용 문 두께: 35~45mm\r\n- 문 구멍 지름: 54mm\r\n- 재질: 시험용 재질 이름/.test(rd) && /- 손잡이 무게: 300g/.test(rd) && !/- 인증·시험/.test(rd), 'README: "앱에 입력해 둔 제품 규격"에 적은 값 그대로 들어가고 안 적은 줄은 없다');
    ok(rd.indexOf('[앱에 입력해 둔 제품 규격]') < rd.indexOf('[직접 입력해야 하는 항목] 이 앱이'), 'README: 입력해 둔 규격이 "직접 입력해야 하는 항목"보다 앞에 있다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await page.waitForTimeout(900);
    SAVED = await page.evaluate(() => localStorage.getItem('am-dp-v1'));
    await ctx.close();
  }

  /* 3. 저장·다시 열기 / 예전 저장본(규격 없음) */
  {
    const { ctx, page, errors } = await open(browser, JSON.parse(SAVED));
    ok(await page.locator('#paper .fxrow').count() === 9, '다시 열기: 저장해 둔 규격 9줄이 그대로 나온다');
    await ctx.close();
    const old = { v: 3, name: '예전 저장본', hero: { badge: 'a', title: 'b', sub: 'c' } };   // facts 없음
    const o = await open(browser, old);
    await openSub(o.page);
    ok(await o.page.locator('#paper .fxrow').count() === 0 && await o.page.locator('#s-facts [data-k="facts.backset"]').count() === 1, '예전 저장본: 규격이 없어도 열리고 입력칸은 비어 있다');
    ok(o.errors.length === 0, '예전 저장본: 오류 없음 ' + JSON.stringify(o.errors));
    await o.ctx.close();
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
  }

  /* 4. 규격을 안 적으면 올리는 이미지에서 빠지고, 영상 글에 규격 한 줄이 들어간다 */
  {
    const { ctx, page, errors } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(WHITE); await page.waitForTimeout(2200);
    await page.click('#btnMarket'); await page.waitForSelector('#msGo'); await page.click('#msGo');
    await page.waitForFunction(() => /다 만들었어요/.test((document.querySelector('#msMsg') || {}).textContent || ''), null, { timeout: 180000 });
    const sl = await page.evaluate(() => window.__h2c);
    ok(sl.indexOf('02_규격') < 0 && sl.indexOf('02_소개') >= 0, '안 적었을 때: 올리는 상세 이미지에 규격 구역이 없다(빈 칸은 빠진다) → ' + sl.join(','));
    const dl = page.waitForEvent('download'); await page.click('#msZip'); const d = await dl; await d.saveAs(B + '/mkt_out/nofacts.zip');
    const z = await JSZip.loadAsync(fs.readFileSync(B + '/mkt_out/nofacts.zip')), rd = await z.files['README.txt'].async('string');
    ok(rd.indexOf('[앱에 입력해 둔 제품 규격]') < 0, '안 적었을 때: README에 규격 목록이 없다');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // 영상 글
    await openSub(page); await fill(page, 'facts.backset', '60'); await fill(page, 'facts.thick', '35~45'); await fill(page, 'facts.material', '시험용 재질');
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    await page.evaluate(() => document.querySelectorAll('input[data-vsec]').forEach((c) => { const on = /마지막/.test(c.dataset.vsec); if (c.checked !== on && !c.disabled) c.click(); }));
    await page.click('input[name=vspeed][value=fast]'); await page.click('#vdGo'); await page.waitForSelector('#vdSave', { timeout: 180000 });
    await page.click('#vdClose'); await page.waitForTimeout(200);
    await page.click('#btnPost'); await page.waitForSelector('#ytGo, #mkGo');
    const ys = await page.evaluate(() => { const e = document.querySelector('[data-yp="d"]'); return e ? e.value : ''; });
    ok(/크기: 총 길이|규격: 백셋 60mm · 적용 문 두께 35~45mm · 재질 시험용 재질/.test(ys) && /규격: 백셋 60mm · 적용 문 두께 35~45mm · 재질 시험용 재질/.test(ys), '영상 글: 설명에 "규격: 백셋 60mm · 적용 문 두께 35~45mm · 재질 …" 한 줄이 들어간다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건'); process.exit(fails ? 1 : 0);
})();
