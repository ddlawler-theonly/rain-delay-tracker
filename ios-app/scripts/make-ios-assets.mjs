// Generates the iOS AppIcon set and launch/splash images from icons/icon.svg.
// Opaque PNGs (App Store rejects icons with alpha). Run in CI before building (PNGs are not committed).
import sharp from 'sharp'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const assets = path.join(root, 'ios/App/App/Assets.xcassets');
const BG = '#0B2E4F';
// Official icon art: ../icons/icon.svg (Derek's calendar icon). iOS applies its own corner mask, so the rounded
// corners are removed (full-bleed navy) and every PNG is flattened onto navy (no alpha).
const glyph = fs.readFileSync(path.join(root, '../icons/icon.svg'), 'utf8').replace(' rx="96" fill="#0b2e4f"', ' fill="#0b2e4f"');
if (!glyph.includes('<rect width="512" height="512" fill="#0b2e4f"/>')) throw new Error('icon.svg background rect not found');
const render = (size, file) => sharp(Buffer.from(glyph), { density: Math.ceil(72 * size / 512) }).resize(size, size).flatten({ background: BG }).removeAlpha().png().toFile(file);
const iconDir = path.join(assets, 'AppIcon.appiconset');
fs.rmSync(iconDir, { recursive: true, force: true }); fs.mkdirSync(iconDir, { recursive: true });
const specs = [['iphone', 20, 2], ['iphone', 20, 3], ['iphone', 29, 2], ['iphone', 29, 3], ['iphone', 40, 2], ['iphone', 40, 3], ['iphone', 60, 2], ['iphone', 60, 3],
  ['ios-marketing', 1024, 1]]; // iPhone-only app (TARGETED_DEVICE_FAMILY = 1), so no iPad icon sizes
const images = [];
for (const [idiom, pt, scale] of specs) { const px = Math.round(pt * scale); const name = `AppIcon-${pt}@${scale}x.png`; await render(px, path.join(iconDir, name)); images.push({ filename: name, idiom, scale: `${scale}x`, size: `${pt}x${pt}` }); }
fs.writeFileSync(path.join(iconDir, 'Contents.json'), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2));
const splashDir = path.join(assets, 'Splash.imageset');
fs.rmSync(splashDir, { recursive: true, force: true }); fs.mkdirSync(splashDir, { recursive: true });
const icon = await sharp(Buffer.from(glyph), { density: 220 }).resize(760, 760).png().toBuffer();
const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="160"><text x="700" y="120" text-anchor="middle" font-family="DejaVu Sans,Arial" font-weight="bold" font-size="100" letter-spacing="8" fill="#fff">RAIN OUT</text></svg>`);
const files = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'];
for (const f of files) await sharp({ create: { width: 2732, height: 2732, channels: 3, background: BG } }).composite([{ input: icon, left: 986, top: 880 }, { input: label, left: 666, top: 1700 }]).png().toFile(path.join(splashDir, f));
fs.writeFileSync(path.join(splashDir, 'Contents.json'), JSON.stringify({ images: files.map((f, i) => ({ idiom: 'universal', filename: f, scale: `${i + 1}x` })), info: { author: 'xcode', version: 1 } }, null, 2));
console.log(`AppIcon: ${images.length} images; Splash: ${files.length} images`);
