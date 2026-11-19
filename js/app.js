// Rain Out - static, offline-capable. All data lives in this browser (localStorage).
import { STATIONS, SEED_DAYS, SEED_JOB, NORMALS, PRESET_JOBS } from './data.js';
import { CONFIG } from './config.js';
import { PRO, PRO_IDS, FREE_JOBS, FREE_LISTS, countedJobs, isProActive, gate as gateRule, REASON_TEXT, periodLabel } from './pro.js';
const N = () => window.RDNative; // native bridge (iOS app only)
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DOW = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];

const VERSION = CONFIG.VERSION;
const KEY = 'rdt.v1';
const TZ = 'America/Chicago'; // default site zone (all pre-1.4 jobs are Texas)
const MPH_PER_KT = 1.150779;
const IEM_SOURCE = 'IEM ASOS daily summary';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- dates (each job's calendar days are in its weather station's local time zone) ----------
function todayIn(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
}
function chicagoToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; } // device-local date: file names / backups only (name kept for tests)
function jobTZ(j) { return stationById(j?.station)?.tz || TZ; }
function jobToday(j) { return todayIn(jobTZ(j)); }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dayRange(a, b) { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }
function wkday(iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }); }
function fmtDate(iso) { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
function fmtShort(iso) { if (!iso) return '—'; return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }
function monthName(ym) { return new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }); }
function nowChicago() { return new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); } // device local time with zone label

