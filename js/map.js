// Map picker (Leaflet 1.9.4 bundled in vendor/leaflet, loaded on demand; not needed for offline use).
// Tiles: OpenStreetMap standard tiles (attribution required) + optional USGS National Map imagery (US public domain; credit shown).
let loading = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js'; s.onload = () => res(window.L); s.onerror = () => { loading = null; rej(new Error('Map library failed to load')); };
    document.head.appendChild(s);
  });
  return loading;
}
function baseLayers(L) {
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
  const sat = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16, attribution: 'Imagery: USGS The National Map / USDA NAIP' });
  return { osm, sat };
}
const pinStyle = { radius: 9, color: '#fff', weight: 3, fillColor: '#d62828', fillOpacity: 1 };
const areaStyle = { color: '#0b5cad', weight: 3, fillColor: '#4fa3ff', fillOpacity: 0.25 };
export function centroid(pts) {
  // planar polygon centroid (fine for job-site-sized areas)
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < pts.length; i++) {
    const [y0, x0] = pts[i], [y1, x1] = pts[(i + 1) % pts.length];
    const f = x0 * y1 - x1 * y0; a += f; x += (x0 + x1) * f; y += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-12) { const n = pts.length; return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]; }
  a *= 0.5; return [y / (6 * a), x / (6 * a)];
}
function drawArea(L, area) { return area?.type === 'rectangle' ? L.rectangle(L.latLngBounds(area.points), areaStyle) : L.polygon(area.points, areaStyle); }
function rectPts(a, b) { return [[a[0], a[1]], [a[0], b[1]], [b[0], b[1]], [b[0], a[1]]]; }

export async function mountView(el, job) {
  const L = await loadLeaflet();
  const map = L.map(el, { zoomControl: true, scrollWheelZoom: false, tap: true });
  const { osm, sat } = baseLayers(L); osm.addTo(map); L.control.layers({ Map: osm, Satellite: sat }, null, { position: 'topright' }).addTo(map);
  if (job.area?.points?.length >= 3) { const lyr = drawArea(L, job.area).addTo(map); map.fitBounds(lyr.getBounds(), { padding: [20, 20], maxZoom: 17 }); }
  else map.setView([job.lat, job.lon], job.approx ? 12 : 15);
  L.circleMarker([job.lat, job.lon], pinStyle).addTo(map).bindTooltip(job.approx ? 'Approximate location' : 'Job location');
  return map;
}

// opts: {lat, lon, area, query}; onChange({lat, lon, area})
export async function mountPicker(root, opts, onChange) {
  root.innerHTML = `<div class="row" style="margin-bottom:6px"><input id="mq" placeholder="Search address or place" value="${(opts.query || '').replace(/"/g, '&quot;')}" style="flex:1;min-width:160px"><button type="button" id="mgo">Search</button></div>
    <div class="row mapmodes" style="margin-bottom:6px"><button type="button" data-m="pin" class="sel">📍 Pin</button><button type="button" data-m="polygon">✏️ Draw area</button><button type="button" data-m="rectangle">▭ Rectangle</button>
    <button type="button" id="mfin" hidden>✓ Finish area</button><button type="button" id="mundo" hidden>Undo point</button><button type="button" id="mclr">Clear area</button></div>
    <div id="mhint" class="mute small" style="margin-bottom:6px">Tap the map to drop or move the pin.</div><div id="mapbox" class="mapbox"></div>`;
  const L = await loadLeaflet();
  const box = root.querySelector('#mapbox');
  const map = L.map(box, { tap: true });
  const { osm, sat } = baseLayers(L); osm.addTo(map); L.control.layers({ Map: osm, Satellite: sat }, null, { position: 'topright' }).addTo(map);
  const has = isFinite(opts.lat) && isFinite(opts.lon);
  map.setView(has ? [opts.lat, opts.lon] : [29.76, -95.37], has ? 15 : 9);
  let pin = has ? L.circleMarker([opts.lat, opts.lon], pinStyle).addTo(map) : null;
  let area = opts.area?.points?.length >= 3 ? opts.area : null;
  let areaLyr = area ? drawArea(L, area).addTo(map) : null;
  if (areaLyr) map.fitBounds(areaLyr.getBounds(), { padding: [20, 20], maxZoom: 18 });
  let mode = 'pin', pts = [], temp = L.layerGroup().addTo(map);
  const hint = root.querySelector('#mhint'), fin = root.querySelector('#mfin'), undo = root.querySelector('#mundo');
  const setPin = (ll) => { if (pin) pin.setLatLng(ll); else pin = L.circleMarker(ll, pinStyle).addTo(map); };
  const emit = () => { const c = pin.getLatLng(); onChange({ lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6), area }); };
  function setMode(m) {
    mode = m; pts = []; temp.clearLayers();
    root.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('sel', b.dataset.m === m));
    fin.hidden = undo.hidden = m !== 'polygon';
    hint.textContent = m === 'pin' ? 'Tap the map to drop or move the pin.' : m === 'polygon' ? 'Tap each corner of the site, then tap “Finish area” (3+ points).' : 'Tap one corner, then the opposite corner.';
  }
  function redrawTemp() {
    temp.clearLayers();
    pts.forEach((p) => L.circleMarker(p, { radius: 6, color: '#0b5cad', fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(temp));
    if (pts.length > 1) L.polyline(pts, { color: '#0b5cad', weight: 3, dashArray: '6 6' }).addTo(temp);
  }
  function commitArea(a) {
    area = a; if (areaLyr) areaLyr.remove(); areaLyr = drawArea(L, area).addTo(map);
    const c = centroid(area.points); setPin(c); emit(); setMode('pin');
    hint.textContent = 'Area saved. Job location = center of the area.';
  }
  map.on('click', (e) => {
    const p = [e.latlng.lat, e.latlng.lng];
    if (mode === 'pin') { setPin(e.latlng); emit(); return; }
    pts.push(p);
    if (mode === 'rectangle' && pts.length === 2) return commitArea({ type: 'rectangle', points: rectPts(pts[0], pts[1]) });
    redrawTemp();
  });
  root.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
  fin.onclick = () => { if (pts.length < 3) { hint.textContent = 'Need at least 3 points.'; return; } commitArea({ type: 'polygon', points: pts.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]) }); };
  undo.onclick = () => { pts.pop(); redrawTemp(); };
  root.querySelector('#mclr').onclick = () => { area = null; if (areaLyr) areaLyr.remove(); areaLyr = null; setMode('pin'); if (pin) emit(); };
  const go = async () => {
    const q = root.querySelector('#mq').value.trim(); if (!q) return;
    hint.textContent = 'Searching…';
    try {
      const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`)).json();
      if (!r.length) { hint.textContent = 'Not found. Pan the map and tap to place the pin.'; return; }
      const ll = [+r[0].lat, +r[0].lon]; map.setView(ll, 17); setPin(ll); emit(); hint.textContent = 'Found: ' + r[0].display_name + '. Tap to adjust.';
    } catch (e) { hint.textContent = 'Search failed (offline?). Tap the map or type lat/lon.'; }
  };
  root.querySelector('#mgo').onclick = go;
  root.querySelector('#mq').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  return { map, setView: (lat, lon) => { if (isFinite(lat) && isFinite(lon)) { setPin([lat, lon]); map.setView([lat, lon], Math.max(map.getZoom(), 15)); } } };
}
