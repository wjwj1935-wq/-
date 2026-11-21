/* 자동몰 상세페이지 제작기 v83 — 스마트스토어 입력 시트(제품 판매 정보 · 스토어 공통 정보 · 복사 · README) */
const http = require('http'), fs = require('fs'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const JSZip = require(B + '/jz/node_modules/jszip');
const HTML = fs.readFileSync(B + '/w/am_work.html', 'utf8'), H2C = fs.readFileSync(B + '/h2c/node_modules/html2canvas/dist/html2canvas.min.js'), JZ = fs.readFileSync(B + '/jz/node_modules/jszip/dist/jszip.min.js');
const WHITE = B + '/up/white_prod.png';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let PORT = 0;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(HTML); });
async function open(browser, ctx0, seed) {
  const ctx = ctx0 || await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url();
    if (/html2canvas\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: H2C });
    if (/jszip\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: JZ });
    if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) return r.continue(); return r.abort(); });
  await page.addInitScript(() => { window.__clip = []; try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__clip.push(t); } } }); } catch (e) {} });
  if (seed) await page.addInitScript((s) => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', s); } catch (e) {} }, JSON.stringify(seed));
  await page.goto('http://127.0.0.1:' + PORT + '/'); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const rowsOf = (page) => page.evaluate(() => [...document.querySelectorAll('#msSheet .sr')].map((r) => ({ k: r.querySelector('b').textContent, v: r.querySelector('.sv').textContent, need: r.classList.contains('need'), copy: !!r.querySelector('[data-mcopy]') })));
const row = (rows, k) => rows.find((r) => r.k === k);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });

  /* 1. 처음: 아무것도 적지 않으면 상품명·고시 참고값·태그만 있고 나머지는 '직접 입력' */
  {
    const { page, errors } = await open(browser, ctx);
    await page.click('#btnMarket'); await page.waitForSelector('#msSheetBlk');
    const rows = await rowsOf(page);
    ok(rows.length === 16 && rows.map((r) => r.k).join('|') === '상품명|카테고리|판매가|할인가|재고 수량|옵션|모델명·상품코드|브랜드|제조사|원산지(제조국)|KC 인증·시험|상품정보제공고시(참고값)|배송|반품·교환|A/S|태그 후보', '시트: 항목 16개가 순서대로 있다 → ' + rows.map((r) => r.k).join('|'));
    ok(rows.filter((r) => r.need).length === 13 && rows.filter((r) => r.need).every((r) => /앱에 입력 안 됨 · 직접 입력/.test(r.v) && !r.copy), '시트: 처음에는 13개 항목이 노란색 "앱에 입력 안 됨 · 직접 입력"이고 복사 단추가 없다(값을 지어내지 않는다)');
    ok(!row(rows, '상품명').need && row(rows, '상품명').copy && /고급스러운 메탈 방문 손잡이/.test(row(rows, '상품명').v) && row(rows, '태그 후보').copy && /방문손잡이/.test(row(rows, '태그 후보').v), '시트: 상품명과 태그 후보는 앱이 만들어 둔 값이라 바로 복사된다');
    ok(/^품명 및 모델명: 고급스러운 메탈 방문 손잡이$/.test(row(rows, '상품정보제공고시(참고값)').v), '시트: 상품정보제공고시 참고값은 아는 것(품명)만 적는다');
    ok(await page.locator('#msWhy').count() === 1 && (await page.locator('#msWhy li').count()) === 7, '분석: "왜 자동으로 안 올라가요?" 칸에 이유 7가지가 있다');
    const why = await page.textContent('#msWhy');
    ok(/커머스API/.test(why) && /열쇠/.test(why) && /확인하지 못했어요|확인 못 함/.test(why) && /시험할 수 없었어요/.test(why), '분석: 길은 있다는 것, 사장님 열쇠가 필요하다는 것, 확인 못 한 것, 시험 못 한 것을 숨기지 않고 적었다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await page.close();
  }

  /* 2. 적으면 시트가 바로 바뀌고, 복사 값은 입력칸에 붙일 수 있게 숫자만 */
  {
    const { page, errors } = await open(browser, ctx);
    await page.click('#btnMarket'); await page.waitForSelector('#msSheetBlk');
    await page.fill('[data-sale="price"]', '45,000'); await page.fill('[data-sale="discount"]', '39000'); await page.fill('[data-sale="stock"]', '100'); await page.fill('[data-sale="model"]', 'WJ-001'); await page.fill('[data-sale="code"]', 'A1');
    await page.fill('[data-sale="opt0n"]', '색상'); await page.fill('[data-sale="opt0v"]', '블랙, 실버'); await page.fill('[data-sale="opt1n"]', '방향'); await page.fill('[data-sale="opt1v"]', '좌, 우'); await page.fill('[data-sale="opt2n"]', '비어 있는 값'); 
    await page.evaluate(() => { document.querySelectorAll('#msSheetBlk details.sub')[1].open = true; });
    const st = { catPath: '스마트스토어센터에서 고른 경로', catId: '50000123', brand: '우진', maker: '우진글로벌 주식회사', origin: '대한민국', shipHow: '택배', shipFee: '무료', shipDays: '2일 이내', bundle: '가능', retFee: '3,000원', exFee: '6,000원', retAddr: '전북 익산 시험 주소', asTel: '063-000-0000', asGuide: '평일 9시~6시' };
    for (const [k, v] of Object.entries(st)) await page.fill('[data-st="' + k + '"]', v);
    await page.waitForTimeout(200);
    const rows = await rowsOf(page);
    ok(row(rows, '판매가').v === '45000원' && row(rows, '할인가').v === '39000원' && row(rows, '재고 수량').v === '100개', '시트: 판매가 "45,000"은 "45000원", 할인가 "39000원", 재고 "100개"로 나온다');
    ok(row(rows, '옵션').v === '색상: 블랙, 실버\n방향: 좌, 우', '시트: 옵션은 이름과 값이 모두 있는 줄만 나온다(이름만 있는 3번째 줄은 뺀다) → ' + JSON.stringify(row(rows, '옵션').v));
    ok(row(rows, '카테고리').v === '스마트스토어센터에서 고른 경로 · 카테고리 번호 50000123' && row(rows, '모델명·상품코드').v === '모델명 WJ-001 · 판매자 상품코드 A1', '시트: 카테고리(경로·번호)와 모델명·상품코드가 한 줄로 나온다');
    ok(row(rows, '배송').v === '배송 방법: 택배\n배송비: 무료\n출고: 2일 이내\n묶음배송: 가능' && row(rows, '반품·교환').v.split('\n').length === 3 && /전화번호: 063-000-0000\n안내: 평일 9시~6시/.test(row(rows, 'A/S').v), '시트: 배송·반품/교환·A/S가 적은 대로 나온다');
    ok(/품명 및 모델명: 고급스러운 메탈 방문 손잡이 \/ WJ-001/.test(row(rows, '상품정보제공고시(참고값)').v) && /제조국\(원산지\): 대한민국/.test(row(rows, '상품정보제공고시(참고값)').v) && /제조자\(수입자\): 우진글로벌 주식회사/.test(row(rows, '상품정보제공고시(참고값)').v) && /A\/S 책임자와 전화번호: 063-000-0000/.test(row(rows, '상품정보제공고시(참고값)').v), '시트: 상품정보제공고시 참고값에 품명·모델명·제조국·제조자·A/S가 들어간다');
    ok(rows.filter((r) => r.need).map((r) => r.k).join('|') === 'KC 인증·시험', '시트: 이제 직접 입력으로 남은 것은 "KC 인증·시험"뿐이다(제품 규격에 인증을 적으면 채워진다) → ' + rows.filter((r) => r.need).map((r) => r.k).join('|'));
    await page.click('[data-mcopy="2"]'); await page.click('[data-mcopy="4"]'); await page.click('[data-mcopy="5"]'); await page.click('[data-mcopy="1"]');
    const clip = await page.evaluate(() => window.__clip);
    ok(clip.join('|') === '45000|100|색상: 블랙, 실버\n방향: 좌, 우|스마트스토어센터에서 고른 경로 · 카테고리 번호 50000123', '복사: 판매가·재고는 숫자만(45000 · 100), 옵션·카테고리는 시트 그대로 복사된다 → ' + JSON.stringify(clip));
    ok(/복사했어요/.test(await page.textContent('#toast')), '복사: "복사했어요" 안내가 나온다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await page.waitForTimeout(700); await page.close();
  }

  /* 3. 닫았다 다시 열어도·새로고침해도 남는다 / 새 제품에서는 제품 값만 비워지고 스토어 공통 값은 남는다 */
  {
    const { page, errors } = await open(browser, ctx);
    await page.click('#btnMarket'); await page.waitForSelector('#msSheetBlk');
    ok(await page.inputValue('[data-sale="price"]') === '45,000' && await page.inputValue('[data-st="brand"]') === '우진' && await page.inputValue('[data-sale="opt1v"]') === '좌, 우', '저장: 새로고침해도 제품 판매 정보와 스토어 공통 정보가 그대로 있다');
    await page.keyboard.press('Escape');
    page.on('dialog', (d) => d.accept());
    await page.click('#btnNew'); await page.waitForSelector('#nwGo'); await page.click('#nwGo'); await page.waitForTimeout(500);
    await page.click('#btnMarket'); await page.waitForSelector('#msSheetBlk');
    ok(await page.inputValue('[data-sale="price"]') === '' && await page.inputValue('[data-sale="opt0v"]') === '' && await page.inputValue('[data-sale="model"]') === '', '새 제품: 판매가·재고·옵션·모델명은 비워진다(제품마다 다르니까)');
    ok(await page.inputValue('[data-st="brand"]') === '우진' && await page.inputValue('[data-st="asTel"]') === '063-000-0000' && await page.inputValue('[data-st="shipFee"]') === '무료', '새 제품: 브랜드·A/S·배송 같은 스토어 공통 값은 그대로 남는다');
    const rows = await rowsOf(page);
    ok(row(rows, '브랜드').v === '우진' && row(rows, '판매가').need, '새 제품: 시트에도 공통 값은 있고 판매가는 다시 "직접 입력"이다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await page.close();
  }

  /* 4. 제품 규격(제조국·인증·재질·색상)이 시트에 이어진다 / 위험한 글자는 글로만 보인다 */
  {
    const { page, errors } = await open(browser, ctx);
    await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
    await page.fill('[data-k="facts.origin"]', '중국'); await page.fill('[data-k="facts.cert"]', 'KC 시험번호 123'); await page.fill('[data-k="facts.material"]', '시험 재질'); await page.fill('[data-k="facts.finish"]', '무광 블랙');
    await page.click('#btnMarket'); await page.waitForSelector('#msSheetBlk');
    await page.evaluate(() => document.querySelectorAll('#msSheetBlk details.sub')[1].open = true);
    await page.fill('[data-st="origin"]', '대한민국'); await page.fill('[data-st="brand"]', '<img src=x onerror="window.__x=1"><b>굵게</b>'); await page.waitForTimeout(200);
    const rows = await rowsOf(page);
    ok(row(rows, '원산지(제조국)').v === '중국' && row(rows, 'KC 인증·시험').v === 'KC 시험번호 123', '이어짐: 제품 규격에 적은 제조국(중국)이 스토어 공통 원산지(대한민국)보다 우선이고, 인증도 시트에 나온다');
    ok(/재질: 시험 재질\n색상: 무광 블랙/.test(row(rows, '상품정보제공고시(참고값)').v) && /법에 의한 인증·허가: KC 시험번호 123/.test(row(rows, '상품정보제공고시(참고값)').v), '이어짐: 상품정보제공고시 참고값에 재질·색상·인증이 들어간다');
    ok(row(rows, '브랜드').v === '<img src=x onerror="window.__x=1"><b>굵게</b>' && (await page.evaluate(() => window.__x)) === undefined && await page.locator('#msSheet img, #msSheet b b').count() === 0, '안전: <img onerror…> 같은 글자를 적어도 실행되지 않고 글로만 보인다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await page.close();
  }

  /* 5. 안내 글(README): 시트가 들어가고 비어 있는 항목은 '직접 입력'으로 적힌다 */
  {
    const c5 = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
    const { page, errors } = await open(browser, c5);
    await page.locator('input[data-file="src"]').first().setInputFiles(WHITE); await page.waitForTimeout(2200);
    await page.click('#btnMarket'); await page.waitForSelector('#msGo');
    await page.fill('[data-sale="price"]', '45000'); await page.fill('[data-sale="stock"]', '100'); await page.fill('[data-sale="opt0n"]', '색상'); await page.fill('[data-sale="opt0v"]', '블랙, 실버');
    await page.click('#msGo'); await page.waitForFunction(() => /다 만들었어요/.test((document.querySelector('#msMsg') || {}).textContent || ''), null, { timeout: 180000 });
    const dl = page.waitForEvent('download'); await page.click('#msZip'); const d = await dl; await d.saveAs(B + '/mkt_out/sheet.zip');
    const z = await JSZip.loadAsync(fs.readFileSync(B + '/mkt_out/sheet.zip')), rd = await z.files['README.txt'].async('string');
    ok(/\[스마트스토어 입력 시트\] 앱에 적어 둔 값이에요\./.test(rd) && /\r\n- 판매가: 45000원\r\n/.test(rd) && /\r\n- 재고 수량: 100개\r\n/.test(rd) && /\r\n- 옵션: 색상: 블랙, 실버\r\n/.test(rd), 'README: "스마트스토어 입력 시트"에 적은 판매가·재고·옵션이 들어간다');
    ok(/\r\n- 카테고리: \(앱에 입력 안 됨 · 직접 입력\)\r\n/.test(rd) && /\r\n- 할인가: \(앱에 입력 안 됨 · 직접 입력\)\r\n/.test(rd), 'README: 안 적은 항목은 "(앱에 입력 안 됨 · 직접 입력)"으로 적힌다');
    ok(rd.indexOf('[스마트스토어 입력 시트]') > rd.indexOf('6. 아래 [직접 입력해야 하는 항목]') && rd.indexOf('[스마트스토어 입력 시트]') < rd.indexOf('[직접 입력해야 하는 항목] 이 앱이'), 'README: 올리는 순서 뒤, "직접 입력해야 하는 항목" 앞에 시트가 있다');
    ok(/- 상품명: 고급스러운 메탈 방문 손잡이\r\n/.test(rd) && /- 태그 후보: 방문손잡이/.test(rd), 'README: 시트의 맨 앞은 상품명이고 태그 후보도 같이 있다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors)); await page.close(); await c5.close();
  }

  /* 6. 예전 저장본(판매 정보 없음)도 열린다 */
  {
    const c2 = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const { page, errors } = await open(browser, c2, { v: 3, name: '예전 저장본', hero: { badge: 'a', title: 'b', sub: 'c' } });
    await page.click('#btnMarket'); await page.waitForSelector('#msSheetBlk');
    ok((await rowsOf(page)).length === 16 && await page.inputValue('[data-sale="price"]') === '', '예전 저장본: 판매 정보가 없어도 열리고 입력칸은 비어 있다');
    ok(errors.length === 0, '예전 저장본: 오류 없음 ' + JSON.stringify(errors)); await c2.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건'); process.exit(fails ? 1 : 0);
})();