// ---------- stations ----------
const ST = STATIONS.map(([id, name, lat, lon, p, st, tz]) => ({ id, name, lat, lon, precip: !!p, st: st || 'TX', tz: tz || TZ }));
const ST_BY_ID = new Map(ST.map((s) => [s.id, s]));
function icao(id) { return /^[A-Z]{3}$/.test(id) ? 'K' + id : id; }
function miles(aLat, aLon, bLat, bLon) {
  const R = 3958.8, t = Math.PI / 180, dLat = (bLat - aLat) * t, dLon = (bLon - aLon) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * t) * Math.cos(bLat * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function nearest(lat, lon, n = 8, all = false) { return ST.filter((s) => all || s.precip).map((s) => ({ ...s, mi: miles(lat, lon, s.lat, s.lon) })).sort((a, b) => a.mi - b.mi).slice(0, n); }
function stationById(id) { return ST_BY_ID.get(id); }

// ---------- storage ----------
let S = load();
if (!S && N()?.restore) { try { const v = await N().restore(); if (v) { localStorage.setItem(KEY, v); S = load(); } } catch (e) {} } // iOS app: recover from native backup
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.jobs)) return s; } catch (e) {} return null; }
function save() { const v = JSON.stringify(S); localStorage.setItem(KEY, v); N()?.backup?.(v); }
function uid() { return 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function seed() {
  const days = {};
  for (const d of SEED_DAYS) {
    days[d.date] = { precip: d.precip, precipText: d.precipText, hi: d.hi, lo: d.lo, gust: d.gust, station: 'KIAH', source: 'NWS CLI KIAH', remarks: d.remarks || '', missing: d.precip == null };
  }
  S = { version: 1, jobs: SEED_JOB ? [{ ...SEED_JOB, days, forecast: {}, created: new Date().toISOString() }] : [] };
  save();
}
function sampleJob() {
  // Store build demo: a real public location; weather is fetched live (never invented).
  const t = chicagoToday();
  return { id: 'sample', name: 'Sample: Downtown Houston', number: 'DEMO-1', address: '901 Bagby St, Houston TX 77002 (City Hall)', lat: 29.760197, lon: -95.369473,
    start: addDays(t, -45), end: addDays(t, 120), threshold: 0.5, wetOut: true, station: nearest(29.760197, -95.369473, 1)[0].id, stationMi: +nearest(29.760197, -95.369473, 1)[0].mi.toFixed(2), stationAuto: true, notes: 'Demo job - delete any time.', days: {}, forecast: {}, created: new Date().toISOString(), sample: true };
}
function mergePresets() {
  // Add Derek's preset jobs by stable id. Never overwrite or re-add a job he edited or deleted.
  S.presetsSeen ||= [];
  let added = 0;
  for (const p of PRESET_JOBS) {
    if (S.presetsSeen.includes(p.id)) continue;
    if (!S.jobs.some((j) => j.id === p.id)) { S.jobs.push({ ...JSON.parse(JSON.stringify(p)), days: {}, forecast: {}, preset: true, created: new Date().toISOString() }); added++; }
    S.presetsSeen.push(p.id);
  }
  return added;
}
if (CONFIG.STORE) { if (!S) { S = { version: 1, jobs: [] }; save(); } }
else { if (!S) seed(); if (mergePresets()) save(); }
// ---------- project lists ----------
function migrate() {
  for (const j of S.jobs) { if (!Array.isArray(j.workDays) || !j.workDays.length) j.workDays = [...ALL_DAYS]; }
  if (!Array.isArray(S.lists) || !S.lists.length) {
    S.lists = CONFIG.STORE ? [{ id: 'default', name: 'My Jobs' }] : [{ id: 'houston', name: 'Houston' }, { id: 'alabama', name: 'Alabama' }];
    S.defaultList = S.lists[0].id;
  }
  if (!S.lists.some((l) => l.id === S.defaultList)) S.defaultList = S.lists[0].id;
  for (const j of S.jobs) if (!S.lists.some((l) => l.id === j.listId)) j.listId = S.defaultList;
  if (S.activeList !== 'all' && !S.lists.some((l) => l.id === S.activeList)) S.activeList = S.defaultList;
}
migrate();
save();

// ---------- Rain Out Pro (App Store build only; StoreKit 2 via window.RDNative.iap, no server) ----------
const PRO_CACHE = 'rdt.pro'; // last known entitlement, so the UI doesn't flash before StoreKit answers (StoreKit is the authority)
let proState = (() => { try { return JSON.parse(localStorage.getItem(PRO_CACHE)) || { ents: [] }; } catch { return { ents: [] }; } })();
let proProducts = null, proBusy = false;
const proOn = () => !CONFIG.STORE || isProActive(proState.ents);
const gate = (action) => gateRule(action, { store: CONFIG.STORE, pro: proOn(), jobs: S.jobs, lists: S.lists });
function setEnts(ents) { proState = { ents: ents || [], checked: new Date().toISOString() }; try { localStorage.setItem(PRO_CACHE, JSON.stringify(proState)); } catch {} }
async function initPro() {
  const iap = N()?.iap; if (!CONFIG.STORE || !iap) return;
  iap.onChange?.((ents) => { setEnts(ents); render(); });
  try { setEnts(await iap.entitlements()); } catch (e) { console.warn('entitlements', e); }
  render();
}
function requirePro(action) { const g = gate(action); if (!g.ok) location.hash = '#/pro/' + g.reason; return g.ok; }
const listName = (id) => (id === 'all' ? 'All jobs' : S.lists.find((l) => l.id === id)?.name || '?');
const jobsInView = () => (S.activeList === 'all' ? S.jobs : S.jobs.filter((j) => j.listId === S.activeList));
function newList(name) {
  name = (name || '').trim(); if (!name) return null;
  const ex = S.lists.find((l) => l.name.toLowerCase() === name.toLowerCase()); if (ex) return ex.id;
  const id = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  S.lists.push({ id, name }); return id;
}
function listSelectHtml() {
  const cnt = S.activeList === 'all' ? S.jobs.length : S.jobs.filter((j) => j.listId === S.activeList).length;
  const item = (id, name, n) => `<button type="button" role="menuitemradio" aria-checked="${S.activeList === id}" class="lmi ${S.activeList === id ? 'on' : ''}" data-list="${id}"><span>${S.activeList === id ? '✓ ' : ''}${esc(name)}</span><span class="cnt">${n}</span></button>`;
  return `<div class="listpick"><button type="button" id="listBtn" class="listbtn" aria-haspopup="menu" aria-expanded="false">${esc(listName(S.activeList))} <span class="cnt">${cnt}</span> ▾</button>
    <div id="listMenu" class="listmenu" role="menu" hidden>${S.lists.map((l) => item(l.id, l.name, S.jobs.filter((j) => j.listId === l.id).length)).join('')}${item('all', 'All jobs', S.jobs.length)}
    <hr><button type="button" class="lmi" data-list="__new">＋ New list…</button><button type="button" class="lmi" data-list="__manage">Manage lists…</button></div></div>`;
}
for (const j of S.jobs) { if (j.station && j.stationMi == null && isFinite(j.lat)) { const s = stationById(j.station); if (s) j.stationMi = +miles(j.lat, j.lon, s.lat, s.lon).toFixed(2); } }
const job = (id) => S.jobs.find((j) => j.id === id);

// ---------- rules ----------
function analyze(j) {
  if (!j.start) return [];
  const today = jobToday(j);
  const last = j.end && j.end < addDays(today, -1) ? j.end : addDays(today, -1);
  const dates = j.start <= last ? dayRange(j.start, last) : [];
  const rows = [];
  const wd = workSet(j);
  let pendingFrom = null; // date of the last >= threshold rain not yet followed by a work day
  for (const date of dates) {
    const d = j.days[date] || { missing: true, pending: true };
    const has = d.precip != null && !d.missing;
    const off = !wd.has(new Date(date + 'T12:00:00Z').getUTCDay());
    const over = has && d.precip >= j.threshold - 1e-9; // threshold met, work day or not
    const rain = over && !off;                            // counted rain day only on work days
    // Wet-out goes to the NEXT selected work day after any >= threshold rain (work or off day).
    const wetCand = !off && j.wetOut && !!pendingFrom && !rain;
    const wetFrom = wetCand ? pendingFrom : null;
    const wetStatus = wetCand ? (d.wetOutStatus || 'pending') : null;
    const counted = rain || (wetCand && wetStatus === 'confirmed');
    rows.push({ date, d, has, off, over, rain, wetCand, wetFrom, wetStatus, counted });
    if (over) pendingFrom = date; else if (!off) pendingFrom = null;
  }
  return rows;
}
function workSet(j) { return new Set(Array.isArray(j.workDays) && j.workDays.length ? j.workDays : ALL_DAYS); }
function workLabel(j) { const w = workSet(j); if (w.size === 7) return 'All days'; if (w.size === 5 && [1, 2, 3, 4, 5].every((x) => w.has(x))) return 'Mon-Fri'; return DOW.filter(([n]) => w.has(n)).map(([, t]) => t).join(' '); }
function summarize(j, rows) {
  const s = { days: rows.length, off: 0, offRain: 0, rain: 0, wetConf: 0, wetPend: 0, wetRej: 0, counted: 0, total: 0, missing: 0, rainedOut: 0, partial: 0, months: {} };
  for (const r of rows) {
    const ym = r.date.slice(0, 7);
    const m = (s.months[ym] ||= { ym, total: 0, rain: 0, counted: 0, days: 0, missing: 0 });
    m.days++;
    if (!r.has) { s.missing++; m.missing++; }
    else { s.total += r.d.precip; m.total += r.d.precip; }
    if (r.off) { s.off++; m.off = (m.off || 0) + 1; if (r.over) s.offRain++; }
    if (r.rain) { s.rain++; m.rain++; }
    if (r.wetCand) { if (r.wetStatus === 'confirmed') s.wetConf++; else if (r.wetStatus === 'rejected') s.wetRej++; else s.wetPend++; }
    if (r.counted) { s.counted++; m.counted++; }
    if (r.d.crew === 'rained_out') s.rainedOut++;
    if (r.d.crew === 'partial') s.partial++;
  }
  return s;
}
const fmtIn = (v, txt) => (v == null ? 'M' : txt === 'T' || (v > 0 && v < 0.005) ? 'T' : v.toFixed(2));
const CREW = { worked: 'Worked', partial: 'Partial', rained_out: 'Rained out' };

// ---------- network: IEM ASOS daily + NWS forecast ----------
// IEM answers HTTP 429 to back-to-back requests from one IP, so space calls ~3 s apart and retry 429s with backoff.
let lastIEM = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchIEM(stationId, sts, ets) {
  const net = (stationById(stationId)?.st || 'TX') + '_ASOS';
  const u = `https://mesonet.agron.iastate.edu/cgi-bin/request/daily.py?network=${net}&stations=${encodeURIComponent(stationId)}&sts=${sts}&ets=${ets}&format=csv`;
  let res;
  for (const backoff of [0, 5000, 10000, 20000]) {
    if (backoff) await sleep(backoff);
    const wait = lastIEM + 3200 - Date.now(); if (wait > 0) await sleep(wait);
    lastIEM = Date.now();
    res = await fetch(u, { cache: 'no-store' });
    if (res.status !== 429) break;
  }
  if (!res.ok) throw new Error('IEM HTTP ' + res.status);
  const txt = await res.text();
  const lines = txt.trim().split(/\r?\n/);
  const hdr = lines.shift().split(',');
  const ix = (n) => hdr.indexOf(n);
  const num = (v) => (v == null || v === '' || v === 'None' || v === 'M' ? null : Number(v));
  const out = {};
  for (const ln of lines) {
    const c = ln.split(',');
    const date = c[ix('day')]; if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) continue;
    const p = num(c[ix('precip_in')]);
    const g = num(c[ix('max_wind_gust_kts')]);
    out[date] = {
      precip: p == null ? null : (p > 0 && p < 0.005 ? 0 : Math.round(p * 100) / 100),
      precipText: p == null ? 'M' : (p > 0 && p < 0.005 ? 'T' : null),
      hi: num(c[ix('max_temp_f')]), lo: num(c[ix('min_temp_f')]),
      gust: g == null ? null : Math.round(g * MPH_PER_KT),
    };
  }
  return out;
}
let busy = false, rerun = false;
async function refreshJob(j, { force = false } = {}) {
  if (!j.start) return { added: 0, missing: 0, skipped: true };
  const today = jobToday(j);
  const yest = addDays(today, -1);
  const last = j.end && j.end < yest ? j.end : yest;
  if (j.start > last) return { added: 0, missing: 0, note: 'Job has not started yet.' };
  const st = icao(j.station);
  // Days to (re)fetch: never-fetched, missing, or IEM rows from the last 3 days (IEM may finalize late). Never overwrite NWS CLI rows.
  const need = dayRange(j.start, last).filter((d) => {
    const r = j.days[d];
    if (!r) return true;
    if (r.source && r.source.startsWith('NWS CLI')) return false;
    if (r.station && r.station !== st) return true;
    if (r.missing) return true;
    return force || d >= addDays(last, -2);
  });
  if (!need.length) return { added: 0, missing: 0 };
  const got = await fetchIEM(j.station, need[0], need[need.length - 1]);
  let added = 0, missing = 0;
  const stamp = new Date().toISOString();
  for (const d of need) {
    const prev = j.days[d] || {};
    const keep = { wetOutStatus: prev.wetOutStatus, crew: prev.crew, notes: prev.notes };
    const w = got[d];
    if (w && w.precip != null) {
      j.days[d] = { ...w, station: st, source: IEM_SOURCE + ' (' + st + ')', fetched: stamp, missing: false, ...keep };
      added++;
    } else {
      j.days[d] = { precip: null, precipText: 'M', hi: w?.hi ?? null, lo: w?.lo ?? null, gust: w?.gust ?? null, station: st, source: IEM_SOURCE + ' (' + st + ')', fetched: stamp, missing: true, remarks: w ? 'IEM reported no precip value' : 'No IEM row for this date', ...keep };
      missing++;
    }
  }
  j.lastRefresh = stamp;
  return { added, missing };
}
async function fetchForecast(j) {
  const today = jobToday(j);
  try {
    const p = await (await fetch(`https://api.weather.gov/points/${j.lat.toFixed(4)},${j.lon.toFixed(4)}`, { headers: { Accept: 'application/geo+json' } })).json();
    const fu = p?.properties?.forecast; if (!fu) throw new Error('no forecast url');
    const f = await (await fetch(fu, { headers: { Accept: 'application/geo+json' } })).json();
    const per = (f?.properties?.periods || []).filter((x) => (x.startTime || '').slice(0, 10) === today);
    const use = per.length ? per : (f?.properties?.periods || []).slice(0, 1);
    const pops = use.map((x) => x?.probabilityOfPrecipitation?.value ?? 0);
    j.forecast ||= {};
    j.forecast[today] = { pop: Math.max(0, ...pops), periods: use.map((x) => `${x.name}: ${x.shortForecast}${x.probabilityOfPrecipitation?.value != null ? ' (' + x.probabilityOfPrecipitation.value + '%)' : ''}`).join(' | '), office: p.properties.gridId, fetched: new Date().toISOString(), source: 'NWS api.weather.gov forecast' };
    return j.forecast[today];
  } catch (e) { return null; }
}
async function refreshAll(force = false) {
  if (!navigator.onLine) { toast('Offline - showing saved data.'); return; }
  if (busy) { rerun = true; return; } // a refresh is running: run again when it ends so new/edited jobs are not skipped
  busy = true; setStatus('Updating weather…');
  let msg = [], err = [];
  for (const j of S.jobs) {
    if (!j.start) continue; // no start date: no weather fetch
    try {
      const before = new Set(analyze(j).filter((r) => r.rain).map((r) => r.date));
      const r = await refreshJob(j, { force });
      await fetchForecast(j);
      const fresh = analyze(j).filter((x) => x.rain && !before.has(x.date) && x.date >= addDays(jobToday(j), -3));
      if (fresh.length && N()?.notify) N().notify(`Rain day flagged: ${j.name}`, fresh.map((x) => `${fmtShort(x.date)} ${x.d.precip.toFixed(2)} in`).join(', ') + ` at ${icao(j.station)}`);
      if (r.added || r.missing) msg.push(`${j.name}: ${r.added} day(s) updated${r.missing ? `, ${r.missing} missing` : ''}`);
    } catch (e) { err.push(`${j.name}: ${e.message}`); }
  }
  save(); busy = false;
  S.lastRun = new Date().toISOString(); save();
  setStatus(err.length ? 'Some updates failed: ' + err.join('; ') : msg.length ? msg.join(' · ') : 'Up to date through yesterday.', err.length ? 'err' : 'ok');
  render();
  if (rerun) { rerun = false; refreshAll(force); }
}
let statusMsg = null;
function setStatus(t, kind = 'info') { statusMsg = { t, kind, at: nowChicago() }; const el = $('#status'); if (el) el.outerHTML = statusHtml(); }
function statusHtml() { return statusMsg ? `<div id="status" class="banner ${statusMsg.kind}">${esc(statusMsg.t)} <span class="mute small">(${esc(statusMsg.at)})</span></div>` : '<div id="status"></div>'; }
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 3200); }

