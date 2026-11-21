/* 자동몰 상세페이지 제작기 v73 — Make 연결 자동 등록 시험 (Make 받는 주소는 가짜) */
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = (process.env.AM_DEV || '/tmp/am_dev');
const HTML = fs.readFileSync(BASE + '/w/am_work.html', 'utf8');
const H2C = fs.readFileSync(BASE + '/h2c/node_modules/html2canvas/dist/html2canvas.min.js');
const PHOTO = (process.env.AM_DEV || '/tmp/am_dev') + '/up/crop_orig.png';
const HOOK = 'https://hook.eu1.make.com/test123token';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const SEED = { v: 3, name: '시험 손잡이',
  hero: { badge: '검정 레버 방문 손잡이', title: '문에 차분하게 어울리는\n검정 레버 손잡이', sub: '문에 달았을 때의 모습을 먼저 보고 고르세요.' },
  concept: { eyebrow: 'CONCEPT', title: '가는 결이 있는 긴 레버', body: '길고 얇은 레버에 가는 결이 얇게 나 있어요.', photo: null },
  cta: { title: '우리 집 문에 달아 보세요', sub: '궁금한 점은 판매자에게 물어보세요.' },
  size: { len: '150', wid: '20', cap: '', shape: 'rect', capW: '70', capH: '54', ref: 'card', extra: [], note: '' } };

const server = http.createServer((req, res) => { if (req.url.split('?')[0] === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(HTML); } else { res.writeHead(404); res.end('no'); } });
let PORT = 0;

