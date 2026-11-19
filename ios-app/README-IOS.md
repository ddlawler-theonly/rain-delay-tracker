# Rain Out: native iOS app (Capacitor 8) → TestFlight

Mirrors the Level Book iOS setup. This folder wraps the web app at the repo root (the same files GitHub Pages serves) in a native iOS shell.

| Path | Purpose |
|---|---|
| `raindelay.config.json` | The one place for app name, display name, bundle id (`com.blueworksfieldpro.raindelay`), version, and `store` flag. |
| `scripts/build-web.mjs` | Copies the repo-root web app → `www/`, writes `js/config.js` with `STORE: true`, **strips the seed job, Lauder Rd history and preset job sites** (fails the build if any remain), bundles the native bridge, and drops the service worker. |
| `src/native-entry.js` | `window.RDNative`: share sheet (Share + Filesystem), local notifications, haptics, Preferences/Documents autobackup + restore, splash, status bar. |
| `scripts/apply-config.mjs` | Pushes the config into `capacitor.config.json`, the Xcode project and Info.plist. |
| `scripts/make-ios-assets.mjs` | Generates AppIcon (1024 + all sizes, opaque) and splash PNGs. PNGs are **not committed**; CI runs `npm run icons`. |
| `ios/` | Xcode project (Swift Package Manager, no CocoaPods). |
| `fastlane/`, `Gemfile` | `bundle exec fastlane ios beta`: automatic signing with an App Store Connect API key, upload to TestFlight. |
| `../.github/workflows/ios-testflight.yml` | CI on `macos-latest`; trigger by pushing a tag `ios-v*` (or Run workflow). |

Commands: `npm ci` · `npm run icons` · `npm run sync` (build `www/`, `npx cap sync ios`, apply config) · `npx cap open ios` (Mac).

Store build vs GitHub Pages build: Pages ships `js/config.js` with `STORE: false` (Derek's jobs and the Lauder Rd seed preload). The iOS build sets `STORE: true`: the app starts empty and offers **Load sample job** (a public Houston location; its weather is fetched live, nothing invented), and shows privacy/support links.

Secrets (repo Settings › Secrets and variables › Actions): `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY` (full .p8 text), `APPLE_TEAM_ID`. See `/appstore/DEREK-STEPS.md` in the workspace for the Apple-side steps.

Info.plist: display name "Rain Out", `ITSAppUsesNonExemptEncryption = NO`, file sharing on (autobackup visible in Files), no location/camera/photo permission strings. Notifications permission is requested at runtime the first time a rain day is flagged.

## Rain Out Pro (in-app subscriptions, StoreKit 2, no server)
- Plugin: `plugins/rainout-storekit` (local npm package, Swift, ~170 lines). JS name `RainOutStore`; wrapped as `window.RDNative.iap` in `src/native-entry.js`. Methods: getProducts, purchase, restore (AppStore.sync), entitlements (Transaction.currentEntitlements), manageSubscriptions. A Transaction.updates listener finishes renewals/refunds and emits `entitlements`.
- Products (group "Rain Out Pro"): `com.blueworksfieldpro.raindelay.pro.monthly`, `com.blueworksfieldpro.raindelay.pro.yearly`. Gating rules: `js/pro.js` (tests: `test/pro.test.mjs`). Gating applies only when `CONFIG.STORE` is true; the web version is unrestricted.
- Local testing: `ios/App/RainOut.storekit`, already selected in the shared App scheme (Run › Options › StoreKit Configuration).
- CI: `.github/workflows/ios-build-check.yml` compiles the app for the simulator, unsigned. It never signs, uploads, or tags.