// ---------- geocode ----------
async function geocode(addr) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(addr)}`;
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Geocoder HTTP ' + r.status);
  const a = await r.json();
  if (!a.length) throw new Error('Address not found - enter lat/lon by hand.');
  return { lat: +(+a[0].lat).toFixed(6), lon: +(+a[0].lon).toFixed(6), label: a[0].display_name };
}

// ---------- views ----------
const app = document.getElementById('app');
function shell(title, body, back, listPicker) {
  app.innerHTML = `<header class="top">${back ? `<a href="${back}" aria-label="Back" style="font-size:22px;text-decoration:none">‹</a>` : ''}${listPicker ? `<span class="brand">Rain Out</span>${listSelectHtml()}` : `<h1>${esc(title)}</h1>`}
    <button class="ghost" id="btnRefresh" title="Fetch missing days" aria-label="Refresh">↻<span class="rlabel"> Refresh</span></button></header><main>${statusHtml()}${body}</main><div id="print"></div>`;
  $('#btnRefresh').onclick = () => refreshAll(false);
  const lb = $('#listBtn'), lm = $('#listMenu');
  if (lb) lb.onclick = (e) => { e.stopPropagation(); lm.hidden = !lm.hidden; lb.setAttribute('aria-expanded', !lm.hidden); };
  document.onclick = lm ? (e) => { if (!lm.hidden && !lm.contains(e.target)) { lm.hidden = true; lb.setAttribute('aria-expanded', false); } } : null;
  if (lm) lm.querySelectorAll('[data-list]').forEach((b) => (b.onclick = () => pickList(b.dataset.list)));
  function pickList(v) {
    if (v === '__new') { if (!requirePro('addList')) return; const id = newList(prompt('Name for the new list (e.g. Midland, Completed):')); if (id) { S.activeList = id; save(); toast('List created'); } render(); return; }
    if (v === '__manage') { location.hash = '#/lists'; return; }
    S.activeList = v; save(); render();
  }
}
function render() {
  const h = location.hash || '#/';
  const m = h.match(/^#\/(job|edit)\/([^/]+)(?:\/(\w+))?/);
  if (h === '#/new') { if (!gate('addJob').ok) return viewPro('jobs'); return viewEdit(null); }
  if (h.startsWith('#/pro')) return viewPro(h.split('/')[2] || '');
  if (h === '#/lists') return viewLists();
  if (m && m[1] === 'edit') return viewEdit(job(m[2]));
  if (m && m[1] === 'job' && job(m[2])) return viewJob(job(m[2]), m[3] || 'log');
  return viewHome();
}
window.addEventListener('hashchange', render);

function viewLists() {
  const rows = S.lists.map((l) => { const n = S.jobs.filter((j) => j.listId === l.id).length; const def = l.id === S.defaultList;
    return `<div class="card"><label for="ln_${l.id}">List name${def ? ' (default list)' : ''}</label><div class="row"><input id="ln_${l.id}" class="grow" value="${esc(l.name)}" style="flex:1;min-width:150px"><button data-ren="${l.id}">Rename</button></div>
      <div class="row" style="margin-top:8px"><span class="mute small grow">${n} job(s)</span>${def ? '<span class="mute small">The default list can be renamed but not deleted.</span>' : `<button class="danger" data-del="${l.id}">Delete list</button>`}</div></div>`; }).join('');
  shell('Manage lists', `${rows}<div class="card"><label for="nl">New list</label><div class="row"><input id="nl" placeholder="e.g. Completed" style="flex:1;min-width:150px"><button class="primary" id="addl">Add list</button></div></div>
    <p class="mute small">Deleting a list never deletes jobs: they move to the default list (${esc(listName(S.defaultList))}).</p>`, '#/');
  app.querySelectorAll('[data-ren]').forEach((b) => (b.onclick = () => { const l = S.lists.find((x) => x.id === b.dataset.ren); const v = $('#ln_' + l.id).value.trim(); if (!v) return alert('Enter a name.'); l.name = v; save(); toast('Renamed'); render(); }));
  app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const l = S.lists.find((x) => x.id === b.dataset.del), n = S.jobs.filter((j) => j.listId === l.id).length;
    if (!confirm(`Delete the list "${l.name}"?${n ? ` Its ${n} job(s) will move to "${listName(S.defaultList)}". No jobs are deleted.` : ''}`)) return;
    for (const j of S.jobs) if (j.listId === l.id) j.listId = S.defaultList;
    S.lists = S.lists.filter((x) => x.id !== l.id); if (S.activeList === l.id) S.activeList = S.defaultList; save(); toast('List deleted'); render();
  }));
  $('#addl').onclick = () => { if (!requirePro('addList')) return; const id = newList($('#nl').value); if (id) { save(); toast('List added'); render(); } };
}
function exportListCSV() {
  const jobs = jobsInView().filter((j) => j.start); if (!jobs.length) return alert('No jobs with a start date in this list.');
  const rows = jobs.flatMap((j) => exportRows(j).map((r) => ({ Job: j.name, 'Job number': j.number || '', List: listName(j.listId), ...r })));
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const q = (v) => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  download(`${listName(S.activeList).replace(/[^\w.-]+/g, '_')}_rain_logs_${chicagoToday()}.csv`, new Blob([[cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n')], { type: 'text/csv' }));
}
function exportListXLSX() {
  const XLSX = window.XLSX; if (!XLSX) return alert('Excel library not loaded.');
  const jobs = jobsInView().filter((j) => j.start); if (!jobs.length) return alert('No jobs with a start date in this list.');
  const wb = XLSX.utils.book_new(), used = new Set();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobsInView().map((j) => { const s = summarize(j, analyze(j)); return { Job: j.name, 'Job number': j.number || '', List: listName(j.listId), Station: icao(j.station), 'NTP / start': j.start || '', Completion: j.end || '', 'Work days': workLabel(j), 'Counted weather days': j.start ? s.counted : '', 'Rain days': j.start ? s.rain : '', 'Wet-out confirmed': j.start ? s.wetConf : '', 'Wet-out to confirm': j.start ? s.wetPend : '', 'Total rain (in)': j.start ? +s.total.toFixed(2) : '', 'Missing days': j.start ? s.missing : '' }; })), 'Summary');
  for (const j of jobs) { let n = (j.number || j.name).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 28); while (used.has(n)) n = n.slice(0, 25) + '_' + used.size; used.add(n);
    const ws = XLSX.utils.aoa_to_sheet(headerLines(j)); XLSX.utils.sheet_add_json(ws, exportRows(j), { origin: 'A8' }); XLSX.utils.book_append_sheet(wb, ws, n); }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(`${listName(S.activeList).replace(/[^\w.-]+/g, '_')}_rain_logs_${chicagoToday()}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
