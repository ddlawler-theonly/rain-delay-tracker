"""One-off signing setup via the App Store Connect API (run by .github/workflows/ios-signing-setup.yml).
Revokes ONLY the unused cert in REVOKE_ID, creates ONE Apple Distribution cert from dist.csr (CSR made offline;
the private key never leaves the owner's machine), and recreates the App Store profile with the new + KEEP certs.
Writes only public data (cert ids, names, public cert content) to out/."""
import json, os, sys, time, pathlib, jwt, requests

API = 'https://api.appstoreconnect.apple.com/v1'
REVOKE_ID, KEEP_ID = '2WP297VZQD', '5HZ7KY6X2F'
BUNDLE = 'com.blueworksfieldpro.raindelay'
PROFILE_NAME = f'{BUNDLE} AppStore'
out = pathlib.Path('out'); out.mkdir(exist_ok=True)

tok = jwt.encode({'iss': os.environ['APP_STORE_CONNECT_ISSUER_ID'], 'iat': int(time.time()), 'exp': int(time.time()) + 900,
                  'aud': 'appstoreconnect-v1'}, os.environ['APP_STORE_CONNECT_KEY'], algorithm='ES256',
                 headers={'kid': os.environ['APP_STORE_CONNECT_KEY_ID'], 'typ': 'JWT'})
H = {'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'}

def call(method, path, **kw):
    r = requests.request(method, API + path, headers=H, timeout=60, **kw)
    if r.status_code >= 400:
        print(f'::error::{method} {path} -> {r.status_code}: {r.text[:800]}'); sys.exit(1)
    return r.json() if r.text else {}

def dist_certs():
    d = call('GET', '/certificates', params={'filter[certificateType]': 'DISTRIBUTION,IOS_DISTRIBUTION', 'limit': 200})['data']
    return [{'id': c['id'], 'type': c['attributes']['certificateType'], 'name': c['attributes']['name'],
             'expires': c['attributes']['expirationDate']} for c in d]

before = dist_certs(); print('BEFORE', json.dumps(before, indent=1))
assert REVOKE_ID != KEEP_ID
if any(c['id'] == REVOKE_ID for c in before):
    call('DELETE', f'/certificates/{REVOKE_ID}'); print('REVOKED', REVOKE_ID)
else:
    print('NOT FOUND (already revoked?)', REVOKE_ID)

csr = pathlib.Path(__file__).with_name('dist.csr').read_text()
r = requests.post(API + '/certificates', headers=H, timeout=60,
                  json={'data': {'type': 'certificates', 'attributes': {'certificateType': 'DISTRIBUTION', 'csrContent': csr}}})
if r.status_code >= 400:
    print(f'::error::create certificate -> {r.status_code}: {r.text[:800]}')
    (out / 'create-error.json').write_text(r.text); (out / 'certs.json').write_text(json.dumps(dist_certs(), indent=1)); sys.exit(1)
new = r.json()['data']
(out / 'new-cert.json').write_text(json.dumps({'id': new['id'], 'name': new['attributes']['name'],
                                               'certificateContent': new['attributes']['certificateContent']}))
print('CREATED', new['id'])

bid = [b for b in call('GET', '/bundleIds', params={'filter[identifier]': BUNDLE, 'limit': 50})['data']
       if b['attributes']['identifier'] == BUNDLE][0]['id']
for p in call('GET', '/profiles', params={'filter[name]': PROFILE_NAME, 'limit': 50})['data']:
    if p['attributes']['name'] == PROFILE_NAME:
        call('DELETE', f"/profiles/{p['id']}"); print('DELETED OLD PROFILE', p['id'])
certs = [{'type': 'certificates', 'id': new['id']}] + ([{'type': 'certificates', 'id': KEEP_ID}] if any(c['id'] == KEEP_ID for c in before) else [])
prof = call('POST', '/profiles', json={'data': {'type': 'profiles', 'attributes': {'name': PROFILE_NAME, 'profileType': 'IOS_APP_STORE'},
       'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid}}, 'certificates': {'data': certs}}}})['data']
print('CREATED PROFILE', prof['id'], prof['attributes']['name'], 'certs:', [c['id'] for c in certs])

after = dist_certs(); print('AFTER', json.dumps(after, indent=1))
(out / 'certs.json').write_text(json.dumps(after, indent=1))
