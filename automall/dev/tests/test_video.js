/* 자동몰 상세페이지 제작기 v67 — 상세페이지로 영상 만들기 시험 (PASS/FAIL 줄로 보고) */
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const BASE = (process.env.AM_DEV || '/tmp/am_dev');
const FILE = BASE + '/w/am_work.html';
const OUT = BASE + '/w/vid';
fs.mkdirSync(OUT, { recursive: true });
const H2C = fs.readFileSync(BASE + '/h2c/node_modules/html2canvas/dist/html2canvas.min.js');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());

const SEED = {
  v: 3, name: '시험 손잡이',
  hero: { badge: '검정 레버 방문 손잡이', title: '문에 차분하게 어울리는\n검정 레버 손잡이', sub: '문에 달았을 때의 모습을 먼저 보고 고르세요.' },
  concept: { eyebrow: 'CONCEPT', title: '가는 결이 있는 긴 레버', body: '길고 얇은 레버에 가는 결이 얇게 나 있어요.', photo: null },
  cta: { title: '우리 집 문에 달아 보세요', sub: '궁금한 점은 판매자에게 물어보세요.' },
  size: { len: '150', wid: '20', cap: '', shape: 'rect', capW: '70', capH: '54', ref: 'card', extra: [], note: '※ 그림은 도식이에요.' }
};

async function open(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (/html2canvas\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: H2C });
    if (/^(file|data|blob|about):/.test(u)) return r.continue();
    return r.abort();
  });
  if (seed) await page.addInitScript((s) => { try { localStorage.setItem('am-dp-v1', s); } catch (e) {} }, JSON.stringify(seed));
  await page.goto('file://' + FILE);
  await page.waitForSelector('#paper .sec');
  await page.waitForTimeout(800);
  return { ctx, page, errors };
}
async function setSections(page, wanted) {   // 고른 장면만 켠다
  await page.evaluate((w) => { document.querySelectorAll('input[data-vsec]').forEach((c) => { const on = w.some((x) => c.dataset.vsec.includes(x)); if (c.checked !== on) c.click(); }); }, wanted);
}
async function runAndWait(page, timeout = 90000) {
  await page.click('#vdGo');
  await page.waitForSelector('#vdSave', { timeout });
  return page.evaluate(() => document.querySelector('#vdMsg').textContent);
}
async function saveBlob(page, file) {
  const b64 = await page.evaluate(async () => { const v = document.querySelector('#vdPrev video'); const r = await fetch(v.src); const buf = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768)); return btoa(s); });
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return fs.statSync(file).size;
}