function viewHome() {
  const today = chicagoToday();
  const inView = jobsInView();
  const sums = inView.filter((j) => j.start).map((j) => summarize(j, analyze(j)));
  const tot = sums.reduce((a, s) => ({ counted: a.counted + s.counted, pend: a.pend + s.wetPend, rain: a.rain + s.total }), { counted: 0, pend: 0, rain: 0 });
  const listCard = `<div class="card"><div class="row"><h2 class="grow" style="margin:0">${esc(listName(S.activeList))}</h2><span class="mute small">${inView.length} job(s)</span></div>
    <div class="stats"><div class="stat"><b>${inView.length - sums.length}</b><span>Need a start date</span></div><div class="stat"><b>${tot.counted}</b><span>Counted weather days (all jobs)</span></div>
    <div class="stat"><b>${tot.pend}</b><span>Wet-outs to confirm</span></div></div>
    <div class="row"><button id="lcsv">Export list CSV</button><button id="lxlsx">Export list Excel</button></div></div>`;
  const list = inView.map((j) => {
    const rows = analyze(j), s = summarize(j, rows), f = j.forecast?.[jobToday(j)];
    const lastDay = [...rows].reverse().find((r) => r.has);
    const noStart = !j.start;
    return `<div class="card"><a class="job" href="#/job/${j.id}"><h2>${esc(j.name)}</h2>${j.approx ? `<span class="pill appx">${j.locNote && j.locNote.startsWith('LOCATION UNKNOWN') ? 'Location unknown - add address' : 'Approximate - confirm address'}</span>` : ''}
      <div class="mute small">${esc(j.address)} · ${esc(icao(j.station))} ${j.stationMi != null ? j.stationMi.toFixed(2) + ' mi' : ''}</div>
      <div class="mute small">${j.start || j.end ? `NTP ${fmtShort(j.start)} → ${fmtShort(j.end)}` : 'Dates not set'} · rule ≥ ${j.threshold.toFixed(2)} in${j.wetOut ? ' + wet-out next day' : ''}</div>
      ${noStart ? '<div class="banner warn" style="margin:8px 0 0">Add start date to begin tracking</div></a></div>' : ''}${noStart ? '' : `<div class="stats"><div class="stat"><b>${s.counted}</b><span>Counted weather days</span></div>
      <div class="stat"><b>${s.total.toFixed(2)}″</b><span>Rain to date</span></div>
      <div class="stat"><b>${s.wetPend}</b><span>Wet-out to confirm</span></div>
      <div class="stat"><b>${f ? f.pop + '%' : '—'}</b><span>Today's rain chance</span></div></div>
      <div class="mute small">Last day: ${lastDay ? fmtShort(lastDay.date) + ' ' + fmtIn(lastDay.d.precip, lastDay.d.precipText) + ' in' : 'none'}${s.missing ? ` · <b>${s.missing} missing</b>` : ''}</div></a></div>`}`;
  }).join('');
  const empty = S.jobs.length ? `<div class="card"><h2>No jobs in ${esc(listName(S.activeList))}</h2><p class="mute">Add a job here, or move one in from Edit job › List.</p></div>` : CONFIG.STORE ? `<div class="card"><h2>No jobs yet</h2><p>Add your first job to start logging rain days, or load a sample job to see how it works.</p><button id="sample">Load sample job</button></div>` : '<div class="card">No jobs yet.</div>';
  shell('Rain Out', `${listCard}${list || empty}
    <div class="row"><a class="btn primary grow" href="#/new">＋ Add job</a></div>
    <div class="row" style="margin-top:8px"><a class="btn grow" href="#/lists">Manage lists</a></div>
    <div class="card" style="margin-top:12px"><h2>Backup</h2><p class="mute small">Jobs are saved only in this browser on this device. Export a backup now and then.</p>
      <div class="row"><button id="bk">Download backup (JSON)</button><label class="btn" style="margin:0;font-weight:400">Restore backup<input type="file" id="rs" accept="application/json,.json" hidden></label></div></div>
    ${CONFIG.STORE ? `<div class="card pro-card"><div class="row"><div class="grow"><b>${proOn() ? 'Rain Out Pro is active' : 'Rain Out Free'}</b><div class="mute small">${proOn() ? 'Unlimited jobs and project lists.' : `${Math.min(countedJobs(S.jobs), FREE_JOBS)} of ${FREE_JOBS} free jobs used (the sample job doesn’t count).`}</div></div><a class="btn${proOn() ? '' : ' primary'}" href="#/pro" id="proBtn">${proOn() ? 'Manage' : 'Get Pro'}</a></div></div>` : ''}
    ${CONFIG.STORE ? '<p class="small"><a href="privacy.html">Privacy policy</a> · <a href="support.html">Support</a> · <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Terms of Use (EULA)</a></p>' : ''}<p class="mute small">Backups include all lists and jobs. Weather: Iowa Environmental Mesonet ASOS daily summaries (may differ slightly from official NWS CLI).${SEED_JOB ? " Seed job history (Sep 1-Nov 16) is NWS CLI KIAH." : ""} Forecast: api.weather.gov. Normals: NCEI 1991-2020. v${VERSION}</p>`, null, true);
  $('#lcsv').onclick = () => requirePro('listExport') && exportListCSV(); $('#lxlsx').onclick = () => requirePro('listExport') && exportListXLSX();
  if ($('#sample')) $('#sample').onclick = () => { S.jobs.push({ ...sampleJob(), listId: S.activeList !== 'all' ? S.activeList : S.defaultList }); save(); refreshAll(false); };
  $('#bk').onclick = () => download(`rain-out-backup-${chicagoToday()}.json`, new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
  $('#rs').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.jobs)) throw new Error('Not a Rain Out backup');
      if (!confirm(`Replace all data on this device with backup (${d.jobs.length} job(s))?`)) return; S = d; migrate(); save(); toast('Backup restored'); render();
    } catch (err) { alert('Restore failed: ' + err.message); }
  };
}