/* 가짜 Make 받는 주소 */
const hook = { mode: 'ok', reqs: [], delay: 0 };
async function hookRoute(route) {
  const rq = route.request(), h = rq.headers();
  if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': h.origin || '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,OPTIONS' } });
  const buf = rq.postDataBuffer(); let fields = {};
  try { const fd = await new Response(buf, { headers: { 'content-type': h['content-type'] } }).formData(); for (const [k, v] of fd.entries()) fields[k] = typeof v === 'string' ? v : { name: v.name, size: v.size, type: v.type }; } catch (e) { fields = { _err: String(e) }; }
  hook.reqs.push({ url: rq.url(), method: rq.method(), ct: h['content-type'], fields, len: buf ? buf.length : 0 });
  if (hook.delay) await new Promise((r) => setTimeout(r, hook.delay));
  if (hook.mode === 'nocors') return route.abort('failed');   // 받았지만 Make가 CORS 허용 머리글을 주지 않아 브라우저가 답을 막는 경우(앱 입장에서는 fetch가 거부됨)를 흉내
  const cors = { 'access-control-allow-origin': '*' };
  if (hook.mode === '413') return route.fulfill({ status: 413, headers: cors, body: 'Payload too large' });
  return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/plain' }, cors), body: 'Accepted' });
}
async function open(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/*', (r) => { const u = r.request().url(); if (/html2canvas\.min\.js/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: H2C }); if (u.startsWith('http://127.0.0.1:' + PORT) || /^(data|blob|about):/.test(u)) return r.continue(); return r.abort(); });
  await page.route('https://hook.eu1.make.com/**', hookRoute);
  await page.addInitScript((s) => { try { if (!localStorage.getItem('am-dp-v1')) localStorage.setItem('am-dp-v1', s); } catch (e) {} }, JSON.stringify(seed || SEED));
  await page.goto('http://127.0.0.1:' + PORT + '/');
  await page.waitForSelector('#paper .sec', { state: 'attached' });
  await page.waitForTimeout(800);
  return { ctx, page, errors };
}
async function makeVideo(page, o) {
  o = o || {};
  await page.click('#btnVideo'); await page.waitForSelector('#vdGo');
  if (o.all) { /* 기본 장면 그대로 */ } else await page.evaluate(() => document.querySelectorAll('input[data-vsec]').forEach((c) => { const on = /마지막/.test(c.dataset.vsec); if (c.checked !== on && !c.disabled) c.click(); }));
  await page.click('input[name=vspeed][value=' + (o.speed || 'fast') + ']');
  if (o.q) await page.click('input[name=vq][value=' + o.q + ']');
  if (o.fmt) await page.click('input[name=vfmt][value=' + o.fmt + ']');
  await page.click('#vdGo'); await page.waitForSelector('#vdSave', { timeout: 180000 });
  const msg = await page.textContent('#vdMsg');
  await page.click('#vdClose'); await page.waitForTimeout(200);
  return msg;
}
const waitMk = (page, re, t) => page.waitForFunction((s) => new RegExp(s).test((document.querySelector('#mkMsg') || {}).textContent || ''), re, { timeout: t || 30000 });
const openPost = async (page) => { await page.click('#btnPost'); await page.waitForSelector('#mkGo'); };
const reset = () => { hook.mode = 'ok'; hook.reqs = []; hook.delay = 0; };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); PORT = server.address().port;
  const browser = await chromium.launch();

  /* 1. 영상이 없을 때 · 주소 확인 */
  {
    reset();
    const { ctx, page, errors } = await open(browser);
    await page.click('#btnPost'); await page.waitForSelector('#mkGo');
    ok(await page.isDisabled('#mkGo') && /먼저 영상을 만들어 주세요/.test(await page.textContent('#mkBlk')), '영상 없음: 보내기 버튼이 꺼져 있고 영상을 먼저 만들라고 알려 준다');
    ok(/Make 연결/.test(await page.textContent('#mkBlk')) && /틱톡/.test(await page.textContent('.ytd')), '안내: Make 연결 칸이 있고, 틱톡은 따로 안내한다');
    await page.fill('#mkHook', 'https://evil.example.com/hook');
    ok(/Make 주소.*아니에요/.test(await page.textContent('#mkHookMsg')), '주소: Make 주소가 아니면 바로 알려 준다');
    await page.fill('#mkHook', HOOK);
    ok(/주소 모양이 맞아요/.test(await page.textContent('#mkHookMsg')) && await page.evaluate(() => localStorage.getItem('am-mkhook')) === HOOK, '주소: Make 주소는 맞다고 하고 이 브라우저에 저장한다');
    ok(errors.length === 0, '영상 없음: 오류 없음 ' + JSON.stringify(errors));
    await ctx.close();
  }

  /* 2. 세로 영상: 인스타그램 + 페이스북 보내기 */
  {
    reset();
    const { ctx, page, errors } = await open(browser);
    await makeVideo(page);
    await openPost(page);
    const chs = await page.evaluate(() => [...document.querySelectorAll('input[data-mk]')].map((c) => [c.dataset.mk, c.checked]));
    ok(JSON.stringify(chs) === JSON.stringify([['instagram', true], ['facebook', true], ['youtube', false]]), '올릴 곳(세로): 인스타그램·페이스북이 켜져 있고 유튜브는 꺼져 있다 → ' + JSON.stringify(chs));
    await page.click('#mkGo'); await waitMk(page, '자동화 주소를 먼저');
    ok(hook.reqs.length === 0, '주소 없음: 눌러도 아무것도 보내지 않는다');
    await page.fill('#mkHook', HOOK);
    await page.click('#mkGo'); await waitMk(page, 'Make가 잘 받았어요');
    ok(hook.reqs.length === 2 && hook.reqs.every((r) => r.method === 'POST' && r.url === HOOK && /^multipart\/form-data/.test(r.ct)), '보내기: 선택한 2곳에 1번씩, 폼 형식으로 Make 주소에만 보낸다 → ' + hook.reqs.map((r) => r.fields.platform).join(','));
    const ig = hook.reqs.find((r) => r.fields.platform === 'instagram').fields, fb = hook.reqs.find((r) => r.fields.platform === 'facebook').fields;
    ok(ig.format === 'vertical' && ig.title === '' && ig.description.replace(/\r\n/g, '\n').startsWith('문에 차분하게 어울리는 검정 레버 손잡이\n') && /#방문손잡이/.test(ig.description), '인스타그램: 제목 없이 문구(첫 줄 제목 문장 + 해시태그)가 간다');
    ok(fb.title === '문에 차분하게 어울리는 검정 레버 손잡이' && fb.description === ig.description, '페이스북: 제목과 같은 문구가 간다');
    ok(ig.video && /^automall_video_\d+\.mp4$/.test(ig.video.name) && ig.video.type === 'video/mp4' && ig.video.size > 10000 && ig.video.size === fb.video.size, `영상 파일: mp4 파일이 같이 간다 (${ig.video && ig.video.size}바이트)`);
    ok(ig.product === '고급스러운 메탈 방문 손잡이' && ig.source === 'automall-detail-page-maker' && /^\d{4}-\d\d-\d\dT/.test(ig.sentAt) && ig.tags.indexOf('방문손잡이') >= 0, '그 밖의 항목: 제품 이름·출처·보낸 시각·태그가 간다');
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('am-mklog') || '[]'));
    ok(log.length === 1 && log[0].r === '받음' && /보낸 기록/.test(await page.textContent('#mkLog')), '기록: 보낸 기록이 저장되고 창에 나온다');
    ok(!(await page.isDisabled('#mkGo')), '보낸 뒤: 버튼이 다시 눌린다');
    ok(errors.length === 0, '보내기: 오류 없음 ' + JSON.stringify(errors));

    /* 3. 유튜브(Make 경유)만 · 설명·태그 */
    reset();
    await page.uncheck('input[data-mk="instagram"]'); await page.uncheck('input[data-mk="facebook"]'); await page.check('input[data-mk="youtube"]');
    await page.click('#mkGo'); await waitMk(page, 'Make가 잘 받았어요');
    const yt = hook.reqs[0].fields;
    ok(hook.reqs.length === 1 && yt.platform === 'youtube' && yt.title === '문에 차분하게 어울리는 검정 레버 손잡이' && /크기: 총 길이\(캡 중심~끝\) 150mm/.test(yt.description) && yt.tags.split(', ').indexOf('방문손잡이') >= 0, '유튜브(Make): 제목·설명·태그가 간다');

    /* 4. 고친 문구가 간다 */
    reset();
    await page.fill('[data-yp="t"]', '내가 고친 제목');
    await page.click('#mkGo'); await waitMk(page, 'Make가 잘 받았어요');
    ok(hook.reqs[0].fields.title === '내가 고친 제목', '고친 문구: 위 "올릴 내용"에서 고친 제목이 그대로 간다');

    /* 5. 아무것도 안 고르면 */
    reset();
    await page.uncheck('input[data-mk="youtube"]');
    await page.click('#mkGo'); await waitMk(page, '올릴 곳을 하나 이상');
    ok(hook.reqs.length === 0, '올릴 곳 없음: 안내만 하고 보내지 않는다');
    await ctx.close();
  }

  /* 6. Make가 답을 못 읽게 한 경우 / 오류 */
  {
    reset();
    const { ctx, page } = await open(browser);
    await makeVideo(page); await openPost(page);
    await page.fill('#mkHook', HOOK);
    hook.mode = 'nocors';
    await page.click('#mkGo'); await waitMk(page, '받았는지는 여기서 확인할 수 없어요');
    ok(hook.reqs.length === 2, '답 없음(CORS): 2곳에 1번씩만 보내고 같은 것을 또 보내지 않는다 → ' + hook.reqs.length + '번');
    ok(/Make의 "실행 기록"/.test(await page.textContent('#mkMsg')) && (await page.evaluate(() => JSON.parse(localStorage.getItem('am-mklog'))[0].r)) === '확인 필요', '답 없음(CORS): 받았다고 거짓말하지 않고 Make 실행 기록에서 확인하라고 알려 준다');
    reset(); hook.mode = '413';
    await page.click('#mkGo'); await waitMk(page, '보내지 못한 곳이 있어요');
    ok(/413/.test(await page.textContent('#mkMsg')) && (await page.evaluate(() => JSON.parse(localStorage.getItem('am-mklog'))[0].r)) === '실패', '오류(413): 보내지 못했다고 알리고 기록에 실패로 남긴다 → ' + (await page.textContent('#mkMsg')).slice(0, 60));
    await ctx.close();
  }

  /* 7. 가로 영상: 인스타그램은 빠진다 */
  {
    reset();
    const { ctx, page } = await open(browser);
    await makeVideo(page, { fmt: 'h' }); await openPost(page);
    const chs = await page.evaluate(() => [...document.querySelectorAll('input[data-mk]')].map((c) => c.dataset.mk));
    ok(JSON.stringify(chs) === JSON.stringify(['facebook', 'youtube']), '올릴 곳(가로): 인스타그램 릴스는 나오지 않는다 → ' + JSON.stringify(chs));
    await page.fill('#mkHook', HOOK); await page.check('input[data-mk="youtube"]');
    await page.click('#mkGo'); await waitMk(page, 'Make가 잘 받았어요');
    ok(hook.reqs.length === 2 && hook.reqs.every((r) => r.fields.format === 'horizontal'), '가로: 가로 영상으로 표시해 2곳에 보낸다');
    ok(hook.reqs.find((r) => r.fields.platform === 'youtube').fields.tags.split(', ').indexOf('방문손잡이') >= 0, '가로(유튜브): 태그 칸의 태그가 간다');
    await ctx.close();
  }

  /* 8. 보내는 동안 창이 닫히지 않는다 */
  {
    reset();
    const { ctx, page } = await open(browser);
    await makeVideo(page); await openPost(page);
    await page.fill('#mkHook', HOOK); hook.delay = 2500;
    await page.click('#mkGo'); await page.waitForTimeout(400);
    await page.mouse.click(4, 4); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    ok(await page.locator('#mkGo').isVisible() && await page.isDisabled('#mkGo'), '보내는 중: 바깥을 누르거나 Esc를 눌러도 창이 닫히지 않고 버튼은 잠겨 있다');
    await waitMk(page, 'Make가 잘 받았어요', 40000);
    ok(hook.reqs.length === 2, '보내는 중: 눌러도 중복으로 보내지 않는다 → ' + hook.reqs.length + '번');
    await ctx.close();
  }

  /* 9. 영상이 크면 막고, 용량 "작게"로 만들면 보낼 수 있다 (사진이 있는 긴 영상) */
  {
    reset();
    const { ctx, page } = await open(browser);
    await page.locator('input[data-file="src"]').first().setInputFiles(PHOTO); await page.waitForTimeout(2500);
    const m1 = await makeVideo(page, { all: true, speed: 'slow', q: 'hi' });
    const big = Number((m1.match(/·\s*([\d.]+)MB/) || [])[1]);
    await openPost(page); await page.fill('#mkHook', HOOK);
    ok(big > 4.8 && /너무|5MB 이하만/.test(await page.textContent('#mkBlk')), `큰 영상(${big}MB): 약 5MB 이하만 보낼 수 있다고 알려 준다`);
    await page.click('#mkGo'); await waitMk(page, '5MB 이하만 보내져요');
    ok(hook.reqs.length === 0, '큰 영상: 보내기를 눌러도 보내지 않는다');
    await page.click('#ytClose'); await page.waitForTimeout(200);
    const m2 = await makeVideo(page, { all: true, speed: 'slow', q: 'lo' });
    const small = Number((m2.match(/·\s*([\d.]+)MB/) || [])[1]);
    ok(small > 0 && small <= 4.8 && small < big, `용량 작게: ${big}MB → ${small}MB로 줄고 5MB 이하다`);
    await openPost(page);
    await page.click('#mkGo'); await waitMk(page, 'Make가 잘 받았어요');
    ok(hook.reqs.length === 2 && hook.reqs[0].fields.video.size <= 4.8 * 1048576, '용량 작게: 5MB 이하 영상은 보내진다');
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails === 0 ? '\n전부 PASS' : '\nFAIL ' + fails + '건');
  process.exit(fails ? 1 : 0);
})();