(async () => {
  const browser = await chromium.launch();

  /* 1. 버튼 위치와 창 */
  {
    const { ctx, page, errors } = await open(browser, SEED);
    const order = await page.evaluate(() => [...document.querySelectorAll('.top-actions > *')].map((e) => e.id || e.tagName));
    const i = order.indexOf('btnExport');
    ok(i >= 0 && order[i + 1] === 'btnVideo', '버튼: "이미지로 저장" 바로 다음에 영상 버튼이 있다 → ' + JSON.stringify(order));
    ok((await page.textContent('#btnVideo')).trim() === '상세페이지로 영상 만들기', '버튼: 글자가 "상세페이지로 영상 만들기"');
    ok(/^btn$/.test(await page.getAttribute('#btnVideo', 'class')), '버튼: 다른 버튼과 같은 모양(btn)');
    await page.click('#btnVideo');
    await page.waitForSelector('#vdGo');
    const names = await page.evaluate(() => [...document.querySelectorAll('input[data-vsec]')].map((c) => [c.dataset.vsec, c.checked]));
    ok(names.length === 12, '창: 장면 12개가 나열된다(v77 제품 규격 · v97 핵심 포인트와 설치 그림 둘째 조각이 늘었다) → ' + JSON.stringify(names.map((n) => n[0])));
    ok(await page.evaluate(() => { const c = document.querySelector('input[data-vsec="02_규격"]'); return !!c && c.disabled && !c.checked && /비어 있어서/.test(c.closest('label').textContent); }), '창: 규격을 안 적었으면 "제품 규격" 장면은 선택할 수 없고 비어 있다고 알려 준다');
    const on = names.filter((n) => n[1]).map((n) => n[0].replace(/^\d+_/, ''));
    ok(JSON.stringify(on) === JSON.stringify(['첫화면', '핵심포인트', '소개', '확대', '마지막']), '창: 처음에는 글 적은 장면만 켜져 있고, 비어 있는 문색상은 꺼져 있다 → ' + JSON.stringify(on));
    ok(await page.evaluate(() => { const c = document.querySelector('input[data-vsec="04_문색상"]'); return c.disabled && !c.checked && /비어 있어서/.test(c.closest('label').textContent); }), '창: 비어 있는 문색상은 선택할 수 없고 비어 있어서 빠진다고 알려 준다');
    const est = await page.textContent('#vdEst');
    ok(/예상 길이 약 \d+초/.test(est), '창: 예상 길이가 나온다 → ' + est);
    ok(await page.isChecked('input[name=vspeed][value=normal]') && await page.isChecked('input[name=vmusic][value=none]'), '창: 기본값은 속도 보통·배경음 없음');
    ok(await page.isChecked('input[name=vfmt][value=v]') && await page.locator('input[name=vfmt]').count() === 2, '창: 영상 모양(세로·가로) 선택이 있고 기본은 세로');
    const before = Number(est.match(/(\d+)초/)[1]);
    await page.click('input[name=vspeed][value=slow]');
    const slow = Number((await page.textContent('#vdEst')).match(/(\d+)초/)[1]);
    await page.click('input[name=vspeed][value=fast]');
    const fast = Number((await page.textContent('#vdEst')).match(/(\d+)초/)[1]);
    ok(slow > before && before > fast, `창: 속도를 바꾸면 예상 길이가 달라진다 (천천히 ${slow} > 보통 ${before} > 빠르게 ${fast})`);
    await setSections(page, []);
    ok(/하나 이상/.test(await page.textContent('#vdEst')) && await page.isDisabled('#vdGo'), '창: 장면을 모두 끄면 안내가 나오고 만들기 버튼이 꺼진다');
    await page.screenshot({ path: OUT + '/dialog.png' });
    // 이미지로 저장 창도 그대로 열린다
    await page.click('#vdClose'); await page.waitForTimeout(200);
    await page.click('#btnExport'); await page.waitForSelector('#exGo');
    ok(true, '기존: "이미지로 저장" 창이 그대로 열린다');
    ok(errors.length === 0, '버튼·창: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 2. 빠르게 · 소리 없음: 첫화면+마지막만 */
  {
    const { ctx, page, errors } = await open(browser, SEED);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    await setSections(page, ['첫화면', '마지막']);
    await page.click('input[name=vspeed][value=fast]');
    const est = Number((await page.textContent('#vdEst')).match(/(\d+)초/)[1]);
    const t0 = Date.now();
    const msg = await runAndWait(page);
    const took = (Date.now() - t0) / 1000;
    ok(/다 만들었어요/.test(msg) && /소리 없음/.test(msg), '영상(소리 없음): 끝났다고 알려 준다 → ' + msg);
    const f = OUT + '/silent.webm';
    const size = await saveBlob(page, f);
    ok(size > 20000, '영상(소리 없음): 파일이 만들어졌다 (' + size + ' 바이트)');
    const info = probe(f);
    const v = info.streams.find((s) => s.codec_type === 'video'), a = info.streams.find((s) => s.codec_type === 'audio');
    ok(v && v.width === 1080 && v.height === 1920, `영상(소리 없음): 1080×1920 세로 영상 → ${v && v.width}×${v && v.height} ${v && v.codec_name}`);
    ok(!a, '영상(소리 없음): 소리 줄기가 없다');
    // 길이: webm은 헤더에 길이가 없을 수 있어 프레임 시간으로 잰다
    const pts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', f]).toString().trim().split('\n').map(Number).filter((x) => !isNaN(x));
    const dur = Math.max.apply(null, pts);
    ok(Math.abs(dur - est) < 2.2, `영상(소리 없음): 길이가 예상과 비슷하다 (예상 ${est}초, 실제 약 ${dur.toFixed(1)}초, 걸린 시간 ${took.toFixed(1)}초)`);
    ok(pts.length > dur * 8, `영상(소리 없음): 움직이는 장면이 이어진다 (${pts.length}프레임)`);
    // 장면 확인용 프레임
    for (const [i, frac] of [[1, 0.02], [2, 0.3], [3, 0.6], [4, 0.97]]) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, dur * frac)), '-i', f, '-frames:v', '1', '-vf', 'scale=270:-1', OUT + `/silent_f${i}.png`]);
    }
    const hasPrev = await page.evaluate(() => { const v = document.querySelector('#vdPrev video'); return !!v && !!v.src; });
    ok(hasPrev, '영상(소리 없음): 창 안에 재생 화면이 나온다');
    ok(await page.locator('#vdSave').count() === 1 && /\.webm|\.mp4/.test(await page.textContent('#vdSave')), '영상(소리 없음): 저장 버튼이 있다 → ' + (await page.textContent('#vdSave')));
    const dl = page.waitForEvent('download', { timeout: 15000 });
    await page.click('#vdSave');
    const d = await dl;
    const dp = OUT + '/downloaded.bin'; await d.saveAs(dp);
    ok(fs.statSync(dp).size === size, '영상(소리 없음): 저장 버튼으로 받은 파일이 미리보기와 같다 (' + d.suggestedFilename() + ')');
    ok(errors.length === 0, '영상(소리 없음): 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 3. 배경음 차분하게 */
  {
    const { ctx, page, errors } = await open(browser, SEED);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    await setSections(page, ['첫화면', '마지막']);
    await page.click('input[name=vspeed][value=fast]');
    await page.click('input[name=vmusic][value=calm]');
    const msg = await runAndWait(page);
    ok(/배경음 있음/.test(msg), '영상(배경음): 끝났다고 알려 준다 → ' + msg);
    const f = OUT + '/calm.webm'; await saveBlob(page, f);
    const info = probe(f);
    const a = info.streams.find((s) => s.codec_type === 'audio');
    ok(!!a, '영상(배경음): 소리 줄기가 있다 → ' + (a && a.codec_name));
    if (a) {
      const vol = execFileSync('ffmpeg', ['-v', 'info', '-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    }
    let mean = null;
    try { execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-']); } catch (e) {}
    const r = require('child_process').spawnSync('ffmpeg', ['-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr || ''); mean = m ? Number(m[1]) : null;
    ok(mean !== null && mean > -60, '영상(배경음): 실제로 소리가 들어 있다 (평균 ' + mean + ' dB)');
    ok(errors.length === 0, '영상(배경음): 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 3b. 기본 장면 전체: 예상 길이와 실제 길이가 가깝다 */
  {
    const { ctx, page, errors } = await open(browser, SEED);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    await page.click('input[name=vspeed][value=fast]');
    const est = Number((await page.textContent('#vdEst')).match(/(\d+)초/)[1]);
    const msg = await runAndWait(page);
    const real = Number(msg.match(/약 (\d+)초/)[1]);
    ok(Math.abs(est - real) <= 1, `기본 장면 전체: 예상 길이(${est}초)와 실제 길이(${real}초)가 거의 같다`);
    const f = OUT + '/all.mp4'; await saveBlob(page, f);
    const v = probe(f).streams.find((q) => q.codec_type === 'video');
    ok(v && v.width === 1080 && v.height === 1920, '기본 장면 전체: 1080×1920');
    ok(errors.length === 0, '기본 장면 전체: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 3c. 세로 영상 + 올릴 곳(유튜브 쇼츠·인스타그램 릴스·틱톡) */
  {
    const { ctx, page, errors } = await open(browser, SEED);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    ok(await page.locator('#vdPrev [data-vch]').count() === 0, '올릴 곳: 영상을 만들기 전에는 나오지 않는다');
    await setSections(page, ['첫화면', '마지막']);
    await page.click('input[name=vspeed][value=fast]');
    await runAndWait(page);
    const cards = await page.evaluate(() => [...document.querySelectorAll('#vdPrev [data-vch]')].map((c) => ({
      k: c.dataset.vch, name: c.querySelector('h3').textContent,
      title: (c.querySelector('input[data-vp$=".t"]') || {}).value, desc: (c.querySelector('textarea[data-vp$=".d"]') || {}).value,
      link: (() => { const a = c.querySelector('a'); return a ? { href: a.href, target: a.target, rel: a.rel } : null; })(),
      steps: c.querySelectorAll('ol li').length
    })));
    ok(JSON.stringify(cards.map((c) => c.k)) === JSON.stringify(['ys', 'ig', 'tt']), '올릴 곳(세로): 유튜브 쇼츠·인스타그램 릴스·틱톡 3곳이 나온다 → ' + JSON.stringify(cards.map((c) => c.name)));
    const ys = cards[0], ig = cards[1], tt = cards[2];
    ok(ys.title === '문에 차분하게 어울리는 검정 레버 손잡이' && ys.title.length <= 100, '올릴 곳(쇼츠): 제목이 상세페이지 첫 화면 제목으로 채워진다 → ' + ys.title);
    ok(/문에 달았을 때의 모습을 먼저 보고 고르세요/.test(ys.desc) && /크기: 총 길이\(캡 중심~끝\) 150mm · 총 폭 20mm · 캡 70mm × 54mm/.test(ys.desc), '올릴 곳(쇼츠): 설명에 상세페이지 글과 직접 적은 크기가 들어간다');
    ok(/가족의 안전과 평화를 먼저 생각/.test(ys.desc) && /우진글로벌 주식회사 · 전북 익산/.test(ys.desc), '올릴 곳(쇼츠): 회사 소개의 안전·평화 문장과 회사 이름이 들어간다');
    ok(/#방문손잡이/.test(ys.desc) && /#우진글로벌/.test(ys.desc), '올릴 곳(쇼츠): 해시태그가 들어간다');
    ok(!/백셋|문 두께|구멍|재질|아연|스테인/.test(ys.desc + ig.desc + tt.desc), '올릴 곳: 적지 않은 사양(백셋·두께·재질 등)은 지어내지 않는다');
    ok(ig.title === undefined && tt.title === undefined && ig.desc.startsWith('문에 차분하게 어울리는 검정 레버 손잡이\n'), '올릴 곳(릴스·틱톡): 제목 칸 없이 문구(설명) 한 칸이고 첫 줄이 제목 문장이다');
    ok(/youtube\.com/.test(ys.link.href) && /instagram\.com/.test(ig.link.href) && /tiktok\.com\/upload/.test(tt.link.href), '올릴 곳: 바로가기 주소가 맞다 → ' + [ys, ig, tt].map((c) => c.link.href).join(' , '));
    ok(cards.every((c) => c.link.target === '_blank' && /noopener/.test(c.link.rel)), '올릴 곳: 바로가기는 새 탭에서 열리고 noopener가 걸려 있다');
    ok(cards.every((c) => c.steps >= 3), '올릴 곳: 올리는 순서가 3줄 이상 있다');
    ok(/자동으로 올려 주지는 않아요/.test(await page.textContent('#vdPrev')), '올릴 곳: 자동으로 올려 주지 않는다는 안내가 있다');
    // 고쳐 쓰고 복사
    const ta = page.locator('[data-vch="ig"] textarea');
    await ta.fill('내가 고친 문구 #테스트');
    await page.click('[data-vch="ig"] [data-vcopy="ig.d"]');
    await page.waitForTimeout(300);
    let clip = null; try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch (e) { clip = 'ERR ' + e.message; }
    ok(clip === '내가 고친 문구 #테스트', '올릴 곳: 고친 문구가 그대로 복사된다 → ' + JSON.stringify(clip));
    await page.click('[data-vch="ys"] [data-vcopy="ys.t"]'); await page.waitForTimeout(300);
    try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch (e) { clip = 'ERR ' + e.message; }
    ok(clip === ys.title, '올릴 곳: 제목 복사 버튼이 제목을 복사한다');
    // 창을 닫았다 다시 열어도 만든 영상과 고친 문구가 남는다
    await page.click('#vdClose'); await page.waitForTimeout(200);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    ok(await page.locator('#vdPrev video').count() === 1 && await page.inputValue('[data-vch="ig"] textarea') === '내가 고친 문구 #테스트', '올릴 곳: 창을 닫았다 다시 열어도 영상과 고친 문구가 남아 있다');
    await page.screenshot({ path: OUT + '/register_vertical.png' });
    ok(errors.length === 0, '올릴 곳(세로): 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 3d. 가로 영상(유튜브) */
  {
    const { ctx, page, errors } = await open(browser, SEED);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    await setSections(page, ['첫화면', '소개', '마지막']);
    await page.click('input[name=vspeed][value=fast]');
    const estV = Number((await page.textContent('#vdEst')).match(/(\d+)초/)[1]);
    await page.click('input[name=vfmt][value=h]');
    const estH = Number((await page.textContent('#vdEst')).match(/(\d+)초/)[1]);
    ok(estH >= estV, `가로: 화면이 낮아서 멈추는 곳이 늘어 예상 길이가 같거나 길다 (세로 ${estV}초, 가로 ${estH}초)`);
    const msg = await runAndWait(page, 120000);
    const real = Number(msg.match(/약 (\d+)초/)[1]);
    ok(Math.abs(estH - real) <= 1, `가로: 예상 길이(${estH}초)와 실제 길이(${real}초)가 거의 같다`);
    const f = OUT + '/horizontal.mp4'; await saveBlob(page, f);
    const v = probe(f).streams.find((q) => q.codec_type === 'video');
    ok(v && v.width === 1920 && v.height === 1080, `가로: 1920×1080 영상 → ${v && v.width}×${v && v.height}`);
    const cards = await page.evaluate(() => [...document.querySelectorAll('#vdPrev [data-vch]')].map((c) => ({
      k: c.dataset.vch, hasTitle: !!c.querySelector('input[data-vp$=".t"]'), tags: (c.querySelector('input[data-vp$=".g"]') || {}).value })));
    ok(cards.length === 1 && cards[0].k === 'yl' && cards[0].hasTitle, '올릴 곳(가로): 유튜브 일반 영상 1곳만 나온다 → ' + JSON.stringify(cards.map((c) => c.k)));
    ok(/^방문손잡이, 레버손잡이/.test(cards[0].tags || '') && !/#/.test(cards[0].tags || ''), '올릴 곳(가로): 태그는 # 없이 쉼표로 나뉜다 → ' + cards[0].tags);
    // 양옆 띠(어두운 남색)와 가운데 흰 칸
    const dur = Number(probe(f).format.duration) || 4;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0.5, dur * 0.6)), '-i', f, '-frames:v', '1', OUT + '/h_mid.png']);
    const px = execFileSync('python3', ['-I', '-c', "from PIL import Image;im=Image.open('" + OUT + "/h_mid.png').convert('RGB');print(im.size, im.getpixel((60,540)), im.getpixel((1860,540)))"]).toString().trim();
    const m = px.match(/\((\d+), (\d+)\) \((\d+), (\d+), (\d+)\) \((\d+), (\d+), (\d+)\)/);
    ok(m && Number(m[1]) === 1920 && Number(m[3]) < 60 && Number(m[6]) < 60, '가로: 양옆은 어두운 남색 띠다 → ' + px);
    // 가로 영상 뒤에 세로로 바꿔 만들면 올릴 곳이 세로용 3곳으로 바뀐다
    await page.click('input[name=vfmt][value=v]');
    await page.click('#vdGo'); await page.waitForFunction(() => /다 만들었어요/.test(document.querySelector('#vdMsg').textContent) && document.querySelectorAll('#vdPrev [data-vch]').length === 3, null, { timeout: 120000 });
    ok(true, '가로: 이어서 세로로 다시 만들면 올릴 곳이 세로용 3곳으로 바뀐다');
    ok(errors.length === 0, '올릴 곳(가로): 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 4. 멈추기 */
  {
    const { ctx, page, errors } = await open(browser, SEED);
    await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
    await page.click('input[name=vspeed][value=slow]');
    await page.click('#vdGo');
    await page.waitForFunction(() => /녹화하는 중/.test((document.querySelector('#vdMsg') || {}).textContent || ''), null, { timeout: 60000 });
    ok(await page.textContent('#vdClose') === '멈추기', '멈추기: 만드는 동안 닫기 버튼이 "멈추기"로 바뀐다');
    // 바깥(어두운 배경)을 눌러도 창이 닫히지 않는다
    await page.mouse.click(5, 5); await page.waitForTimeout(200);
    ok(await page.locator('#vdGo').count() === 1, '멈추기: 만드는 동안 바깥을 눌러도 창이 닫히지 않는다');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(await page.locator('#vdGo').count() === 1 && await page.isVisible('#vdGo'), '멈추기: 만드는 동안 Esc를 눌러도 창이 닫히지 않는다');
    await page.click('#vdClose');
    await page.waitForFunction(() => /멈췄어요/.test((document.querySelector('#vdMsg') || {}).textContent || ''), null, { timeout: 20000 });
    ok(true, '멈추기: "멈췄어요."가 나온다');
    await page.waitForTimeout(300);
    ok(await page.textContent('#vdClose') === '닫기' && !(await page.isDisabled('#vdGo')), '멈추기: 닫기·영상 만들기 버튼이 원래대로 돌아온다');
    ok(await page.locator('#vdSave').count() === 0, '멈추기: 멈춘 영상은 저장 버튼이 나오지 않는다');
    // 멈춘 뒤 다시 만들 수 있다
    await page.click('input[name=vspeed][value=fast]');
    await setSections(page, ['마지막']);
    const msg = await runAndWait(page);
    ok(/다 만들었어요/.test(msg), '멈추기: 멈춘 뒤 다시 만들면 끝까지 만들어진다');
    ok(errors.length === 0, '멈추기: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  await browser.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건');
  process.exit(fails ? 1 : 0);
})();
