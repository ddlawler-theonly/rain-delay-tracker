// Applies raindelay.config.json (the ONE place for app name, bundle id, version) to capacitor.config.json,
// the Xcode project (bundle id, version) and Info.plist (display name). Idempotent.
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'raindelay.config.json'), 'utf8'));
const cap = {
  appId: cfg.bundleId, appName: cfg.appName, webDir: 'www',
  ios: { contentInset: 'never', backgroundColor: '#0B2E4F' },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 800, backgroundColor: '#0B2E4F', showSpinner: false },
    StatusBar: { overlaysWebView: true, style: 'DARK' },
    LocalNotifications: { iconColor: '#0B5CAD' },
  },
};
fs.writeFileSync(path.join(root, 'capacitor.config.json'), JSON.stringify(cap, null, 2) + '\n');
const pbx = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
if (fs.existsSync(pbx)) {
  let s = fs.readFileSync(pbx, 'utf8');
  s = s.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${cfg.bundleId};`);
  s = s.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${cfg.version};`);
  fs.writeFileSync(pbx, s);
  const plist = path.join(root, 'ios/App/App/Info.plist');
  let p = fs.readFileSync(plist, 'utf8');
  p = p.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${cfg.displayName || cfg.appName}$2`);
  const ensure = (key, xml) => { if (!p.includes(`<key>${key}</key>`)) p = p.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`); };
  ensure('ITSAppUsesNonExemptEncryption', '<false/>');
  ensure('UIFileSharingEnabled', '<true/>');
  ensure('LSSupportsOpeningDocumentsInPlace', '<true/>');
  p = p.replace('<string>armv7</string>', '<string>arm64</string>');
  fs.writeFileSync(plist, p);
  console.log('Applied config to Xcode project:', cfg.bundleId, cfg.version);
} else console.log('capacitor.config.json written (no ios/ yet)');
