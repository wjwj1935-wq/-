/* v103 — 규격 칸 보강 · FAQ 보강 · AI·검색용 글 복사. 파일로 열어(인터넷 막음) 시험한다. 규격 값은 시험용 가짜 값이다. */
const { pathToFileURL } = require('url'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const FILE = B + '/staff/자동몰_상세페이지_제작기_v103.html';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  await ctx.route('**/*', (r) => /^(file|data|blob|about):/.test(r.request().url()) ? r.continue() : r.abort());
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(FILE).href + '#wjdebug');
  await page.waitForFunction(() => window.__wj && window.__wj.GRP && window.__wj.aiText && window.__wj.LIB && window.__wj.LIB.ready, null, { timeout: 15000 }); await page.waitForTimeout(500);
  const ev = (fn, a) => page.evaluate(fn, a);
  const labels = (g) => ev((g) => window.__wj.GRP[g].rows.map((r) => r.l), g);

  /* 1. 규격 칸 보강: 학습에서 확인한 칸이 빈 칸으로 들어가 있다(값은 미리 채우지 않는다) */
  const gl = await labels('glass'), rl = await labels('roll'), fl = await labels('fold'), nl = await labels('net');
  ok(['손잡이 길이', '전체 길이', '주문제작 여부·기간', '교환·반품 조건', 'A/S·보증', '설치 주의'].every((x) => gl.includes(x)) && gl.length === 16, '강화도어: 구멍 센터·손잡이 길이·전체 길이·주문제작·교환/반품·A/S·설치 주의 칸이 있다 → ' + gl.length + '칸');
  ok(['제작 가능 크기(최소~최대)', '크기 재는 방법', '도어클로저가 있을 때', '주문제작 여부·기간', '교환·반품 조건', 'A/S·보증'].every((x) => rl.includes(x)), '현관 롤 방충망: 제작 가능 크기·재는 방법·도어클로저·주문제작·교환/반품·A/S 칸이 있다');
  ok(['제작 가능 크기(최소~최대)', '크기 재는 방법', '교환·반품 조건'].every((x) => fl.includes(x)) && ['교환·반품 조건', 'A/S·보증'].every((x) => nl.includes(x)), '폴딩·원단 방충망에도 해당 칸이 있다');
  ok(await ev(() => window.__wj.GRP.roll.rows.filter((r) => r.fit).length) === 4 && await ev(() => window.__wj.GRP.glass.rows.filter((r) => r.fit).length) === 2, '맞는지 확인 카드 후보: 방충망 4개(크기·설치방식·제작 가능 크기·재는 방법), 강화도어 2개(유리 두께·센터)');

  /* 2. FAQ 보강 */
  const faq = (g) => ev((g) => window.__wj.GRP[g].tpl.faq.map((q) => q.q), g);
  ok((await faq('glass')).includes('손잡이 길이와 센터(고정 간격)는 뭐가 다른가요?') && (await faq('glass')).includes('유리에 구멍이 없으면 나중에 뚫을 수 있나요?'), '강화도어 FAQ에 "센터와 길이" · "나중에 뚫을 수 있나요?"가 들어갔다');
  ok((await faq('roll')).includes('크기는 어디를 어떻게 재나요?') && (await faq('roll')).includes('크기를 잘못 재면 어떻게 되나요?') && (await faq('fold')).includes('크기는 어디를 어떻게 재나요?'), '방충망 FAQ에 재는 위치·잘못 쟀을 때가 들어갔다');
  ok(await ev(() => [].concat(...Object.values(window.__wj.GRP).filter((g) => g.tpl).map((g) => g.tpl.faq.map((q) => q.a))).every((a) => !/\d\s?mm|\d+\s?cm/i.test(a))), 'FAQ 답에는 지어낸 숫자(mm·cm)가 하나도 없다');

  /* 3. AI·검색용 글: 처음엔 값이 없어서 규격·질문 구역이 제 모양으로만 나오고, 값을 적으면 적은 것만 나온다 */
  await ev(() => window.__wj.grpFill('roll'));
  let t = await ev(() => window.__wj.aiText());
  ok(/\[상품명\]/.test(t) && /\[상품군\]\n현관 롤 방충망/.test(t) && !/\[제품 규격\]/.test(t) && /\[자주 묻는 질문\]/.test(t) && /Q\. 크기는 어디를 어떻게 재나요\?/.test(t), '값이 없으면 규격 구역은 안 나오고, 상품명·상품군·질문은 나온다');
  await ev(() => { const x = window.__wj.S().facts.extra; x[0].v = '시험 가로 1000 × 세로 2100'; x[7].v = '시험 범위'; });
  t = await ev(() => window.__wj.aiText());
  ok(/\[제품 규격\]/.test(t) && /- 크기\(가로×세로\): 시험 가로 1000 × 세로 2100/.test(t) && /- 제작 가능 크기\(최소~최대\): 시험 범위/.test(t), '적은 규격만 "- 이름: 값"으로 나온다');
  ok(!/- 교환·반품 조건/.test(t) && !/- A\/S·보증/.test(t), '비워 둔 칸(교환·반품·A/S)은 글에 나오지 않는다');
  ok(/상품정보제공고시/.test(t) && /지어내지 마세요/.test(t), '맨 아래에 "상품정보제공고시는 직접 입력 · 지어내지 마세요" 안내가 있다');

  /* 4. 1단계에 단추가 있고, 누르면 오류 없이 동작한다 */
  ok(await page.locator('#p1 [data-act="copyai"]').count() === 1, '1단계에 "AI·검색용 글 복사" 단추가 하나 있다');
  await page.click('#p1 [data-act="copyai"]'); await page.waitForTimeout(500);
  ok(errors.length === 0, '단추를 눌러도 화면 오류가 없다 → ' + errors.join(' | '));
  await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('ERR', e); process.exit(1); });
