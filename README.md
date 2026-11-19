# Rain Out

Static, offline-capable rain / weather-day log for construction jobs. Hosted on GitHub Pages:
https://ddlawler-theonly.github.io/rain-delay-tracker/

- No server, no database, no secrets. Jobs and logs are saved in the browser (localStorage) on each device. Use **Download backup (JSON)** / **Restore backup** to move or protect data.
- On open (and with **Refresh**) the app fetches any missing days from each job's NTP/start date through yesterday (in each job's own local time zone, from its weather station) from the Iowa Environmental Mesonet ASOS daily summaries (`mesonet.agron.iastate.edu/cgi-bin/request/daily.py`, CORS `*`). IEM totals can differ slightly from the official NWS CLI report; each day is labeled with its source and station. Missing data stays missing (never estimated).
- Today's rain chance comes from the NWS forecast (`api.weather.gov`).
- Geocoding: OpenStreetMap Nominatim (manual lat/lon entry always works).
- Nearest station: embedded list of online ASOS stations that report rainfall in all 50 states + DC (IEM `<state>_ASOS` networks; rebuilt with `tools/build_stations.py`); the correct network is sent per station; override per job.
- Monthly normals: NCEI 1991-2020 monthly normals (precip and days >= 0.50 in) for stations with a matching NCEI normals site within 5 km, embedded in `js/data.js`. Where none exists the normals columns stay blank.
- Seed job Ig0057 Lauder Rd carries verified NWS CLI KIAH history for Sep 1 - Nov 16, 2026.
- Exports: CSV, Excel (.xlsx via bundled SheetJS), PDF (bundled jsPDF + AutoTable), print view.

Icons: `icons/*.png.b64` are base64 copies of the PNG icons; the `icons` workflow decodes them into PNGs.