function viewPro(reason) {
  if (!CONFIG.STORE) { location.hash = '#/'; return; }
  const iap = N()?.iap, on = proOn();
  const ents = (proState.ents || []).filter((e) => PRO_IDS.includes(e.productId));
  const prod = (id) => proProducts?.find((p) => p.id === id);
  const plan = (id, tag) => { const p = prod(id); return p ? `<button class="plan${id === PRO.yearly ? ' primary' : ''}" data-buy="${esc(id)}" ${proBusy || on ? 'disabled' : ''}><b>${esc(p.displayName || (id === PRO.yearly ? 'Yearly' : 'Monthly'))}</b><span>${esc(p.displayPrice)} / ${esc(periodLabel(p.period))}${tag ? ` · ${tag}` : ''}</span></button>` : ''; };
  const y = prod(PRO.yearly), m = prod(PRO.monthly);
  const save = y && m && y.price > 0 && m.price > 0 ? Math.round((1 - y.price / (m.price * 12)) * 100) : 0;
  const status = on ? `<div class="banner ok">Rain Out Pro is active${ents[0] ? ` (${ents[0].productId === PRO.yearly ? 'yearly' : 'monthly'}${ents[0].expires ? `, renews or ends ${new Date(ents[0].expires).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''})` : ''}. Thank you!</div>` : '';
  const plans = !iap ? '<p class="mute">Purchases are available in the Rain Out iPhone app.</p>'
    : proProducts === null ? '<p class="mute" id="plmsg">Loading prices from the App Store…</p>'
    : (y || m) ? `<div class="plans">${plan(PRO.yearly, save > 0 ? `save ${save}%` : '')}${plan(PRO.monthly)}</div>` : '<p class="mute">Prices are not available right now. Check your internet connection and try again.</p>';
  shell('Rain Out Pro', `${status}<div class="card paywall">
    <h2>Rain Out Pro</h2>${reason && REASON_TEXT[reason] && !on ? `<p>${esc(REASON_TEXT[reason])}</p>` : ''}
    <ul class="incl"><li><b>Unlimited jobs</b> (free: ${FREE_JOBS})</li><li><b>Unlimited project lists</b> with the list menu (free: ${FREE_LISTS})</li><li><b>Export a whole list</b> to CSV or Excel at once</li></ul>
    <p class="mute small">Free always includes full daily rain logs, wet-out tracking, work days, maps, summaries, and CSV / Excel / PDF exports for each job. If a subscription ends, nothing is deleted or locked: every job stays viewable, editable, and exportable; you just can't add more than the free limit.</p>
    ${plans}
    <p class="small legal">Rain Out Pro is an auto-renewable subscription${y ? `: ${esc(y.displayPrice)} per year` : ''}${m ? `${y ? ' or' : ':'} ${esc(m.displayPrice)} per month` : ''}. Payment is charged to your Apple Account when you confirm the purchase. The subscription renews automatically for the same period and price unless it is canceled at least 24 hours before the end of the current period; your account is charged for the renewal within 24 hours before the current period ends. You can manage or cancel it any time in Settings › your name › Subscriptions.</p>
    <div class="row">${iap ? `<button id="restore" ${proBusy ? 'disabled' : ''}>Restore Purchases</button>` : ''}${iap && on ? '<button id="manage">Manage subscription</button>' : ''}</div>
    <p class="small"><a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Terms of Use (EULA)</a> · <a href="privacy.html">Privacy Policy</a></p>
  </div>`, '#/');
  if (!iap) return;
  if (proProducts === null) iap.products(PRO_IDS).then((p) => { proProducts = p || []; if ((location.hash || '').startsWith('#/pro')) render(); }).catch(() => { proProducts = []; if ((location.hash || '').startsWith('#/pro')) render(); });
  const busy = async (fn) => { proBusy = true; render(); try { await fn(); } catch (e) { alert(String(e?.message || e)); } finally { proBusy = false; render(); } };
  app.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => busy(async () => {
    const r = await iap.purchase(b.dataset.buy);
    if (r?.entitlements) setEnts(r.entitlements);
    if (r?.status === 'purchased' && proOn()) { toast('Rain Out Pro is active'); N()?.tap?.(); }
    else if (r?.status === 'pending') toast('Purchase pending approval');
  })));
  $('#restore') && ($('#restore').onclick = () => busy(async () => { setEnts(await iap.restore()); toast(proOn() ? 'Purchases restored. Rain Out Pro is active.' : 'No active Rain Out Pro subscription was found for this Apple Account.'); }));
  $('#manage') && ($('#manage').onclick = () => iap.manage().catch((e) => alert(String(e?.message || e))));
}
function viewEdit(j) {
  const isNew = !j;
  const v = j || { name: '', number: '', address: '', lat: '', lon: '', start: '', end: '', threshold: 0.5, wetOut: true, station: '', stationAuto: true, notes: '' };
  shell(isNew ? 'Add job' : 'Edit job', `<form class="card" id="f" autocomplete="off">
    <label for="name">Job name</label><input id="name" required value="${esc(v.name)}" placeholder="e.g. Riverside Phase 2">
    <label for="number">Job number</label><input id="number" value="${esc(v.number)}">
    <label for="listId">List</label><select id="listId">${S.lists.map((l) => `<option value="${l.id}" ${(v.listId || (S.activeList !== 'all' ? S.activeList : S.defaultList)) === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}<option value="__new">＋ New list…</option></select>
    <label for="address">Jobsite address</label><input id="address" value="${esc(v.address)}" placeholder="Street, City, ST ZIP">
    <div class="row" style="margin-top:8px"><button type="button" id="geo">Find lat/lon from address</button><span id="geomsg" class="mute small"></span></div>
    <div class="grid2"><div><label for="lat">Latitude</label><input id="lat" inputmode="decimal" value="${esc(v.lat)}" placeholder="29.9303"></div>
    <div><label for="lon">Longitude</label><input id="lon" inputmode="decimal" value="${esc(v.lon)}" placeholder="-95.3486"></div></div>
    ${v.locNote ? `<div class="banner warn" style="margin-top:8px">${esc(v.locNote)}</div>` : ''}
    <label>Map: search, tap to pin, or draw the site area</label><div id="picker"><button type="button" id="openmap">Show map</button> <span class="mute small">(needs internet)</span></div>
    <label for="station">Weather station (ASOS)</label><select id="station"></select>
    <div class="mute small" id="stmsg">Enter lat/lon to pick the nearest station.</div>
    <div class="grid2"><div><label for="start">NTP / start date</label><input id="start" type="date" value="${esc(v.start)}"></div>
    <div><label for="end">Substantial / final completion</label><input id="end" type="date" value="${esc(v.end)}"></div></div>
    <div class="mute small">Leave dates blank if unknown; weather tracking starts once a start date is entered.</div>
    <label for="threshold">Rain day threshold (inches)</label><input id="threshold" type="number" step="0.01" min="0.01" value="${esc(v.threshold)}">
    <label>Work days</label>
    <div class="dows" id="dows">${DOW.map(([n, t]) => `<button type="button" class="dow ${workSet(v).has(n) ? 'on' : ''}" data-dow="${n}" aria-pressed="${workSet(v).has(n)}">${t}</button>`).join('')}</div>
    <div class="row" style="margin-top:6px"><button type="button" id="dowWk">Mon-Fri</button><button type="button" id="dowAll">All days</button><span class="mute small">Off days stay in the log but never count; wet-out moves to the next work day.</span></div>
    <label style="font-weight:400"><input type="checkbox" id="wetOut" ${v.wetOut ? 'checked' : ''}>Count the next day if it's wet out (flag for confirmation)</label>
    <label for="notes">Job notes</label><textarea id="notes">${esc(v.notes || '')}</textarea>
    <div class="row" style="margin-top:12px"><button class="primary grow" type="submit">${isNew ? 'Add job & load weather' : 'Save'}</button><a class="btn" href="${isNew ? '#/' : '#/job/' + j.id}">Cancel</a></div>
    ${isNew ? '' : '<div class="row" style="margin-top:16px"><button type="button" class="danger" id="del">Delete job</button></div>'}
  </form>`, isNew ? '#/' : '#/job/' + j.id);
  const sel = $('#station');
  let auto = v.stationAuto !== false;
  function fillStations() {
    const lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
    if (!isFinite(lat) || !isFinite(lon)) { sel.innerHTML = ST.map((s) => `<option value="${s.id}">${s.st} · ${icao(s.id)} - ${esc(s.name)}</option>`).join(''); if (v.station) sel.value = v.station; return; }
    const near = nearest(lat, lon, 10);
    const tag = (s) => (s.precip ? '' : ' - no rain gauge data');
    const cur = sel.value || v.station;
    sel.innerHTML = `<optgroup label="Nearest with rain data">${near.map((s) => `<option value="${s.id}">${icao(s.id)} - ${esc(s.name)} (${s.mi.toFixed(2)} mi)</option>`).join('')}</optgroup>
      <optgroup label="More stations (nearest 60)">${nearest(lat, lon, 60, true).map((s) => `<option value="${s.id}">${icao(s.id)} - ${esc(s.name)}, ${s.st} (${s.mi.toFixed(1)} mi)${tag(s)}</option>`).join('')}</optgroup>`;
    if (cur && !sel.querySelector(`option[value="${cur}"]`) && stationById(cur)) { const s = stationById(cur); sel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${icao(s.id)} - ${esc(s.name)}, ${s.st} (${miles(lat, lon, s.lat, s.lon).toFixed(1)} mi)</option>`); }
    sel.value = auto || !cur ? near[0].id : cur;
    const far = near[0].mi > 30 ? ` Note: the nearest station with rain data is ${near[0].mi.toFixed(0)} mi away, so site rainfall may differ.` : '';
    $('#stmsg').textContent = (auto ? `Auto: nearest is ${icao(near[0].id)}, ${near[0].mi.toFixed(2)} mi. Pick another to override.` : 'Station set by you.') + far;
  }
  fillStations();
  const setDows = (list) => app.querySelectorAll('.dow').forEach((b) => { const on = list.includes(+b.dataset.dow); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  app.querySelectorAll('.dow').forEach((b) => (b.onclick = () => { b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); N()?.tap?.(); }));
  $('#dowWk').onclick = () => setDows([1, 2, 3, 4, 5]);
  $('#dowAll').onclick = () => setDows(ALL_DAYS);
  let area = v.area || null, picker = null;
  async function openMap() {
    const box = $('#picker'); box.innerHTML = '<div class="mute small">Loading map…</div>';
    try {
      picker = await (await import('./map.js')).mountPicker(box, { lat: parseFloat($('#lat').value), lon: parseFloat($('#lon').value), area, query: $('#address').value }, (r) => {
        $('#lat').value = r.lat; $('#lon').value = r.lon; area = r.area; if (j && j.approx) { j.approx = false; }
        locConfirmed = true; fillStations();
      });
    } catch (e) { box.innerHTML = `<div class="banner err">Map unavailable (${esc(e.message)}). Type lat/lon instead.</div>`; }
  }
  let locConfirmed = false;
  $('#openmap').onclick = openMap;
  if (navigator.onLine && (v.area || isFinite(parseFloat(v.lat)))) openMap();
  sel.onchange = () => { auto = false; fillStations(); };
  $('#lat').oninput = $('#lon').oninput = fillStations;
  $('#geo').onclick = async () => {
    const a = $('#address').value.trim(); if (!a) return;
    $('#geomsg').textContent = 'Looking up…';
    try { const g = await geocode(a); $('#lat').value = g.lat; $('#lon').value = g.lon; $('#geomsg').textContent = 'Found: ' + g.label; auto = true; locConfirmed = true; fillStations(); picker?.setView(g.lat, g.lon); }
    catch (e) { $('#geomsg').textContent = e.message + ' (Type lat/lon by hand.)'; }
  };
  if (!isNew) $('#del').onclick = () => { if (confirm(`Delete ${j.name} and its whole log from this device?`)) { S.jobs = S.jobs.filter((x) => x.id !== j.id); (S.presetsSeen ||= []).includes(j.id) || S.presetsSeen.push(j.id); save(); location.hash = '#/'; } };
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return alert('Enter a valid latitude and longitude (use "Find lat/lon" or type them).');
    const start = $('#start').value, end = $('#end').value;
    if (start && end && end < start) return alert('Completion date must be on or after the start date.');
    const thr = parseFloat($('#threshold').value); if (!(thr > 0)) return alert('Threshold must be more than 0.');
    const sid = sel.value, s = stationById(sid);
    const workDays = [...app.querySelectorAll('.dow.on')].map((b) => +b.dataset.dow).sort();
    if (!workDays.length) return alert('Pick at least one work day.');
    let listId = $('#listId').value;
    if (listId === '__new') { if (!gate('addList').ok) { location.hash = '#/pro/lists'; return; } listId = newList(prompt('Name for the new list:')) || S.defaultList; }
    if (isNew && !gate('addJob').ok) { location.hash = '#/pro/jobs'; return; }
    const data = { listId, workDays, name: $('#name').value.trim(), number: $('#number').value.trim(), address: $('#address').value.trim(), lat, lon, start, end, threshold: thr, wetOut: $('#wetOut').checked,
      station: sid, stationMi: +miles(lat, lon, s.lat, s.lon).toFixed(2), stationAuto: auto, notes: $('#notes').value, area: area || null };
    const moved = j && (Math.abs(j.lat - lat) > 1e-6 || Math.abs(j.lon - lon) > 1e-6);
    if (locConfirmed || moved) { data.approx = false; data.locNote = ''; }
    let t;
    if (isNew) { t = { id: uid(), ...data, days: {}, forecast: {}, created: new Date().toISOString() }; S.jobs.push(t); }
    else { t = j; if (t.station !== sid) { for (const [d, r] of Object.entries(t.days)) if (!(r.source || '').startsWith('NWS CLI') && !r.crew && !r.notes && !r.wetOutStatus) delete t.days[d]; } Object.assign(t, data); }
    save(); location.hash = '#/job/' + t.id;
    await refreshAll(false);
  };
}

function viewJob(j, tab) {
  const rows = analyze(j), s = summarize(j, rows), today = jobToday(j), f = j.forecast?.[today];
  const filt = sessionStorage.getItem('rdt.filter') || 'flagged';
  const tabs = ['log', 'summary', 'export'].map((t) => `<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${{ log: 'Daily log', summary: 'Summary', export: 'Export' }[t]}</button>`).join('');
  let body = `<div class="card"><div class="mute small">${esc(j.number ? j.number + ' · ' : '')}${esc(j.address)}</div>
    <div class="mute small">Station ${esc(icao(j.station))} ${esc(stationById(j.station)?.name || '')}, ${j.stationMi?.toFixed(2)} mi${j.stationAuto ? ' (nearest)' : ' (chosen)'} · NTP ${fmtShort(j.start)} → ${fmtShort(j.end)} · ≥ ${j.threshold.toFixed(2)} in${j.wetOut ? ' + wet-out' : ''} · Work days: ${workLabel(j)} · Days in ${esc(jobTZ(j))} time</div>
    <div class="stats"><div class="stat"><b>${s.counted}</b><span>Counted weather days</span></div><div class="stat"><b>${s.rain}</b><span>Days ≥ ${j.threshold.toFixed(2)} in</span></div>
    <div class="stat"><b>${s.wetConf}/${s.wetConf + s.wetPend + s.wetRej}</b><span>Wet-out confirmed</span></div><div class="stat"><b>${s.total.toFixed(2)}″</b><span>Total rain</span></div></div>
    <div class="small">Today (${fmtShort(today)}): ${f ? `<b>${f.pop}% chance of rain</b> <span class="mute">- ${esc(f.periods)} (NWS ${esc(f.office)})</span>` : '<span class="mute">forecast not loaded</span>'}</div>
    ${j.approx ? `<div class="banner warn" style="margin-top:8px">${esc(j.locNote || 'Approximate - confirm address')}</div>` : ''}
    <div class="row" style="margin-top:8px"><a class="btn" href="#/edit/${j.id}">Edit job</a>${navigator.onLine ? '<button id="showmap">Show map</button>' : ''}</div><div id="jobmap"></div></div>
    ${j.start ? `<div class="tabs">${tabs}</div>` : `<div class="card"><div class="banner warn" style="margin:0">Add start date to begin tracking</div><p class="mute small">No weather is fetched for this job until it has an NTP / start date. <a href="#/edit/${j.id}">Edit job</a></p></div>`}`;
  if (!j.start) { /* no log until a start date exists */ }
  else if (tab === 'log') {
    const show = rows.filter((r) => filt === 'all' || r.rain || r.over || r.wetCand || !r.has || r.d.crew || r.d.notes).reverse();
    body += `<div class="filters"><button data-f="flagged" class="${filt === 'flagged' ? 'on' : ''}">Flagged days</button><button data-f="all" class="${filt === 'all' ? 'on' : ''}">All ${rows.length} days</button></div>`;
    body += show.length ? show.map((r) => dayCard(j, r)).join('') : '<div class="card mute">No flagged days yet.</div>';
  } else if (tab === 'summary') {
    const N = NORMALS[j.station];
    const mrows = Object.values(s.months).map((m) => {
      const mi = +m.ym.slice(5) - 1, n = N?.m[mi];
      const full = new Date(Date.UTC(+m.ym.slice(0, 4), mi + 1, 0)).getUTCDate();
      return `<tr><td>${monthName(m.ym)}${m.days < full ? ` <span class="mute small">(${m.days} of ${full} d)</span>` : ''}</td><td class="n">${m.total.toFixed(2)}</td><td class="n">${n ? n[0].toFixed(2) : '—'}</td><td class="n">${m.rain}</td><td class="n">${n ? n[1].toFixed(1) : '—'}</td><td class="n">${m.counted}</td><td class="n">${m.off || ''}</td><td class="n">${m.missing || ''}</td></tr>`;
    }).join('');
    body += `<div class="card"><h2>Weather days</h2><table><tbody>
      <tr><td>Days logged (NTP → yesterday)</td><td class="n">${s.days}</td></tr>
      <tr><td>Off days (${esc(workLabel(j))} schedule)</td><td class="n">${s.off}</td></tr>
      <tr><td>Off days with ≥ ${j.threshold.toFixed(2)} in (not counted)</td><td class="n">${s.offRain}</td></tr>
      <tr><td>Rain days ≥ ${j.threshold.toFixed(2)} in</td><td class="n">${s.rain}</td></tr>
      <tr><td>Wet-out days confirmed</td><td class="n">${s.wetConf}</td></tr>
      <tr><td>Wet-out days to confirm</td><td class="n">${s.wetPend}</td></tr>
      <tr><td>Wet-out days rejected</td><td class="n">${s.wetRej}</td></tr>
      <tr><th>Counted weather days</th><th class="n">${s.counted}</th></tr>
      <tr><td>Crew rained out / partial (logged)</td><td class="n">${s.rainedOut} / ${s.partial}</td></tr>
      <tr><td>Total rain</td><td class="n">${s.total.toFixed(2)} in</td></tr>
      <tr><td>Missing days (no data)</td><td class="n">${s.missing}</td></tr></tbody></table></div>
      <div class="card"><h2>By month vs normal</h2><div style="overflow-x:auto"><table><thead><tr><th>Month</th><th class="n">Rain in</th><th class="n">Normal in</th><th class="n">Days ≥ ${j.threshold.toFixed(2)}</th><th class="n">Normal days ≥ 0.50</th><th class="n">Counted</th><th class="n">Off days</th><th class="n">Missing</th></tr></thead><tbody>${mrows}</tbody></table></div>
      <p class="mute small">${N ? `Normals: NCEI 1991-2020 monthly normals, ${esc(N.ncei)} (${esc(icao(j.station))}); normal days count ≥ 0.50 in regardless of your threshold. Partial months are compared to full-month normals.` : 'No NCEI 1991-2020 normals are available for this station, so the normal columns are left blank (never estimated).'}</p></div>`;
  } else {
    body += `<div class="card"><h2>Export ${esc(j.name)}</h2><p class="mute small">Weather days list each date with amount, source, station, wet-out status, crew status, and notes.</p>
      <div class="row"><button id="xcsv">CSV</button><button id="xxlsx">Excel (.xlsx)</button><button id="xpdf">PDF</button><button id="xprint">Print view</button></div></div>`;
  }
  shell(j.name, body, '#/');
  if ($('#showmap')) $('#showmap').onclick = async () => { const el = $('#jobmap'); el.className = 'jobmap'; $('#showmap').remove(); try { await (await import('./map.js')).mountView(el, j); } catch (e) { el.className = ''; el.innerHTML = '<div class="banner err">Map unavailable.</div>'; } };
  app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => (location.hash = `#/job/${j.id}/${b.dataset.tab}`)));
  app.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { sessionStorage.setItem('rdt.filter', b.dataset.f); render(); }));
  app.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const d = (j.days[b.dataset.date] ||= { missing: true });
    const [k, val] = b.dataset.act.split(':');
    d[k] = d[k] === val ? null : val; save(); N()?.tap?.(); render();
  }));
  app.querySelectorAll('input[data-note]').forEach((i) => (i.onchange = () => { (j.days[i.dataset.note] ||= { missing: true }).notes = i.value; save(); toast('Note saved'); }));
  if (tab === 'export') {
    $('#xcsv').onclick = () => exportCSV(j); $('#xxlsx').onclick = () => exportXLSX(j); $('#xpdf').onclick = () => exportPDF(j); $('#xprint').onclick = () => printView(j);
  }
}
function dayCard(j, r) {
  const d = r.d;
  const cls = (r.off ? 'off ' : '') + (!r.has ? 'missing' : r.rain ? 'rain' : r.wetCand ? 'wet ' + (r.wetStatus || '') : '');
  const pills = [];
  if (r.off) pills.push(`<span class="pill offd">Off day</span>`);
  if (r.off && r.over) pills.push(`<span class="pill">≥ ${j.threshold.toFixed(2)} on off day - not counted</span>`);
  if (!r.has) pills.push(`<span class="pill miss">MISSING${d.pending ? ' - not fetched yet' : ''}</span>`);
  if (r.rain) pills.push(`<span class="pill rain">RAIN DAY ≥ ${j.threshold.toFixed(2)}</span>`);
  if (r.wetCand) pills.push(r.wetStatus === 'confirmed' ? '<span class="pill rain">WET-OUT CONFIRMED</span>' : r.wetStatus === 'rejected' ? '<span class="pill bad">wet-out rejected</span>' : '<span class="pill wet">POSSIBLE WET-OUT - CONFIRM</span>');
  if (r.wetCand && r.wetFrom) pills.push(`<span class="mute small">after rain ${fmtShort(r.wetFrom)}</span>`);
  if (d.crew) pills.push(`<span class="pill ${d.crew === 'worked' ? 'ok' : 'bad'}">${CREW[d.crew]}</span>`);
  const crewBtns = Object.entries(CREW).map(([k, t]) => `<button data-act="crew:${k}" data-date="${r.date}" class="${d.crew === k ? 'sel' : ''}">${t}</button>`).join('');
  const wetBtns = r.wetCand ? `<button data-act="wetOutStatus:confirmed" data-date="${r.date}" class="${r.wetStatus === 'confirmed' ? 'sel' : ''}">Wet-out ✓</button><button data-act="wetOutStatus:rejected" data-date="${r.date}" class="${r.wetStatus === 'rejected' ? 'sel' : ''}">Not wet-out ✗</button>` : '';
  const wx = r.has || d.hi != null ? `<span class="mute small">Hi ${d.hi ?? 'M'}° / Lo ${d.lo ?? 'M'}° · gust ${d.gust ?? 'M'} mph</span>` : '';
  return `<div class="day ${cls}"><div class="top"><span class="date">${fmtShort(r.date)}</span><span class="amt">${r.has ? fmtIn(d.precip, d.precipText) + ' in' : 'M'}</span>${pills.join(' ')}</div>
    <div>${wx} <span class="mute small">· ${esc(d.source || 'no data yet')}${d.remarks ? ' · ' + esc(d.remarks) : ''}</span></div>
    <div class="ctl">${wetBtns}${r.off ? '' : crewBtns}<input data-note="${r.date}" placeholder="Notes" value="${esc(d.notes || '')}"></div></div>`;
}

