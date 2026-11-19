#!/usr/bin/env python3
"""Build js/data.js STATIONS + NORMALS for all 50 US states + DC (Rain Out v1.4.0).
Stations: IEM <ST>_ASOS networks (geojson). Precip flag = IEM daily summary reported precip_in on >=90% of days
in the window (same rule as the Texas build). Normals: NCEI 1991-2020 monthly normals for the station's IEM 'ncei91'
id, only if that NCEI station is within 5 km of the ASOS site. Nothing is estimated: no normals -> none shown.
Usage: python3 tools/build_stations.py  (writes js/data.js in place, keeping SEED/PRESET lines)."""
import json, csv, io, time, math, re, sys, urllib.request, concurrent.futures as cf
from pathlib import Path
W0, W1 = '2026-08-01', '2026-11-17'
STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()
UA = {'User-Agent': 'RainOut-build/1.4 (+https://ddlawler-theonly.github.io/rain-delay-tracker/support.html)'}
cache = Path('/tmp/rainout-build'); cache.mkdir(exist_ok=True)
def get(url, name, tries=6):
    f = cache / name
    if f.exists() and f.stat().st_size > 0: return f.read_text()
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r: t = r.read().decode()
            f.write_text(t); return t
        except urllib.error.HTTPError as e:
            if e.code == 404: f.write_text(''); return ''
            time.sleep(5 * (i + 1))
        except Exception: time.sleep(5 * (i + 1))
    raise RuntimeError('failed ' + url)
def km(a, b, c, d):
    t = math.pi / 180; h = math.sin((c - a) * t / 2) ** 2 + math.cos(a * t) * math.cos(c * t) * math.sin((d - b) * t / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))
root = Path(__file__).resolve().parent.parent
old = (root / 'js/data.js').read_text().split('\n')
oldST = json.loads(old[1][len('export const STATIONS='):].rstrip(';'))
oldN = json.loads(old[5][len('export const NORMALS='):].rstrip(';'))
keep_ids = {s[0] for s in oldST}
ndays = (int(W1[5:7]) - 8) * 31  # placeholder, replaced below
from datetime import date
ndays = (date.fromisoformat(W1) - date.fromisoformat(W0)).days + 1
stations, seen = [], {}
for st in STATES:
    net = f'{st}_ASOS'
    gj = json.loads(get(f'https://mesonet.agron.iastate.edu/geojson/network/{net}.geojson', f'{net}.geojson'))
    was_cached = (cache / f'{net}_daily.csv').exists()
    daily = get(f'https://mesonet.agron.iastate.edu/cgi-bin/request/daily.py?network={net}&sts={W0}&ets={W1}&format=csv', f'{net}_daily.csv')
    if not was_cached: time.sleep(4)
    cnt = {}
    rd = csv.DictReader(io.StringIO(daily))
    for r in rd:
        v = r.get('precip_in')
        if v not in (None, '', 'None', 'M'): cnt[r['station']] = cnt.get(r['station'], 0) + 1
    n = 0
    for f in gj['features']:
        p = f['properties']; sid = p['sid']
        if not p.get('online') and sid not in keep_ids: continue
        if sid in seen: print('dup', sid, net, seen[sid], file=sys.stderr); continue
        lon, lat = f['geometry']['coordinates']
        precip = 1 if cnt.get(sid, 0) >= 0.9 * ndays else 0
        seen[sid] = net
        stations.append({'id': sid, 'name': p['sname'], 'lat': round(lat, 4), 'lon': round(lon, 4), 'p': precip, 'st': st, 'tz': p.get('tzname') or '', 'ncei': p.get('ncei91') or ''})
        n += 1
    print(st, len(gj['features']), 'kept', n, 'precip', sum(1 for s in stations if s['st'] == st and s['p']), file=sys.stderr)
missing_old = keep_ids - set(seen)
print('old TX ids missing from new list:', sorted(missing_old), file=sys.stderr)
# compare TX flags with old build
oldflag = {s[0]: s[4] for s in oldST}
diff = [(s['id'], oldflag[s['id']], s['p']) for s in stations if s['id'] in oldflag and oldflag[s['id']] != s['p']]
print('TX precip flag changes (id, old, new):', diff, file=sys.stderr)
# normals
def normals(s):
    nid = s['ncei']
    if not nid.startswith('USW') and not nid.startswith('USC') and not nid.startswith('USR'): return None
    t = get(f'https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/{nid}.csv', f'norm_{nid}.csv')
    if not t: return None
    rows = list(csv.DictReader(io.StringIO(t)))
    if len(rows) != 12: return None
    la, lo = float(rows[0]['LATITUDE']), float(rows[0]['LONGITUDE'])
    if km(s['lat'], s['lon'], la, lo) > 5: return None
    m = []
    for r in rows:
        a = (r.get('MLY-PRCP-NORMAL') or '').strip(); b = (r.get('MLY-PRCP-AVGNDS-GE050HI') or '').strip()
        try: a = float(a); b = float(b)
        except ValueError: return None
        if a < 0 or b < 0: return None  # NCEI missing codes are negative
        m.append([a, b])
    return {'ncei': nid, 'm': m}
NORM = dict(oldN)
todo = [s for s in stations if s['p'] and s['id'] not in NORM and s['ncei']]
with cf.ThreadPoolExecutor(4) as ex:
    for s, r in zip(todo, ex.map(normals, todo)):
        if r: NORM[s['id']] = r
print('stations', len(stations), 'precip', sum(s['p'] for s in stations), 'normals', len(NORM), file=sys.stderr)
stations = [s for s in stations if s['p'] or s['id'] in keep_ids]  # stations without rain data are useless for auto-pick; keep old TX ids so saved jobs resolve
stations.sort(key=lambda s: (s['st'], s['id']))
ST = [[s['id'], s['name'], s['lat'], s['lon'], s['p'], s['st'], s['tz']] for s in stations]
old[0] = f"// Embedded data. Stations: IEM <state>_ASOS networks, all 50 states + DC (DC sites are in VA/MD networks), online stations that report precip plus every station from the 2026-11-17 Texas list (fields id,name,lat,lon,precip,state,tz), fetched {__import__('datetime').datetime.now(__import__('zoneinfo').ZoneInfo('America/Chicago')).date()} by tools/build_stations.py. precip 1 = IEM daily summary reported precip on >=90% of days {W0}..{W1}, used for auto-pick."
old[1] = 'export const STATIONS=' + json.dumps(ST, separators=(',', ':')) + ';'
old[4] = f"// NCEI 1991-2020 monthly normals (MLY-PRCP-NORMAL in, MLY-PRCP-AVGNDS-GE050HI days>=0.50 in) from ncei.noaa.gov/data/normals-monthly/1991-2020, keyed by IEM station id, only where the NCEI station (IEM ncei91 link) is within 5 km of the ASOS site. m[0]=Jan. Texas entries from the 2026-11-17 build are kept as-is."
old[5] = 'export const NORMALS=' + json.dumps(NORM, separators=(',', ':')) + ';'
(root / 'js/data.js').write_text('\n'.join(old))
