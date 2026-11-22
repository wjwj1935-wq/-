/* 직원에게 보낼 '파일 하나'를 실제로 파일로 열어서 시험한다: 인터넷을 모두 막은 상태(file://), 클로드 안이 아닌 보통 브라우저와 똑같이 */
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url'), { chromium } = require('playwright');
const B = (process.env.AM_DEV || '/tmp/am_dev');
const FILE = B + '/staff/자동몰_상세페이지_제작기_v102.html', PHOTO = B + '/up/white_prod.png', IN = B + '/real_in';
const JZipN = require(B + '/jz/node_modules/jszip');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL0 = pathToFileURL(FILE).href;
(async () => {
  const browser = await chromium.launch();
  const prof = B + '/pw_prof_staff'; fs.rmSync(prof, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(prof, { viewport: { width: 1500, height: 1100 }, acceptDownloads: true });   // 일반 프로필 창(직원 컴퓨터처럼)
  const blocked = [], errors = [];
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (/^(file|data|blob|about):/.test(u)) return r.continue(); blocked.push(u); return r.abort(); });   // 인터넷은 전부 막는다
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL0 + '#wjdebug'); await page.waitForSelector('#paper .sec', { state: 'attached', timeout: 15000 });
  await page.waitForFunction(() => window.__wj, null, { timeout: 8000 });

  /* 1. 열린다 · 도구가 파일 안에 들어 있다 */
  ok(await page.title() === '자동몰 상세페이지 제작기' && /버전 102/.test(await page.textContent('.brand small')), '파일로 열린다(제목 · "버전 102")');
  ok(await page.evaluate(() => typeof JSZip === 'function' && typeof html2canvas === 'function'), '인터넷이 막혀 있어도 저장(zip)·이미지 도구가 파일 안에 들어 있다');
  ok(blocked.every((u) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u)), '막힌 요청은 글꼴뿐이다(없으면 컴퓨터의 한글 글꼴로 보인다) → ' + [...new Set(blocked.map((u) => new URL(u).hostname))].join(', '));
  ok(await page.evaluate(() => !window.claude), '클로드 안이 아닌 보통 브라우저로 열린 상태다(window.claude 없음)');
  await page.evaluate(() => { document.querySelector('#p2').open = true; });
  ok(await page.locator('#gKey').count() === 1 && await page.locator('#cKey').count() === 1 && await page.locator('a[href*="github.io"]').count() === 0, '2단계에 구글 키·클로드 키 입력칸이 있고, "새 주소 열기" 안내는 없다(이 파일이 그 새 주소 역할)');
  const keyEmpty = await page.evaluate(() => [window.__wj.G.key, localStorage.getItem('am-gk'), localStorage.getItem('am-ck')]);
  ok(!keyEmpty[0] && !keyEmpty[1] && !keyEmpty[2], '처음 열면 키가 비어 있다(파일에 키가 들어 있지 않다)');

  /* 2. 제품 사진·이름을 넣고 → 새로 고침해도 남는다 */
  await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2200);
  await page.fill('[data-k="name"]', '직원 시험 손잡이'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => !!window.__wj.PH.has(window.__wj.S().src.id)), '사진을 넣으면 사진 보관소(IndexedDB)에 들어간다');
  await page.reload(); await page.waitForSelector('#paper .sec', { state: 'attached' }); await page.waitForFunction(() => window.__wj && window.__wj.LIB && window.__wj.LIB.ready, null, { timeout: 8000 }); await page.waitForTimeout(800);
  ok(await page.inputValue('[data-k="name"]') === '직원 시험 손잡이' && await page.evaluate(() => window.__wj.PH.has(window.__wj.S().src.id)), '파일을 닫았다 다시 열어도(새로 고침) 이름과 사진이 그대로 남는다');
  await page.waitForTimeout(2800);
  ok(await page.evaluate(() => window.__wj.LIB.list.length) === 1 && /내 상세페이지 1/.test(await page.textContent('#btnLib')), '"내 상세페이지"에 자동으로 보관된다');

  /* 3. 문 색 사진 4장과 글을 채우고 → 이미지로 저장 */
  await page.evaluate(async ({ D }) => {
    const w = window.__wj, S = w.S(), blob = async (b64) => (await fetch('data:image/jpeg;base64,' + b64)).blob(), L = ['화이트 도어', '월넛 우드 도어', '라이트 그레이 도어', '블랙 도어'];
    for (let i = 0; i < 4; i++) { S.colors.items[i].label = L[i]; await w.setPhoto('colors.items.' + i + '.photo', await blob(D[i]), { ai: true }); }
    await w.setPhoto('hero.photo', await blob(D[1]), { ai: true });
    S.hero.title = '우리 집 문에 깔끔하게\n어울리는 손잡이'; S.hero.sub = '문에 달았을 때의 모습을 먼저 보고 고르세요.'; S.concept.title = '군더더기 없는 둥근 레버';
    S.facts.thick = '32-45'; S.facts.backset = '60'; S.facts.bore = '54'; S.size = Object.assign({}, S.size, { shape: 'round', shapeSet: 'user', cap: '70', len: '150' });
  }, { D: ['white', 'walnut', 'gray', 'black'].map((n) => fs.readFileSync(IN + '/' + n + '.jpg').toString('base64')) });
  await page.evaluate(() => { window.__wj.S().hero.badge = '둥근 레버 방문 손잡이'; }); await page.fill('[data-k="name"]', '직원 시험 손잡이'); await page.waitForTimeout(700);   // 글 칸을 건드려 미리보기를 다시 그리게 해요
  await page.click('#btnExport'); await page.waitForSelector('#exGo');
  if (await page.locator('#exAck').count()) await page.check('#exAck');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.click('#exGo')]);
  const jp = B + '/staff/test_export' + path.extname(dl.suggestedFilename() || '.jpg'); await dl.saveAs(jp);
  const sz = fs.statSync(jp).size, head = fs.readFileSync(jp).subarray(0, 4);
  ok(sz > 150000 && (head[0] === 0xff || head[0] === 0x89), '"이미지로 저장"이 되고 파일이 열리는 그림이다(' + (sz / 1024).toFixed(0) + 'KB, ' + dl.suggestedFilename() + ')');
  const dim = require('child_process').execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', jp]).toString().trim();
  ok(/^860,\d{4,5}$/.test(dim), '저장된 긴 이미지의 가로는 860px이다 → ' + dim);
  await page.waitForTimeout(500); if (await page.locator('#exClose').count()) await page.click('#exClose'); await page.waitForTimeout(300);

  /* 4. 작업 저장(zip) → 새 제품 → 파일 불러오기로 되돌리기 */
  const [dz] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btnSave')]);
  const zp = B + '/staff/test_work.zip'; await dz.saveAs(zp);
  const z = await JZipN.loadAsync(fs.readFileSync(zp)), meta = JSON.parse(z.comment || '{}');
  ok(!!z.files['state.json'] && !!z.files['photos/index.json'] && meta.wj === 1 && meta.name === '직원 시험 손잡이', '"작업 저장"이 zip으로 내려받아진다(이름표 있음) → ' + dz.suggestedFilename());
  await page.click('#btnNew'); await page.waitForSelector('#nwGo'); await page.click('#nwGo'); await page.waitForTimeout(900);
  ok(await page.inputValue('[data-k="name"]') === '', '"새 제품"을 누르면 이름·사진이 비워진다');
  await page.click('#btnLoad'); await page.waitForSelector('#wfList'); await page.setInputFiles('#wfDir', B + '/staff');   // 폴더에서 찾기
  await page.waitForFunction(() => document.querySelectorAll('#wfList .libc').length > 0, null, { timeout: 8000 });
  ok(/직원 시험 손잡이/.test(await page.textContent('#wfList')) && !/\.jpg|\.html/.test(await page.textContent('#wfList')), '"파일 불러오기 → 폴더에서 찾기"가 작업 파일만 찾아 보여 준다(이미지·html은 안 나옴)');
  await page.click('#wfList .libc [data-wf="open"]'); await page.waitForFunction(() => document.getElementById('veil').hidden, null, { timeout: 15000 }); await page.waitForTimeout(600);
  ok(await page.inputValue('[data-k="name"]') === '직원 시험 손잡이' && await page.evaluate(() => [...document.querySelectorAll('#paper .cell img, #paper .pb')].length > 0), '목록에서 열면 이전 작업이 그대로 돌아온다');

  /* 5. 쇼츠 광고 영상(소리 포함)이 이 파일에서도 만들어진다 */
  await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
  const vm = await page.evaluate(() => ({ mode: window.__wj.VD.mode, music: window.__wj.VD.music }));
  ok(vm.mode === 'ad' && vm.music === 'bright', '영상 창: 문 사진이 있으면 "쇼츠 광고 영상"과 밝은 배경음이 처음부터 골라져 있다');
  await page.click('#vdGo'); await page.waitForSelector('#vdSave', { timeout: 120000 });
  const msg = await page.textContent('#vdMsg');
  const vb = await page.evaluate(async () => { const b = window.__wj.VD.blob; return { size: b.size, ext: window.__wj.VD.ext }; });
  ok(/다 만들었어요/.test(msg) && /배경음 있음/.test(msg) && vb.size > 500000, '영상이 만들어진다(' + (vb.size / 1048576).toFixed(1) + 'MB, 배경음 있음) → ' + msg.slice(0, 40));
  ok(errors.length === 0, '화면 오류·콘솔 오류가 없다' + (errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''));
  await ctx.close(); await browser.close();
  console.log(fails ? '\n실패 ' + fails + '개' : '\n모두 통과'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL 예외: ' + (e && e.stack || e)); process.exit(1); });
