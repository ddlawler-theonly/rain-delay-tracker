import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8765/';
const SHOT = process.env.SHOT || '';
const b = await chromium.launch();
const errs = [];
async function page(w, h, mobile) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, acceptDownloads: true, timezoneId: 'America/Chicago' });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  return p;
}
const p = await page(390, 844, true);
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForFunction(() => document.querySelector('#status')?.textContent.length > 0, null, { timeout: 30000 });
await p.waitForTimeout(1500);
console.log('STATUS:', await p.textContent('#status'));
const st = await p.evaluate(() => { const S = window.__rdt.state, j = S.jobs[0]; const rows = window.__rdt.analyze(j); const s = window.__rdt.summarize(j, rows);
  return { n: rows.length, last: rows.at(-1), rain: rows.filter(r=>r.rain).map(r=>r.date+':'+r.d.precip), wet: rows.filter(r=>r.wetCand).map(r=>r.date), s, fc: j.forecast }; });
console.log(JSON.stringify(st, null, 1).slice(0, 2500));
if (SHOT) await p.screenshot({ path: SHOT + '1_jobs_phone.png', fullPage: true });
await p.click('a.job');
await p.waitForSelector('.day');
// confirm wet-out Nov 16? mark first pending wet-out confirmed, set crew on Nov 15
await p.locator('.day', { hasText: 'Nov 16' }).locator('button', { hasText: 'Wet-out ✓' }).click();
await p.locator('.day', { hasText: 'Sun, Nov 15' }).locator('button', { hasText: 'Rained out' }).click();
await p.locator('.day', { hasText: 'Sun, Nov 15' }).locator('input[data-note]').fill('Site flooded, no work');
await p.locator('.day', { hasText: 'Sun, Nov 15' }).locator('input[data-note]').press('Tab');
if (SHOT) await p.screenshot({ path: SHOT + '2_daily_log_phone.png', fullPage: false });
await p.click('button[data-tab=summary]');
console.log('SUMMARY:', (await p.textContent('main')).replace(/\s+/g, ' ').slice(0, 900));
// exports
await p.click('button[data-tab=export]');
for (const id of ['xcsv', 'xxlsx', 'xpdf']) {
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#' + id)]);
  const path = '/workspace/rain-tracker/test/out_' + dl.suggestedFilename(); await dl.saveAs(path); console.log('DOWNLOAD', path);
}
// add job (Dallas) on desktop
const d = await page(1280, 900, false);
await d.goto(BASE, { waitUntil: 'networkidle' });
await d.evaluate(() => localStorage.setItem('x', '1'));
await d.click('text=Add job');
await d.fill('#name', 'Test Bergamo'); await d.fill('#number', 'T100'); await d.fill('#address', '1500 Marilla St, Dallas, TX 75201');
await d.click('#geo');
await d.waitForFunction(() => /Found|not found|HTTP|fetch/i.test(document.querySelector('#geomsg').textContent), null, { timeout: 20000 });
console.log('GEO:', await d.textContent('#geomsg'), await d.inputValue('#lat'), await d.inputValue('#lon'), await d.textContent('#stmsg'));
if (!(await d.inputValue('#lat'))) { await d.fill('#lat', '32.7767'); await d.fill('#lon', '-96.7970'); }
await d.fill('#start', '2026-10-15'); await d.fill('#end', '2027-03-15');
if (SHOT) await d.screenshot({ path: SHOT + '3_add_job_desktop.png', fullPage: true });
await d.click('button[type=submit]');
await d.waitForFunction(() => /updated|Up to date|failed/.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 30000 });
console.log('ADD STATUS:', await d.textContent('#status'));
await d.click('[data-f=all]');
const j2 = await d.evaluate(() => { const j = window.__rdt.state.jobs.find(x => x.name === 'Test Bergamo'); const rows = window.__rdt.analyze(j); return { station: j.station, mi: j.stationMi, n: rows.length, missing: rows.filter(r=>!r.has).map(r=>r.date), sample: rows.slice(0,2).map(r=>r.d), s: window.__rdt.summarize(j, rows) }; });
console.log(JSON.stringify(j2).slice(0, 1500));
if (SHOT) { await d.click('button[data-tab=summary]'); await d.screenshot({ path: SHOT + '4_summary_desktop.png', fullPage: true }); }
console.log('ERRORS:', errs);
await b.close();
