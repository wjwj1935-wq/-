/* 자동몰 v102 — 상품군 고르기. 파일로 열어(인터넷 막음) 시험한다. 규격 값은 시험용 가짜 값이고, 앱은 값을 미리 채우지 않는다. */
const fs = require('fs'), { pathToFileURL } = require('url'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const FILE = B + '/staff/자동몰_상세페이지_제작기_v102.html', PHOTO = B + '/up/white_prod.png';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  await ctx.route('**/*', (r) => /^(file|data|blob|about):/.test(r.request().url()) ? r.continue() : r.abort());
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(pathToFileURL(FILE).href + '#wjdebug'); await page.waitForSelector('#paper .sec', { state: 'attached', timeout: 20000 });
  await page.waitForFunction(() => window.__wj && window.__wj.GRP && window.__wj.LIB && window.__wj.LIB.ready, null, { timeout: 15000 }); await page.waitForTimeout(500);
  const ev = (fn, a) => page.evaluate(fn, a);
  const S = () => ev(() => { const s = window.__wj.S(); return { group: s.group, name: s.name, hero: s.hero.title, extra: (s.facts.extra || []).map((x) => [x.l, x.v]), faq: s.faq.items.map((q) => q.q), guide: s.guide.steps, colors: s.colors.items.map((x) => x.label), sell: s.sellName }; });
  const pageText = () => ev(() => document.getElementById('paper').innerText);
  const pickGroup = async (g) => { await page.click('[data-act="group"][data-g="' + g + '"]'); await page.waitForSelector('#gpGo'); await page.click('#gpGo'); await page.waitForFunction((g) => window.__wj.S().group === g, g, { timeout: 15000 }); await page.waitForTimeout(700); };

  /* 1. 처음: 방문 손잡이, 상품군 단추 5개 */
  const chips = await ev(() => [...document.querySelectorAll('[data-act="group"]')].map((b) => [b.dataset.g, b.classList.contains('on'), b.querySelector('b').textContent]));
  ok(chips.length === 5 && chips.map((c) => c[0]).join() === 'lever,glass,roll,fold,net' && chips[0][1] && !chips.slice(1).some((c) => c[1]), '1단계 맨 위에 상품군 단추 5개가 있고, 처음은 "방문 손잡이"가 눌려 있다 → ' + chips.map((c) => c[2]).join(' / '));
  ok((await S()).group === 'lever' && /우리 집 문에 깔끔하게/.test((await S()).hero) && await page.locator('#p3 [data-act="gone"], #p3 [data-act="gtest"]').count() > 0, '방문 손잡이는 100과 똑같이 AI 이미지 만들기(3단계) 단추와 문 색상 글 틀이 그대로다');
  await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
  await page.fill('[data-k="name"]', '시험 제품'); await page.waitForTimeout(3200);

  /* 2. 강화도어 손잡이로 바꾸기 */
  await page.click('[data-act="group"][data-g="glass"]'); await page.waitForSelector('#gpGo');
  ok(/강화도어 손잡이/.test(await page.textContent('.dlg')) && /내 상세페이지/.test(await page.textContent('.dlg')), '바꾸기 창에 "강화도어 손잡이"와 "내 상세페이지에 보관" 안내가 나온다');
  await page.click('#gpNo'); ok((await S()).group === 'lever', '취소하면 그대로 방문 손잡이다');
  await pickGroup('glass');
  let s = await S();
  ok(s.group === 'glass' && s.name === '시험 제품' && await ev(() => !!window.__wj.PH.has(window.__wj.S().src.id)), '강화도어로 바꾸면 제품 이름과 원본 사진은 그대로 가져온다');
  ok(s.extra.length === 16 && s.extra[0][0] === '적용 유리 두께' && s.extra[1][0] === '고정 간격(센터)' && s.extra.every((x) => x[1] === ''), '규격 칸이 상품군별(적용 유리 두께 · 고정 간격(센터) …)로 만들어지고, 값은 한 칸도 미리 채워지지 않는다');
  ok(/유리문/.test(s.hero) && !/우리 집 문에 깔끔하게/.test(s.hero) && s.faq.includes('우리 유리문에 맞나요?') && s.colors.join() === '투명 강화유리문,불투명(시트) 유리문,프레임 있는 유리문', '첫 화면 글·질문·설치 장면 이름이 강화도어 틀로 바뀐다');
  ok(await ev(() => window.__wj.GRP.glass.rows.filter((r) => r.fit).length) === 2 && !/방문 손잡이|레버|백셋|문 색상/.test(await ev(() => document.getElementById('paper').innerText.replace(/\s+/g, ' '))), '페이지에 방문 손잡이 말(레버·백셋·문 색상)이 남아 있지 않다');
  ok(await page.locator('#p3 [data-act="gone"], #p3 [data-act="gtest"]').count() === 0 && /사진을 직접 넣어요/.test(await page.textContent('#p3')), '3단계는 AI 이미지 만들기 대신 "사진을 직접 넣어요" 칸으로 바뀐다');
  ok(await page.locator('[data-k="size.len"], #p1 .cappick').count() === 0, '1단계에서 방문 손잡이 전용 칸(캡 모양·치수)이 사라진다');

  /* 3. 규격을 적으면 "맞는지 확인" 카드와 규격 표가 나온다(시험용 가짜 값) */
  await page.evaluate(() => { document.querySelector('#p4').open = true; document.querySelector('#s-facts').open = true; });
  await page.fill('[data-k="facts.extra.0.v"]', '10~12'); await page.fill('[data-k="facts.extra.1.v"]', '340'); await page.fill('[data-k="facts.extra.4.v"]', '시험용 재질');
  await page.waitForTimeout(500);
  const fit = await ev(() => [...document.querySelectorAll('#paper .fitc')].map((c) => c.innerText.replace(/\s+/g, ' ')));
  const rows = await ev(() => [...document.querySelectorAll('#paper .fxrow')].map((c) => c.innerText.replace(/\s+/g, ' ')));
  ok(fit.length === 2 && /적용 유리 두께 10~12mm/.test(fit[0]) && /고정 간격\(센터\) 340mm/.test(fit[1]) && /우리 유리문에 맞을까요/.test(await pageText()), '"우리 유리문에 맞을까요?" 카드 2장이 적은 값으로만 나온다 → ' + fit.join(' | '));
  ok(rows.length === 3 && rows.some((r) => /재질·마감 시험용 재질/.test(r)), '규격 표에는 적은 3줄만 나오고 비운 칸은 빠진다 → ' + rows.length + '줄');
  ok(await ev(() => !!document.querySelector('#paper .fitc img[src^="data:image/png"]')), '"맞는지 확인" 카드에 줄자 그림이 들어간다');

  /* 4. 저장·불러오기: 상품군이 그대로 따라온다 */
  const [dz] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btnSave')]);
  const zp = B + '/staff/test_group.zip'; await dz.saveAs(zp);
  await page.waitForTimeout(3200);
  ok(await ev(() => window.__wj.LIB.list.length) >= 1, '"내 상세페이지"에 보관된다(방문 손잡이로 만들던 처음 페이지 포함)');
  await pickGroup('lever');
  ok((await S()).group === 'lever' && /우리 집 문에 깔끔하게/.test((await S()).hero), '방문 손잡이로 다시 바꾸면 방문 손잡이 틀로 돌아온다');
  await page.setInputFiles('#loadFile', zp); await page.waitForFunction(() => window.__wj.S().group === 'glass', null, { timeout: 15000 }); await page.waitForTimeout(800);
  s = await S();
  ok(s.group === 'glass' && s.extra[0][1] === '10~12' && s.extra[1][1] === '340', '"작업 저장"한 강화도어 파일을 불러오면 상품군과 규격 값이 그대로 열린다');
  await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForFunction(() => window.__wj && window.__wj.LIB && window.__wj.LIB.ready); await page.waitForTimeout(800);
  ok((await S()).group === 'glass' && await page.locator('[data-act="group"][data-g="glass"].on').count() === 1, '새로 고쳐도 상품군이 유지된다');

  /* 5. 나머지 상품군(롤·폴딩·원단)과 상품군마다 다른 확인 항목 */
  const exp = { roll: ['크기(가로×세로)', '설치 방식', '우리 현관에 맞을까요?'], fold: ['크기(가로×세로)', '문 열림 방향', '우리 문·창에 맞을까요?'], net: ['폭·길이', '망 촘촘함(메쉬)', '필요한 크기를 먼저 확인하세요'] };
  for (const g of ['roll', 'fold', 'net']) {
    await pickGroup(g);
    const sg = await S(), labels = sg.extra.map((x) => x[0]);
    await page.evaluate(() => { document.querySelector('#p4').open = true; document.querySelector('#s-facts').open = true; });
    await page.fill('[data-k="facts.extra.0.v"]', '시험값1'); await page.fill('[data-k="facts.extra.1.v"]', '시험값2'); await page.waitForTimeout(400);
    const t = await pageText();
    ok(sg.group === g && labels.includes(exp[g][0]) && labels.includes(exp[g][1]) && t.includes(exp[g][2]) && sg.extra.slice(2).every((x) => x[1] === ''), `${g}: 상품군 규격 칸(${exp[g][0]} · ${exp[g][1]})과 확인 카드 제목 "${exp[g][2]}"이 나오고 값은 적은 것만 들어간다`);
  }

  /* 6. 설치 장면 사진 칸·저장·영상·표현 점검 */
  await pickGroup('glass');
  await page.evaluate(() => { document.querySelector('#p3').open = true; });
  await page.locator('input[data-file="colors.items.0.photo"]').setInputFiles(PHOTO); await page.waitForTimeout(2000);
  ok(await ev(() => window.__wj.PH.has(window.__wj.S().colors.items[0].photo.id)) && /투명 강화유리문/.test(await pageText()), '3단계에서 설치 장면 사진을 넣으면 페이지의 "설치 장면" 구역에 사진과 이름이 나온다');
  await ev(() => { window.__wj.S().hero.title = '세계 최고의 완벽한 손잡이'; }); await page.fill('[data-k="name"]', '시험 제품 2'); await page.waitForTimeout(600);
  const gt = await ev(() => window.__wj.gateInfo());
  ok(gt.hard.length === 1 && /최고/.test(gt.hard[0]) && gt.hard.every((x) => !/문 색상|손잡이가 원본/.test(x)), '이미지로 저장 점검표: 표현 점검(과장 말 ⛔)만 걸리고 방문 손잡이용 항목(문 색상 빈 칸 등)은 안 나온다 → ' + gt.hard.join(' / ').slice(0, 60));
  await ev(() => { window.__wj.S().hero.title = '유리문에 어울리는 손잡이'; }); await page.fill('[data-k="name"]', '시험 제품 3'); await page.waitForTimeout(400);
  await page.click('#btnExport'); await page.waitForSelector('#exGo');
  if (await page.locator('#exAck').count()) await page.check('#exAck');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#exGo')]);
  const jp = B + '/staff/test_group_export.jpg'; await dl.saveAs(jp);
  const dim = require('child_process').execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', jp]).toString().trim();
  ok(/^860,\d{4,5}$/.test(dim) && fs.statSync(jp).size > 100000, '"이미지로 저장"이 강화도어 페이지에서도 되고 가로 860px이다 → ' + dim + ', ' + (fs.statSync(jp).size / 1024).toFixed(0) + 'KB');
  await page.waitForTimeout(400); if (await page.locator('#exClose').count()) await page.click('#exClose');
  await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
  ok(await ev(() => window.__wj.VD.mode) === 'scroll' && await page.locator('input[name="vmode"][value="ad"]').count() === 0, '영상 창: 강화도어에서는 "쇼츠 광고 영상(문 색 몽타주)"을 감추고 "상세페이지 훑기"만 쓴다');
  await page.evaluate(() => { document.getElementById('vdClose').click(); });
  await page.click('#btnOne'); await page.waitForTimeout(400);
  ok(/아직 자동 만들기가 없어요/.test(await page.textContent('#toast')), '"한 번에 만들기"는 강화도어에서 "아직 자동 만들기가 없어요" 안내만 하고 아무것도 만들지 않는다');

  /* 7. 새 제품은 같은 상품군으로 · 오류 없음 */
  await page.click('#btnNew'); await page.waitForSelector('#nwGo'); await page.click('#nwGo'); await page.waitForTimeout(900);
  s = await S();
  ok(s.group === 'glass' && s.name === '' && s.extra.length === 16 && s.extra.every((x) => x[1] === '') && /유리문/.test(s.hero), '"새 제품"을 누르면 같은 상품군(강화도어)의 빈 틀로 시작한다');
  ok(errors.length === 0, '화면 오류가 없다' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
