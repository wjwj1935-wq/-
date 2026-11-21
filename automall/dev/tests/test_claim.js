/* v99 근거가 필요한 표현 점검 — 파일로 열어(인터넷 막음) 시험한다. 클로드·구글은 쓰지 않는다 */
const fs = require('fs'), { pathToFileURL } = require('url'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const FILE = B + '/staff/자동몰_상세페이지_제작기_v101.html';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  await ctx.route('**/*', (r) => /^(file|data|blob|about):/.test(r.request().url()) ? r.continue() : r.abort());
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(FILE).href + '#wjdebug');
  await page.waitForFunction(() => window.__wj && window.__wj.claimScan, null, { timeout: 15000 });
  const ev = (fn, a) => page.evaluate(fn, a);
  const setS = (patch) => ev((p) => { const S = window.__wj.S(); const set = (o, k, v) => { if (v && typeof v === 'object' && !Array.isArray(v)) { o[k] = o[k] || {}; for (const q in v) set(o[k], q, v[q]); } else o[k] = v; }; for (const k in p) set(S, k, p[k]); }, patch);
  const reset = () => ev(() => { const S = window.__wj.S(); S.name = '시험 손잡이'; S.hero.title = '우리 집 문에 어울리는 손잡이'; S.hero.sub = '문에 달았을 때의 모습을 먼저 보세요.'; S.concept.title = '둥근 레버'; S.concept.body = '둥근 레버가 손에 편하게 잡혀요.'; S.about.stats = [{ v: '2017~', l: '문 손잡이를 만들어 온 기록' }]; S.about.patents.forEach((p) => { p.no = ''; }); S.facts.cert = ''; });
  const scan = () => ev(() => window.__wj.claimScan().map((x) => ({ lvl: x.lvl, rule: x.rule, lab: x.lab, words: x.words, text: x.text })));
  const items = () => ev(() => window.__wj.claimItems().map((x) => ({ lvl: x.lvl, id: x.id, text: x.text })));

  /* 1. 처음 상태: 헛걸림이 없다 · 회사 소개 숫자 알림만 */
  let it = await items();
  ok(it.length === 1 && it[0].id === 'claim_aboutstat' && it[0].lvl === 'warn' && /11 등록 특허/.test(it[0].text), '처음 상태: 걸리는 것은 "회사 소개의 11 등록 특허인데 번호 카드가 비어 있음" 알림 하나뿐이다(기본 글 59칸에 헛걸림 없음)');

  /* 2. 과장 말 → ⛔ */
  await reset(); await setS({ hero: { title: '세계 최고의 완벽한 손잡이' } });
  let sc = await scan(), ov = sc.filter((x) => x.rule === 'over');
  ok(ov.length === 1 && ov[0].lvl === 'bad' && ov[0].words.includes('최고') && ov[0].words.includes('완벽') && ov[0].lab === '첫 화면 제목', '과장 말: "최고"·"완벽"이 첫 화면 제목에서 ⛔로 나온다 → ' + (ov[0] && ov[0].text));
  await reset(); await setS({ concept: { body: '이 제품은 100% 수작업이고 국내 최초예요. 11위가 아니라 1위예요.' } });
  sc = await scan(); ov = sc.filter((x) => x.rule === 'over');
  ok(ov.length === 1 && ['100%', '최초', '1위'].every((w) => ov[0].words.includes(w)), '"100%"·"최초"·"1위"를 잡는다 → ' + (ov[0] && ov[0].words.join(',')));
  await reset(); await setS({ concept: { body: '월 11위 안에 든 적은 없고 21위였어요.' } });
  ok((await scan()).filter((x) => x.rule === 'over').length === 0, '"11위"·"21위"처럼 앞에 숫자가 붙은 것은 "1위"로 오해하지 않는다');

  /* 3. 특허: 번호가 없으면 ⛔, 있으면 ⚠(이 제품 것인지 확인) */
  await reset(); await setS({ concept: { body: '특허 받은 둥근 구조예요.' } });
  let p = (await scan()).find((x) => x.rule === 'pat');
  ok(p && p.lvl === 'bad' && /번호가 없어요/.test(p.text), '특허: 회사 소개에 특허 번호가 없으면 ⛔ → ' + (p && p.text.slice(0, 40)));
  await ev(() => { window.__wj.S().about.patents[0].no = '10-1234567'; });
  p = (await scan()).find((x) => x.rule === 'pat');
  ok(p && p.lvl === 'warn' && /이 제품 것이 맞는지/.test(p.text), '특허 번호가 있으면 ⚠로 낮아지고 "이 제품 것이 맞는지 확인" 안내가 나온다');

  /* 4. 인증: 규격의 인증·시험 칸이 비면 ⛔, 채우면 ⚠ */
  await reset(); await setS({ hero: { sub: 'KC 인증을 받은 안전한 손잡이' } });
  let c = (await scan()).find((x) => x.rule === 'cert');
  ok(c && c.lvl === 'bad' && c.words.includes('KC') && c.words.includes('인증'), '인증: 규격의 인증·시험 칸이 비어 있으면 ⛔(KC·인증)');
  await setS({ facts: { cert: 'KC 제 CB0000-00-0000호' } });
  c = (await scan()).find((x) => x.rule === 'cert');
  ok(c && c.lvl === 'warn', '인증·시험 칸에 적으면 ⚠로 낮아진다');

  /* 5. 알려만 주는 말: 방수·항균·스마트·비교 → ⚠ 이고 저장을 막지 않는다 */
  await reset(); await setS({ concept: { body: '방수 처리와 항균 코팅, 스마트한 친환경 설계예요. 타사보다 가장 튼튼해요.' } });
  sc = await scan();
  ok(['perf', 'tech', 'cmp'].every((r) => sc.some((x) => x.rule === r && x.lvl === 'warn')) && !sc.some((x) => x.lvl === 'bad'), '방수·항균(성능) / 스마트·친환경(기술) / 타사·가장 튼튼(비교)은 ⚠만 나오고 ⛔는 없다');
  let g = await ev(() => { const g = window.__wj.gateInfo(); return { hard: g.hard.length, soft: g.soft.length }; });
  ok(g.hard === 0 && g.soft >= 3, '그래서 이미지 저장 점검표에서는 "확인해 보세요"(soft)에만 들어가고 저장은 막히지 않는다(걸린 곳 ' + g.hard + ' · 확인 ' + g.soft + ')');

  /* 6. 근거 자료 자체는 검사하지 않는다 */
  await reset(); await setS({ about: { body: '국내 최초 특허 100% 인증 회사', stats: [{ v: '2017~', l: '문 손잡이 최고 기록' }] }, facts: { cert: 'KC 인증 완벽', note: '최고' } });
  await ev(() => { window.__wj.S().sale = Object.assign({}, window.__wj.S().sale, { price: '최고가', model: '완벽-1' }); });
  ok((await scan()).length === 0, '회사 소개(about)·규격(facts)·판매 정보(sale)에 쓴 말은 근거 자료라서 걸리지 않는다');

  /* 7. 같은 종류가 많으면 3곳까지만 보이고 "N곳 더" */
  await reset(); await setS({ hero: { title: '최고', sub: '최고' }, concept: { title: '최고', body: '최고' }, name: '최고 손잡이' });
  sc = await scan(); ov = sc.filter((x) => x.rule === 'over');
  ok(ov.length === 4 && /2곳 더/.test(ov[3].text) && ov.slice(0, 3).every((x) => x.words.includes('최고')), '같은 종류가 5곳이면 3곳만 자세히 보이고 "2곳 더 있어요"가 붙는다');

  /* 8. 이미지로 저장: ⛔는 "알고 있어요" 체크 전에는 저장이 잠긴다 */
  await reset(); await setS({ hero: { title: '완벽한 손잡이' } });
  await ev(() => window.__wj.showExport());
  await page.waitForSelector('#exGo');
  const exTxt = await page.textContent('.dlg');
  ok(/저장하기 전에 걸린 곳/.test(exTxt) && /"완벽" — 첫 화면 제목/.test(exTxt), '이미지로 저장 창: "저장하기 전에 걸린 곳"에 "완벽 — 첫 화면 제목"이 나온다');
  ok(await page.locator('#exGo').isDisabled(), '체크 전에는 "한 장으로 저장" 단추가 잠겨 있다');
  await page.check('#exAck'); ok(!(await page.locator('#exGo').isDisabled()), '"알고 있어요"에 체크하면 저장 단추가 켜진다');
  await page.evaluate(() => { document.getElementById('exClose').click(); });
  await reset(); await ev(() => window.__wj.showExport()); await page.waitForSelector('#exGo');
  ok(!/"완벽"/.test(await page.textContent('.dlg')), '글을 고치면(과장 말 삭제) 점검표에서 사라진다');
  await page.evaluate(() => { document.getElementById('exClose').click(); });

  /* 9. 영상 만들기: 만들기 전 점검에도 같은 내용 · ⛔면 체크 전에는 잠김 */
  await reset(); await setS({ concept: { body: '특허받은 구조예요.' } });
  await ev(() => { window.__wj.PRE.ack = false; window.__wj.showVideo(); });
  await page.waitForSelector('#preBox');
  const pb = await page.textContent('#preBox');
  ok(/"특허" — 소개 글/.test(pb) && /⛔/.test(pb), '영상 창의 "만들기 전 점검"에 "특허 — 소개 글"이 ⛔로 나온다');
  ok(await ev(() => window.__wj.preLocked('video')) === true, '체크 전에는 영상 만들기가 잠겨 있다(preLocked)');
  await page.check('[data-pre="ack"]'); ok(await ev(() => window.__wj.preLocked('video')) === false, '"확인했어요"에 체크하면 풀린다');
  await page.evaluate(() => { document.getElementById('vdClose').click(); });

  /* 10. 쇼핑몰에 올리기 창: 있을 때만 안내 상자 */
  await reset(); await setS({ hero: { title: '혁신적인 손잡이' } });
  await page.click('#btnMarket'); await page.waitForSelector('#msBody');
  ok(await page.locator('#claimNote').count() === 1 && /혁신/.test(await page.textContent('#claimNote')), '쇼핑몰에 올리기 창 맨 위에 "글의 표현을 확인하세요" 상자와 "혁신"이 보인다');
  await page.evaluate(() => { document.getElementById('msClose').click(); });
  await reset(); await ev(() => { window.__wj.S().about.stats = [{ v: '11', l: '등록 특허' }]; });
  await page.click('#btnMarket'); await page.waitForSelector('#msBody');
  ok(await page.locator('#claimNote').count() === 1 && /11 등록 특허/.test(await page.textContent('#claimNote')), '회사 소개에 "11 등록 특허"만 있고 번호 카드가 비어 있어도 상자에 알림이 보인다');
  await ev(() => { window.__wj.S().about.patents[0].no = '10-1234567'; }); await page.evaluate(() => { document.getElementById('msClose').click(); });
  await page.click('#btnMarket'); await page.waitForSelector('#msBody');
  ok(await page.locator('#claimNote').count() === 0, '특허 번호 카드를 채우면 그 알림이 사라진다');
  await reset(); await page.evaluate(() => { document.getElementById('msClose').click(); });
  await page.click('#btnMarket'); await page.waitForSelector('#msBody');
  ok(await page.locator('#claimNote').count() === 0, '걸리는 것이 하나도 없으면 상자가 아예 안 나온다');
  await page.evaluate(() => { document.getElementById('msClose').click(); });

  /* 11. 글 만드는 지시문에 근거가 필요한 말 한 줄이 들어갔다 · 글을 자동으로 고치지 않는다 */
  const src = fs.readFileSync(FILE, 'utf8');
  ok(src.includes('방수·항균·내구·친환경·스마트처럼 근거가 필요한 말도 메모에 적혀 있을 때만 쓰세요'), '제품 글 지시문에 "방수·항균·내구·친환경·스마트도 메모에 있을 때만" 규칙이 들어갔다');
  await reset(); await setS({ hero: { title: '최고의 손잡이' } }); const before = await ev(() => window.__wj.S().hero.title); await scan();
  ok(before === '최고의 손잡이' && await ev(() => window.__wj.S().hero.title) === '최고의 손잡이', '점검은 글을 자동으로 바꾸지 않는다(사람이 고친다)');
  ok(errors.length === 0, '화면 오류가 없다' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
