// Bundled by esbuild into www/js/native.js (iOS build only). Exposes window.RDNative for js/app.js.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';

const KEY = 'rdt.v1';
const BACKUP = 'RainDelay-autobackup.json';
const isNative = Capacitor.isNativePlatform();
const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
const cancelled = (e) => /cancel/i.test(String(e?.message || e || ''));
let backupTimer = null, pending = null, notifId = Date.now() % 100000;
// Rain Out Pro: local StoreKit 2 plugin (plugins/rainout-storekit). On-device only, no server.
const RainOutStore = registerPlugin('RainOutStore');
const iap = isNative ? {
  async products(ids) { return (await RainOutStore.getProducts({ ids })).products || []; },
  async purchase(id) { return RainOutStore.purchase({ id }); },
  async restore() { return (await RainOutStore.restore()).entitlements || []; },
  async entitlements() { return (await RainOutStore.entitlements()).entitlements || []; },
  async manage() { return RainOutStore.manageSubscriptions(); },
  onChange(cb) { RainOutStore.addListener('entitlements', (e) => cb(e?.entitlements || [])); },
} : null;

window.RDNative = {
  isNative,
  // Exports (CSV / Excel / PDF / JSON backup): write to the app cache, then open the iOS share sheet.
  async shareFile(name, blob) {
    const data = await blobToBase64(blob);
    const safe = String(name).replace(/[^\w.-]+/g, '-');
    const { uri } = await Filesystem.writeFile({ path: `share/${safe}`, data, directory: Directory.Cache, recursive: true });
    try { await Share.share({ title: safe, files: [uri], dialogTitle: safe }); Haptics.notification({ type: NotificationType.Success }).catch(() => {}); return 'shared'; }
    catch (e) { if (cancelled(e)) return 'cancelled'; throw e; }
  },
  // Local notification when a new rain day is flagged (permission asked the first time one is needed).
  async notify(title, body) {
    try {
      let p = await LocalNotifications.checkPermissions();
      if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await LocalNotifications.requestPermissions();
      if (p.display !== 'granted') return false;
      await LocalNotifications.schedule({ notifications: [{ id: ++notifId, title, body, schedule: { at: new Date(Date.now() + 1000) } }] });
      return true;
    } catch (e) { console.warn('notify', e); return false; }
  },
  // localStorage is the working store; mirrored to Preferences + Documents/RainDelay-autobackup.json (Files app).
  backup(json) {
    pending = json; clearTimeout(backupTimer);
    backupTimer = setTimeout(async () => {
      const v = pending; pending = null;
      try { await Preferences.set({ key: KEY, value: v }); } catch (e) {}
      try { await Filesystem.writeFile({ path: BACKUP, data: v, directory: Directory.Documents, encoding: Encoding.UTF8 }); } catch (e) {}
    }, 800);
  },
  async restore() {
    try { const { value } = await Preferences.get({ key: KEY }); if (value) return value; } catch (e) {}
    try { const r = await Filesystem.readFile({ path: BACKUP, directory: Directory.Documents, encoding: Encoding.UTF8 }); return r.data || null; } catch (e) { return null; }
  },
  hideSplash() { SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {}); },
  tap() { Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); },
  iap,
};
if (isNative) StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
