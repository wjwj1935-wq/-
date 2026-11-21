/* 자동몰 상세페이지 제작기 v78 — 치수 그림이 항상 나오고(점선), 캡 모양 4가지(원형·정사각형·직사각형·모서리가 둥근 사각형) */
const http = require('http'), fs = require('fs'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const NEW = fs.readFileSync(B + '/w/am_work.html', 'utf8'), OLD = fs.readFileSync(B + '/w/v79.html', 'utf8');
const WHITE = B + '/up/white_prod.png';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
let PORT = 0;
const server = http.createServer((q, r) => { const p = q.url.split('?')[0]; if (p === '/' || p === '/new') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(NEW); } else if (p === '/old') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); r.end(OLD); } else { r.writeHead(404); r.end('no'); } });
const MOCK = () => {   // localStorage '__mock' 값(round·square·rect·rrect·other·unknown·text:…)으로 클로드 답을 바꾼다
  const m = localStorage.getItem('__mock'); window.__log = [];
  if (!m) return;
  window.claude = { use: async (n) => n === 'sample' ? { limits: async () => ({ images: { maxCount: 3 } }), json: async (p) => {
    window.__log.push(p.length);
    const txt = /^text:/.test(m), rep = txt ? '' : m, ros = txt ? m.slice(5) : '받침 한 문장';
    if (!/"spec"/.test(p)) return txt ? { rosette: ros } : { rosetteShape: rep, rosette: ros };
    return { kind: '레버형', lever: '레버', rosette: ros, rosetteShape: rep, finish: '마감', features: [], spec: '그대로', never: [] };
  } } : null };
};
async function open(browser, path, seed, mock) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) r.continue(); else r.abort(); });
  if (mock) await page.addInitScript((m) => localStorage.setItem('__mock', m), mock);
  await page.addInitScript(MOCK);
  if (seed) await page.addInitScript((s) => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', s); if (!localStorage.getItem('wj-dp-v3')) localStorage.setItem('wj-dp-v3', s); } catch (e) {} }, JSON.stringify(seed));
  await page.goto('http://127.0.0.1:' + PORT + path); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const Z = (o) => ({ v: 3, size: Object.assign({ len: '', wid: '', cap: '', ref: 'card', extra: [], note: '※ 그림은 치수 위치를 보여 주는 도식이에요.' }, o) });
const sizeHtml = (page) => page.evaluate(() => { const e = document.querySelector('#paper .sizebox, #paper .sizeph'); return e ? e.outerHTML : ''; });
const geo = (page) => page.evaluate(() => {
  const box = document.querySelector('#paper .sizebox'); if (!box) return null; const dia = box.querySelector('.sddia'); if (!dia) return { dia: null, rows: [...box.querySelectorAll('.sdr2')].map((e) => e.textContent), note: !!box.querySelector('.sdnote') };
  const d = dia.getBoundingClientRect(), r = (e) => { const q = e.getBoundingClientRect(); return { txt: e.textContent, l: q.left - d.left, r: q.right - d.left, t: q.top - d.top, b: q.bottom - d.top }; };
  return { dia: { w: d.width, h: d.height }, pills: [...dia.querySelectorAll('.sdp')].map(r), refs: [...dia.querySelectorAll('.sdr')].map(r), rows: [...box.querySelectorAll('.sdr2')].map((e) => e.textContent), note: !!box.querySelector('.sdnote'), dashed: [...dia.querySelectorAll('i')].filter((i) => /2px dashed/.test(i.getAttribute('style'))).length, radii: [...dia.querySelectorAll('i')].map((i) => (i.getAttribute('style').match(/border-radius:([\d.]+)px;background:#e4e8ef/) || [])[1]).filter(Boolean).map(Number), cir: !![...dia.querySelectorAll('i')].find((i) => /border-radius:50%;background:#e4e8ef/.test(i.getAttribute('style'))) };
});
const inside = (g) => g.pills.concat(g.refs).every((p) => p.l >= -1 && p.r <= g.dia.w + 1 && p.t >= -1 && p.b <= g.dia.h + 1);
const overlap = (g) => { const a = g.pills.map((p) => ({ n: p.txt, ...p })).concat(g.refs.map((p) => ({ n: '[비교]' + p.txt.slice(0, 4), ...p }))); for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i].l < a[j].r && a[j].l < a[i].r && a[i].t < a[j].b && a[j].t < a[i].b) return a[i].n + ' ↔ ' + a[j].n; return ''; };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 치수를 모두 적은 그림은 v77과 똑같다 (원형·직사각형, 비교 물건 3가지) */
  const full = {
    'round/card': Z({ len: '150', wid: '20', cap: '70' }), 'round/coin(동전 설명 글 자리는 v77에서 바뀜)': null, 'round/none': Z({ len: '130', wid: '24', cap: '52', ref: 'none' }),
    'round/extra': Z({ len: '150', wid: '20', cap: '70', extra: [{ l: '문에서 튀어나온 길이', v: '48' }] }), 'round/badcap': Z({ len: '100', wid: '20', cap: '200' }), 'round/empty': Z({}),
    'rect/card': Z({ shape: 'rect', len: '150', wid: '20', capW: '70', capH: '54' }), 'rect/coin': Z({ shape: 'rect', len: '150', wid: '20', capW: '70', capH: '54', ref: 'coin' }),
    'rect/none': Z({ shape: 'rect', len: '130', wid: '24', capW: '60', capH: '40', ref: 'none' }), 'rect/tall': Z({ shape: 'rect', len: '140', wid: '22', capW: '45', capH: '110' }),
    'rect/wide': Z({ shape: 'rect', len: '120', wid: '20', capW: '118', capH: '48' }), 'rect/mm': Z({ shape: 'rect', len: '150mm', wid: '20', capW: '70mm', capH: '54' })
  };
  for (const [k, seed] of Object.entries(full)) {
    if (!seed) continue;
    const a = await open(browser, '/old', seed), b = await open(browser, '/new', seed);
    const parts = (page) => page.evaluate(() => { const bx = document.querySelector('#paper .sizebox, #paper .sizeph'); if (!bx) return ''; const t = bx.querySelector('.sdtb'); return JSON.stringify({ cls: bx.className, ph: bx.className === 'sizeph' ? bx.outerHTML : '', tbl: t ? t.outerHTML.replace('총 길이(캡 중심~끝)', '총 길이') : '', pills: [...bx.querySelectorAll('.sdp')].map((e) => e.textContent.replace('(캡 중심~끝)', '')).sort(), refs: [...bx.querySelectorAll('.sdr')].map((e) => e.textContent), note: !!bx.querySelector('.sdnote'), dia: !!bx.querySelector('.sddia') }); });
    const ha = await parts(a.page), hb = await parts(b.page);
    ok(ha === hb && ha.length > 0, `예전과 같음 (${k}): 표·치수 표시 글·비교 물건 글은 v79와 똑같다(그림 모양만 새로 그려요)`);
    await a.ctx.close(); await b.ctx.close();
  }

  /* 2. 일부만 적어도 그림이 나온다 (사장님 화면: 총 길이 150 · 총 폭 20만 적은 경우) */
  {
    const run = async (seed) => { const { ctx, page, errors } = await open(browser, '/new', seed); const g = await geo(page); await ctx.close(); return { g, errors }; };
    let { g, errors } = await run(Z({ len: '150', wid: '20' }));
    ok(g.dia && g.pills.length === 2 && g.pills.map((p) => p.txt).join() === '총 길이(캡 중심~끝) 150mm,총 폭 20mm', '총 길이·총 폭만: 그림이 나오고 치수 표시는 총 길이·총 폭 둘뿐이다 → ' + (g.pills || []).map((p) => p.txt));
    ok(g.dashed >= 1 && g.note && g.rows.length === 2, '총 길이·총 폭만: 적지 않은 캡은 점선으로 그리고, "점선으로 그린 부분은…" 설명 글이 나온다 (표는 2줄)');
    ok(inside(g) && overlap(g) === '', '총 길이·총 폭만: 모든 표시가 그림 안쪽에 있고 겹치지 않는다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    ({ g } = await run(Z({ len: '150' })));
    ok(g.dia && g.pills.length === 1 && /^총 길이\(캡 중심~끝\) 150mm$/.test(g.pills[0].txt) && g.dashed >= 2 && g.note, '총 길이만: 그림에 총 길이 표시 하나만 나오고 레버와 캡이 모두 점선이다');
    ({ g } = await run(Z({ wid: '20', cap: '70' })));
    ok(g.dia === null && g.rows.length === 2, '총 길이 없이: 그림은 그리지 않고 표만 나온다(길이를 모르면 비율을 못 그려요)');
    ({ g } = await run(Z({ len: '150', cap: '70' })));
    ok(g.dia && g.pills.map((p) => p.txt).join() === '총 길이(캡 중심~끝) 150mm,캡 지름 Ø70mm' && g.dashed >= 1 && g.note, '총 길이 + 캡 지름(총 폭 없음): 레버만 점선이고 캡 지름 표시가 나온다 → ' + g.pills.map((p) => p.txt));
    ({ g } = await run(Z({ len: '150', wid: '20', cap: '70' })));
    ok(g.dia && g.pills.length === 3 && g.dashed === 0 && !g.note, '모두 적음: 점선도 설명 글도 없다(예전 그림 그대로)');
    ({ g } = await run(Z({ len: '100', wid: '20', cap: '200' })));
    ok(g.dia === null, '캡이 총 길이보다 크게 적힌 경우: 그림을 그리지 않는다(예전과 같다)');
  }

  /* 2b. 비교 물건(신용카드) 설명 글이 작은 상자보다 넓으면 상자 아래에 놓는다 */
  {
    const { ctx, page } = await open(browser, '/new', Z({ shape: 'rect', len: '150', wid: '20', capW: '70', capH: '54', ref: 'card' }));
    const r = await page.evaluate(() => { const d = document.querySelector('#paper .sddia'), lab = d.querySelector('.sdr').getBoundingClientRect(), obj = [...d.querySelectorAll('i')].filter((i) => /background:#f3f5f9/.test(i.getAttribute('style'))).map((i) => i.getBoundingClientRect())[0]; return { labTop: lab.top, objBottom: obj.bottom, labW: lab.width, objW: obj.width }; });
    ok(r.labW > r.objW ? r.labTop >= r.objBottom - 1 : true, `비교 물건: 설명 글(${Math.round(r.labW)}px)이 상자(${Math.round(r.objW)}px)보다 넓으면 상자 아래에 놓인다`);
    await ctx.close();
  }

  /* 3. 캡 모양 4가지: 그림·치수 표시 */
  {
    const cases = [
      ['원형', Z({ len: '150', wid: '20', cap: '70' }), ['총 길이(캡 중심~끝) 150mm', '총 폭 20mm', '캡 지름 Ø70mm'], 3],
      ['정사각형', Z({ shape: 'square', len: '150', wid: '20', capW: '60' }), ['총 길이(캡 중심~끝) 150mm', '총 폭 20mm', '캡 한 변 60mm'], 3],
      ['직사각형', Z({ shape: 'rect', len: '150', wid: '20', capW: '70', capH: '54' }), ['총 길이(캡 중심~끝) 150mm', '캡 가로 70mm', '총 폭 20mm', '캡 세로 54mm'], 4],
      ['모서리가 둥근 사각형', Z({ shape: 'rrect', len: '150', wid: '20', capW: '70', capH: '54' }), ['총 길이(캡 중심~끝) 150mm', '캡 가로 70mm', '총 폭 20mm', '캡 세로 54mm'], 4]
    ];
    const rad = {};
    for (const [nm, seed, labels, n] of cases) {
      for (const ref of ['card', 'coin', 'none']) {
        const sd = JSON.parse(JSON.stringify(seed)); sd.size.ref = ref;
        const { ctx, page, errors } = await open(browser, '/new', sd); const g = await geo(page);
        const got = g.pills.map((p) => p.txt).sort().join('|'), want = labels.slice().sort().join('|');
        ok(got === want && g.pills.length === n, `${nm}(${ref}): 치수 표시가 맞다 → ${g.pills.map((p) => p.txt).join(', ')}`);
        ok(inside(g) && overlap(g) === '' && g.dashed === 0, `${nm}(${ref}): 표시가 모두 그림 안쪽이고 겹치지 않으며 점선이 없다 ${overlap(g)}`);
        if (ref === 'card') { rad[nm] = g; const sz = await page.evaluate(() => [...document.querySelectorAll('#paper .sdr2')].map((e) => e.querySelector('b').textContent)); ok(sz.slice(2).join() === (nm === '원형' ? '캡 지름' : nm === '정사각형' ? '캡 한 변' : '캡 가로,캡 세로'), `${nm}: 아래 표의 캡 줄이 맞다 → ${sz}`); }
        ok(errors.length === 0, `${nm}(${ref}): 오류 없음 ${JSON.stringify(errors)}`);
        await ctx.close();
      }
    }
    ok(rad['원형'].cir && !rad['정사각형'].cir && !rad['직사각형'].cir && !rad['모서리가 둥근 사각형'].cir, '그림: 원형만 동그란 캡이고 나머지 셋은 네모 캡이다');
    const rr = rad['모서리가 둥근 사각형'].radii[0], rc = rad['직사각형'].radii[0];
    ok(rr > rc * 2.5, `그림: 모서리가 둥근 사각형은 직사각형보다 모서리가 훨씬 더 둥글다 (${rr}px vs ${rc}px)`);
  }

  /* 4. 입력칸: 모양에 따라 칸이 바뀐다 / 아직 확인 안 했으면 알려 준다 */
  {
    const { ctx, page, errors } = await open(browser, '/new');
    await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
    const opts = await page.evaluate(() => [...document.querySelectorAll('.cappick .cp')].map((b) => b.dataset.v + ':' + b.querySelector('b').textContent + '/' + b.querySelector('small').textContent));
    ok(opts.map((o) => o.split(':')[0]).join() === 'round,square,rect,rrect', '입력칸: 캡 모양 그림 단추가 4개다 → ' + opts.join(' | '));
    ok(opts.join() === 'round:원형/지름 1개,square:정사각형/한 변 1개,rect:직사각형/가로·세로,rrect:라운드형/가로·세로', '입력칸: 단추마다 모양 이름과 적을 치수(지름 1개 · 한 변 1개 · 가로·세로)가 적혀 있다');
    ok(/아직 확인하지 않았어요/.test(await page.textContent('#s-size')) && /원형/.test(await page.textContent('#s-size .hint b')), '처음: "캡 모양을 아직 확인하지 않았어요. 지금은 원형으로 그려요"가 나온다');
    const fields = async () => page.evaluate(() => [...document.querySelectorAll('#s-size [data-k^="size.cap"]')].map((e) => e.dataset.k + ':' + e.closest('label').querySelector('span').textContent.slice(0, 5)));
    ok((await fields()).join() === 'size.cap:캡 지름 ', '원형: 캡 지름 칸 하나다 → ' + (await fields()));
    await page.click('.cappick [data-v="square"]'); await page.waitForTimeout(250);
    ok((await fields()).join() === 'size.capW:캡 한 변', '정사각형: "캡 한 변" 칸 하나다 → ' + (await fields()));
    ok(!/아직 확인하지 않았어요/.test(await page.textContent('#s-size')), '직접 고르면: "아직 확인하지 않았어요" 안내가 사라진다');
    await page.click('.cappick [data-v="rect"]'); await page.waitForTimeout(250);
    ok((await fields()).join() === 'size.capW:캡 가로 ,size.capH:캡 세로 ', '직사각형: 캡 가로·캡 세로 두 칸이다 → ' + (await fields()));
    await page.click('.cappick [data-v="rrect"]'); await page.waitForTimeout(250);
    ok((await fields()).join() === 'size.capW:캡 가로 ,size.capH:캡 세로 ', '모서리가 둥근 사각형: 캡 가로·캡 세로 두 칸이다 → ' + (await fields()));
    await page.fill('[data-k="size.len"]', '150'); await page.waitForTimeout(500);
    ok(await page.locator('#paper .sddia').count() === 1, '입력칸: 총 길이만 적어도 미리보기에 그림이 나온다');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 4b. 캡 모양 고르기는 사진을 넣는 1단계에 있고, 처음부터 열려 있다 */
  {
    const { ctx, page, errors } = await open(browser, '/new');
    await page.locator('input[data-file="src"]').first().setInputFiles(WHITE); await page.waitForTimeout(2500);
    ok(await page.locator('#p1 #s-size').count() === 1 && await page.locator('#p4 #s-size').count() === 0, '위치: 캡 모양·크기 안내 칸이 1단계 안에 있고 4단계에는 없다');
    ok(await page.evaluate(() => document.querySelector('#s-size').open) && await page.locator('.cappick').isVisible(), '위치: 아무것도 열지 않아도 캡 모양 단추 4개가 처음부터 보인다');
    const order = await page.evaluate(() => { const p1 = document.querySelector('#p1 .body'), kids = [...p1.children]; const iPhoto = kids.findIndex((k) => k.querySelector && k.querySelector('[data-pk="src"]')), iRecog = kids.findIndex((k) => /사진 인식 결과/.test(k.textContent) && (k.matches('.recog') || !!k.querySelector('.recog')) && k.id !== 's-size'), iSize = kids.findIndex((k) => k.id === 's-size'); return { iPhoto, iRecog, iSize }; });
    ok(order.iPhoto >= 0 && order.iRecog > order.iPhoto && order.iSize > order.iRecog, '위치: 제품 사진 → 사진 인식 결과 → 캡 모양·크기 안내 순서로 바로 이어진다 → ' + JSON.stringify(order));
    const pressed = async () => page.evaluate(() => [...document.querySelectorAll('.cappick .cp')].map((b) => b.dataset.v + '=' + b.getAttribute('aria-checked')).join());
    ok((await pressed()) === 'round=true,square=false,rect=false,rrect=false', '처음: 원형이 눌려 있다 → ' + await pressed());
    const dimFields = () => page.evaluate(() => [...document.querySelectorAll('#s-size [data-k^="size.cap"]')].map((e) => e.dataset.k + ':' + e.closest('label').querySelector('span').textContent.slice(0, 6)).join());
    for (const [v, want] of [['square', 'size.capW:캡 한 변 '], ['rect', 'size.capW:캡 가로 (,size.capH:캡 세로 ('], ['rrect', 'size.capW:캡 가로 (,size.capH:캡 세로 ('], ['round', 'size.cap:캡 지름 (']]) {
      await page.click('.cappick [data-v="' + v + '"]'); await page.waitForTimeout(200);
      ok((await dimFields()).replace(/ \(/g, ' (') === want.replace(/ \(/g, ' ('), `단추(${v}): 누르면 아래에 그 모양의 치수 칸이 바로 나온다 → ${await dimFields()}`);
      ok((await pressed()).indexOf(v + '=true') >= 0 && (await pressed()).split('=true').length === 2, `단추(${v}): 눌린 단추는 하나뿐이다 → ${await pressed()}`);
    }
    await page.click('.cappick [data-v="rect"]'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.v) === 'rect', '키보드: 단추를 누른 뒤에도 그 단추에 커서가 남아 있다');
    await page.fill('[data-k="size.len"]', '150'); await page.fill('[data-k="size.capW"]', '70'); await page.fill('[data-k="size.capH"]', '54'); await page.waitForTimeout(500);
    ok(await page.locator('#paper .sddia').count() === 1 && /캡 가로 70mm/.test(await page.textContent('#paper .sizebox')) && /캡 세로 54mm/.test(await page.textContent('#paper .sizebox')), '미리보기: 1단계에서 고르고 적은 치수가 상세페이지 크기 안내 그림에 바로 나온다');
    const stored = await page.evaluate(() => { try { const x = JSON.parse(localStorage.getItem('am-dp-v1')).size; return x.shape + '/' + x.shapeSet; } catch (e) { return null; } });
    await page.waitForTimeout(600);
    ok((await page.evaluate(() => { try { const x = JSON.parse(localStorage.getItem('am-dp-v1')).size; return x.shape + '/' + x.shapeSet; } catch (e) { return null; } })) === 'rect/user', '저장: 직접 고른 모양이 저장된다(rect/user)');
    ok(errors.length === 0, '오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 5. 사진 인식: 4가지 모양을 알아본다 */
  for (const [mock, want, nm] of [['round', 'round', '원형'], ['square', 'square', '정사각형'], ['rect', 'rect', '직사각형'], ['rrect', 'rrect', '모서리가 둥근 사각형'], ['text:받침은 모서리가 둥근 사각형이에요', 'rrect', '모서리가 둥근 사각형(설명 글만 온 경우)'], ['text:위에서 보면 정사각형 받침', 'square', '정사각형(설명 글만 온 경우)']]) {
    const { ctx, page, errors } = await open(browser, '/new', null, mock);
    await page.locator('input[data-file="src"]').first().setInputFiles(WHITE); await page.waitForTimeout(3000);
    await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
    if (want !== 'round') await page.waitForFunction((x) => (document.querySelector('.cappick .cp.on') || {}).dataset.v === x, want, { timeout: 15000 });
    const val = await page.locator('.cappick .cp.on').getAttribute('data-v');
    ok(val === want, `사진 인식(${nm}): 캡 모양이 ${want}로 맞춰진다 → ${val}`);
    ok(new RegExp(nm.slice(0, 3)).test(await page.textContent('.recog')) || want === 'round', `사진 인식(${nm}): "사진 인식 결과" 칸에 모양 이름이 나온다`);
    await page.waitForFunction(() => { const b = document.querySelector('[data-act="capshape"]'); return b && !b.disabled; }, null, { timeout: 15000 });
    await page.waitForTimeout(500); await page.click('[data-act="capshape"]');
    await page.waitForFunction(() => /이에요\. 크기 안내의 캡 모양을/.test((document.querySelector('#toast') || {}).textContent || '') || /알 수 없어요/.test((document.querySelector('#toast') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const toast = await page.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');
    const want2 = { round: '원형이에요', square: '정사각형이에요', rect: '직사각형이에요', rrect: '모서리가 둥근 사각형이에요' }[want];
    ok(toast.indexOf(want2) >= 0 && (want === 'round' || (want === 'square' ? /캡 한 변/.test(toast) : /캡 가로·세로/.test(toast))), `사진 인식(${nm}): 단추를 누르면 "${want2}"와 적을 칸 안내가 나온다 → ${toast.slice(0, 70)}`);
    ok(errors.length === 0, `사진 인식(${nm}): 오류 없음 ${JSON.stringify(errors)}`);
    await ctx.close();
  }
  /* 직접 고른 값은 사진 인식이 덮어쓰지 않는다 */
  {
    const { ctx, page } = await open(browser, '/new', null, 'rrect');
    await page.evaluate(() => document.querySelectorAll('#side details').forEach((d) => { d.open = true; }));
    await page.click('.cappick [data-v="square"]'); await page.waitForTimeout(250);
    await page.locator('input[data-file="src"]').first().setInputFiles(WHITE); await page.waitForTimeout(3500);
    ok(await page.locator('.cappick .cp.on').getAttribute('data-v') === 'square', '직접 고른 정사각형: 사진 인식이 모서리가 둥근 사각형이라고 해도 바꾸지 않는다');
    ok(/사진 인식 결과는 <b>모서리가 둥근 사각형|사진 인식 결과는 모서리가 둥근 사각형/.test(await page.innerHTML('#s-size')) || /모서리가 둥근 사각형이에요\. 직접 고른 값/.test(await page.textContent('#s-size')), '직접 고른 값: "사진 인식 결과는 모서리가 둥근 사각형이에요. 직접 고른 값을 그대로 두었어요"가 나온다');
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건'); process.exit(fails ? 1 : 0);
})();
