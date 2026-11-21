/* 자동몰 상세페이지 제작기 v76 — 폰에서 읽히는 글자 크기 시험 (가로 860 기준, 폰 화면 약 390은 0.45배) */
const http = require('http'), fs = require('fs'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const HTML = fs.readFileSync(B + '/w/am_work.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(HTML); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const P = srv.address().port;
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 } }); const pg = await ctx.newPage();
  const errors = []; pg.on('pageerror', (e) => errors.push(e.message));
  await pg.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('http://127.0.0.1:' + P) || /^(data|blob|about):/.test(u)) r.continue(); else r.abort(); });
  await pg.goto('http://127.0.0.1:' + P + '/'); await pg.waitForSelector('#paper .sec', { state: 'attached' }); await pg.waitForTimeout(800);
  await pg.locator('input[data-file="src"]').first().setInputFiles(B + '/up/white_prod.png'); await pg.waitForTimeout(2500);
  await pg.fill('[data-k="name"]', '시험 손잡이 2'); await pg.waitForTimeout(1000);
  const st = JSON.parse(await pg.evaluate(() => localStorage.getItem('am-dp-v1')));
  st.about.patents = [{ no: '10-2020-0012345', title: '문 손잡이용 레버 어셈블리 및 이를 포함하는 도어락', meta: '등록일 2021.03.15 · 특허청', badge: '등록\n완료' }, { no: '30-2021-0045678', title: '손잡이 디자인', meta: '등록일 2022.01.20 · 특허청', badge: '등록\n완료' }];
  st.about.grow = [{ badge: '2021', title: '신제품 출시', body: '새로운 방문 손잡이 라인을 선보였어요.' }, { badge: '2023', title: '생산 설비 확장', body: '생산량을 늘려 더 빠르게 보내 드려요.' }];
  st.about.tl = [{ year: '2017', text: '문 손잡이 제조 시작' }, { year: '2018', text: '첫 특허 출원' }, { year: '2019', text: '디자인 등록' }, { year: '2021', text: '신제품 출시' }, { year: '2026', text: '온라인 판매 시작' }];
  st.size = { len: '150', wid: '20', cap: '', shape: 'rect', capW: '70', capH: '54', ref: 'coin', extra: [{ l: '문에서 튀어나온 길이', v: '48' }], note: '※ 그림은 치수 위치를 보여 주는 도식이에요.' };
  st.facts = { backset: '60', thick: '35~45', bore: '54', material: '도면에 적힌 재질 이름 그대로 아주 길게 적어도 줄이 바뀌어 잘 나오는지 보는 시험 글', finish: '무광 블랙', dir: '좌우 공용', parts: '레버 2개, 받침 2개, 나사 세트, 육각 렌치, 설치 설명서', origin: '대한민국', cert: '인증서에 적힌 번호까지 길게 적는 시험 글 12345-6789', extra: [{ l: '손잡이 무게', v: '300g' }], note: '※ 문 두께와 구멍 크기는 달기 전에 꼭 확인해 주세요.' };
  await pg.addInitScript((s) => localStorage.setItem('am-dp-v1', s), JSON.stringify(st));
  await pg.reload(); await pg.waitForSelector('#paper .sec', { state: 'attached' }); await pg.waitForTimeout(1500);
  const r = await pg.evaluate(() => {
    const pgEl = document.querySelector('#paper .pg') || document.querySelector('#paper'), pr = pgEl.getBoundingClientRect(), secs = [...document.querySelectorAll('#paper [data-slice]')];
    const body = [], tiny = [], over = [], clip = []; let total = 0;
    const BODY = '.lead,.zi p,.hero p,.qa .a,.gs div,.nt li,.tl .tt,.pat .nm,.gr span,.cta p,.fn,.stat span,.cell figcaption,.note,.foot';
    for (const s of secs) {
      const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT); let n;
      while (n = w.nextNode()) { const t = n.nodeValue.trim(); if (!t) continue; const el = n.parentElement; if (el.closest('.tmp,.need,.ph-empty,.sdp,.sdr')) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const f = parseFloat(cs.fontSize); total++; if (f < 22) tiny.push(f + ':' + t.slice(0, 20)); if (el.matches(BODY) || el.closest('.nt ul,.sdr2')) body.push({ f, t: t.slice(0, 20) }); }
      for (const el of s.querySelectorAll('*')) { const rc = el.getBoundingClientRect(); if (!rc.width) continue; if (rc.right > pr.right + 1.5 || rc.left < pr.left - 1.5) over.push((el.className || el.tagName) + ' ' + Math.round(rc.left - pr.left) + '..' + Math.round(rc.right - pr.left));
        const cs = getComputedStyle(el); if (cs.overflow !== 'visible' && (el.scrollHeight > el.clientHeight + 3 || el.scrollWidth > el.clientWidth + 3) && !/pb|hero|zp|hcard|sdwrap|rimg/.test(el.className)) clip.push((el.className || el.tagName) + ' sh' + el.scrollHeight + '/ch' + el.clientHeight); }
    }
    const hero = document.querySelector('#paper .hero'), txt = hero && hero.querySelector('.txt'), card = hero && hero.querySelector('.hcard');
    const dia = document.querySelector('#paper .sddia'), dr = dia && dia.getBoundingClientRect(), lab = dia ? [...dia.querySelectorAll('.sdp,.sdr')].map((e) => { const x = e.getBoundingClientRect(); return x.left >= dr.left - 1 && x.right <= dr.right + 1 && x.top >= dr.top - 1 && x.bottom <= dr.bottom + 1; }) : [];
    const sdr2 = [...document.querySelectorAll('#paper .sdr2')].map((e) => { const s2 = e.querySelector('span'), b2 = e.querySelector('b'); return { h: Math.round(e.getBoundingClientRect().height), one: s2.getBoundingClientRect().height < 40 }; });
    return { total, tiny, bodyMin: Math.min(...body.map((x) => x.f)), bodyN: body.length, bodyLow: body.filter((x) => x.f < 22).map((x) => x.f + ':' + x.t), over, clip, heroGap: txt && card ? Math.round(txt.getBoundingClientRect().top - card.getBoundingClientRect().bottom) : null, heroH: Math.round(hero.getBoundingClientRect().height), diaOk: lab.length > 0 && lab.every(Boolean), sdr2, tot: Math.round(secs.reduce((a, s) => a + s.getBoundingClientRect().height, 0)) };
  });
  console.log('   글자 ' + r.total + '개, 본문 계열 ' + r.bodyN + '개, 가장 작은 본문 ' + r.bodyMin + 'px (폰에서 약 ' + (r.bodyMin * 390 / 860).toFixed(1) + 'px), 페이지 전체 높이 ' + r.tot + 'px');
  ok(r.tiny.length === 0, '글자 크기: 22px(폰에서 약 10px)보다 작은 글자가 없다 ' + JSON.stringify(r.tiny));
  ok(r.bodyMin >= 22 && r.bodyN >= 30, '글자 크기: 설명 글·표·질문 답 같은 본문 계열 ' + r.bodyN + '개가 모두 22px 이상이다 (가장 작은 값 ' + r.bodyMin + 'px)');
  const big = await pg.evaluate(() => { const g = (s) => { const e = document.querySelector('#paper ' + s); return e ? parseFloat(getComputedStyle(e).fontSize) : null; }; return { lead: g('.lead'), zip: g('.zi p'), heroP: g('.hero p'), qa: g('.qa .a'), gs: g('.gs div') || g('.gpc h3'), gp: g('.gpc p'), cta: g('.cta p'), h1: g('h1'), h2: g('h2') }; });
  ok(big.lead >= 28 && big.zip >= 26 && big.heroP >= 28 && big.qa >= 26 && big.gs >= 28 && (big.gp == null || big.gp >= 26) && big.cta >= 28, '글자 크기: 소개 글 ' + big.lead + ' · 확대 설명 ' + big.zip + ' · 첫 화면 ' + big.heroP + ' · 질문 답 ' + big.qa + ' · 설치 순서 ' + big.gs + ' · 마지막 ' + big.cta + 'px (설명 글은 26~28px 이상)');
  ok(big.h1 >= 54 && big.h2 >= 40, '제목은 줄어들지 않았다: 첫 화면 제목 ' + big.h1 + 'px · 구역 제목 ' + big.h2 + 'px');
  ok(r.over.length === 0 && r.clip.length === 0, '넘침: 상세페이지 가로(860) 밖으로 나가거나 잘리는 곳이 없다 ' + JSON.stringify(r.over.concat(r.clip)));
  ok(r.heroH === 1040 && r.heroGap >= 20, '첫 화면: 높이는 그대로 1040이고, 글 자리와 사진 카드 사이가 ' + r.heroGap + 'px 남는다(겹치지 않는다)');
  ok(await pg.locator('#paper .fxrow').count() === 10, '규격 구역: 가득 채워도 10줄이 나오고 위 검사(글자 22px 이상·넘침 없음)를 함께 통과한다');
  ok(r.diaOk, '크기 안내 그림: 모든 치수 표시가 그림 안쪽에 있다');
  ok(r.sdr2.length >= 5 && r.sdr2.every((x) => x.one), '크기 안내 표: 값("48mm")이 한 줄로 나오고 단위가 끊기지 않는다 → ' + JSON.stringify(r.sdr2));
  ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
  await b.close(); srv.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건'); process.exit(fails ? 1 : 0);
})();