// ---------- exports ----------
function exportRows(j) {
  return analyze(j).map((r) => ({
    Date: r.date, Day: wkday(r.date), 'Off day': r.off ? 'OFF' : '', 'Rain (in)': r.has ? fmtIn(r.d.precip, r.d.precipText) : 'M', 'Hi F': r.d.hi ?? 'M', 'Lo F': r.d.lo ?? 'M', 'Peak gust mph': r.d.gust ?? 'M',
    [`Rain day >= ${j.threshold.toFixed(2)} in`]: r.rain ? 'YES' : '', 'Wet-out': r.wetCand ? r.wetStatus : '', 'Counted weather day': r.counted ? 'YES' : '',
    Crew: CREW[r.d.crew] || '', Notes: r.d.notes || '', Station: r.d.station || icao(j.station), Source: r.has || r.d.source ? r.d.source || '' : 'MISSING - not fetched', Remarks: [r.off && r.over ? `>= ${j.threshold.toFixed(2)} in on off day (not counted)` : '', r.wetFrom ? 'Wet-out after rain ' + r.wetFrom : '', r.d.remarks || (r.has ? '' : 'Missing - no data; not estimated')].filter(Boolean).join('; '),
  }));
}
const fileBase = (j) => (j.number || j.name).replace(/[^\w.-]+/g, '_') + '_rain_log_' + chicagoToday();
function download(name, blob) { if (N()?.shareFile) return N().shareFile(name, blob); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function exportCSV(j) {
  const rows = exportRows(j), cols = Object.keys(rows[0] || { Date: '' });
  const q = (v) => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  download(fileBase(j) + '.csv', new Blob([[cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n')], { type: 'text/csv' }));
}
function headerLines(j) {
  const s = summarize(j, analyze(j));
  return [[`${j.name}${j.number ? ' (' + j.number + ')' : ''}`], [j.address], [`Station: ${icao(j.station)} ${stationById(j.station)?.name || ''} (${stationById(j.station)?.st || ''}_ASOS), ${j.stationMi?.toFixed(2)} mi from site; calendar days in ${jobTZ(j)} local time`],
    [`NTP ${j.start} - completion ${j.end}; rule: >= ${j.threshold.toFixed(2)} in${j.wetOut ? ' plus next work day if wet out (confirmed)' : ''}; work days: ${workLabel(j)} (off days shown, never counted)`],
    [`Counted weather days: ${s.counted} (rain days ${s.rain}, wet-out confirmed ${s.wetConf}, pending ${s.wetPend}); total rain ${s.total.toFixed(2)} in; missing days ${s.missing}`],
    [`Generated ${nowChicago()} by Rain Out. Sources: NWS CLI (official daily climate report) where labeled; otherwise IEM ASOS daily summary (may differ slightly from NWS CLI). Missing days are not estimated.`]];
}
function exportXLSX(j) {
  const XLSX = window.XLSX; if (!XLSX) return alert('Excel library not loaded.');
  const rows = exportRows(j), wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(headerLines(j)); XLSX.utils.sheet_add_json(ws, rows, { origin: 'A8' });
  ws['!cols'] = [12, 6, 6, 9, 6, 6, 9, 12, 11, 10, 11, 30, 8, 30, 30].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Daily log');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.filter((r) => r['Counted weather day'] || r['Wet-out'])), 'Weather days');
  const s = summarize(j, analyze(j)), N = NORMALS[j.station];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(s.months).map((m) => { const n = N?.m[+m.ym.slice(5) - 1]; return { Month: m.ym, 'Days logged': m.days, 'Rain (in)': +m.total.toFixed(2), 'Normal (in)': n ? n[0] : '', [`Days >= ${j.threshold}`]: m.rain, 'Normal days >= 0.50': n ? n[1] : '', Counted: m.counted, 'Off days': m.off || 0, Missing: m.missing, 'Normals source': N ? 'NCEI 1991-2020 ' + N.ncei : '' }; })), 'Monthly');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(fileBase(j) + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
function weatherDays(j) { return exportRows(j).filter((r) => r['Counted weather day'] || r['Wet-out'] || (r['Off day'] && /off day/.test(r.Remarks)) || r.Crew === 'Rained out' || r.Crew === 'Partial' || r['Rain (in)'] === 'M'); }
function exportPDF(j) {
  const J = window.jspdf; if (!J) return alert('PDF library not loaded.');
  const doc = new J.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  doc.setFontSize(14); doc.text('Weather Day Log - ' + j.name, 36, 36); doc.setFontSize(9);
  headerLines(j).slice(1).forEach((l, i) => doc.text(doc.splitTextToSize(l[0], 720), 36, 54 + i * 12));
  const rows = weatherDays(j);
  doc.autoTable({ startY: 130, head: [['Date', 'Day', 'Off', 'Rain in', 'Rain day', 'Wet-out', 'Counted', 'Crew', 'Station', 'Source', 'Notes']],
    body: rows.map((r) => [r.Date, r.Day, r['Off day'], r['Rain (in)'], r[`Rain day >= ${j.threshold.toFixed(2)} in`], r['Wet-out'], r['Counted weather day'], r.Crew, r.Station, r.Source, r.Notes || r.Remarks]),
    styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [11, 46, 79] }, columnStyles: { 9: { cellWidth: 140 }, 10: { cellWidth: 170 } } });
  download(fileBase(j) + '.pdf', doc.output('blob'));
}
function printView(j) {
  const rows = weatherDays(j);
  $('#print').innerHTML = `<h2>Weather Day Log - ${esc(j.name)}</h2>${headerLines(j).slice(1).map((l) => `<div>${esc(l[0])}</div>`).join('')}
    <table style="margin-top:10px"><thead><tr><th>Date</th><th>Off</th><th>Rain in</th><th>Rain day</th><th>Wet-out</th><th>Counted</th><th>Crew</th><th>Station</th><th>Source</th><th>Notes</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${r.Day} ${r.Date}</td><td>${r['Off day']}</td><td>${esc(r['Rain (in)'])}</td><td>${r[`Rain day >= ${j.threshold.toFixed(2)} in`]}</td><td>${esc(r['Wet-out'])}</td><td>${r['Counted weather day']}</td><td>${esc(r.Crew)}</td><td>${esc(r.Station)}</td><td>${esc(r.Source)}</td><td>${esc(r.Notes || r.Remarks)}</td></tr>`).join('')}</tbody></table>`;
  window.print();
}

// ---------- boot ----------
render();
initPro();
N()?.hideSplash?.();
if (!window.Capacitor?.isNativePlatform?.() && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
refreshAll(false);
window.addEventListener('online', () => refreshAll(false));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!S.lastRun || Date.now() - Date.parse(S.lastRun) > 3 * 3600e3)) refreshAll(false); });
window.__rdt = { get pro() { return proState; }, proOn, gate, get state() { return S; }, analyze, summarize, chicagoToday, jobToday, jobTZ, stationById };
