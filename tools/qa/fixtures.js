// Generates SPECIMEN test files (never real passports). Usage: node fixtures.js <chrome> <outDir>
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const [exe, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

(async () => {
  const b = await puppeteer.launch({ executablePath: exe, headless: true });
  const p = await b.newPage();
  await p.setContent('<canvas id=c></canvas>');
  // draw a specimen image of w×h with noise level; return JPEG/PNG bytes closest under/over targetBytes
  const make = (w, h, mime, noise, label, q) => p.evaluate(async (w, h, mime, noise, label, q) => {
    const c = document.getElementById('c'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#dfe7f5'; x.fillRect(0, 0, w, h);
    const img = x.getImageData(0, 0, w, h);
    let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * noise; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    x.putImageData(img, 0, 0);
    x.fillStyle = '#071b50'; x.font = 'bold ' + Math.round(h / 8) + 'px Arial'; x.fillText(label, w * 0.06, h * 0.55);
    x.font = Math.round(h / 16) + 'px Arial'; x.fillText('TEST ONLY — NOT A REAL DOCUMENT', w * 0.06, h * 0.75);
    const blob = await new Promise(r => c.toBlob(r, mime, q));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, w, h, mime, noise, label, q);

  // search JPEG quality/noise to land in a size window
  async function jpegInRange(file, w, h, noise, min, max, label) {
    let lo = 0.05, hi = 1, best;
    for (let i = 0; i < 18; i++) {
      const q = (lo + hi) / 2; const bytes = await make(w, h, 'image/jpeg', noise, label, q);
      if (bytes.length > max) hi = q; else if (bytes.length < min) lo = q; else { best = bytes; break; }
    }
    if (!best) throw new Error('could not hit size window for ' + file);
    fs.writeFileSync(path.join(out, file), Buffer.from(best));
    console.log(file, (best.length / 1024).toFixed(1) + ' KB');
  }

  await jpegInRange('passport.jpg', 1400, 980, 60, 250 * 1024, 400 * 1024, 'SPECIMEN PASSPORT');
  await jpegInRange('photo-40kb.jpg', 600, 600, 40, 36 * 1024, 46 * 1024, 'SPECIMEN');
  await jpegInRange('photo-20kb.jpg', 300, 300, 30, 18 * 1024, 22 * 1024, 'SPECIMEN');
  await jpegInRange('photo-2mb.jpg', 3000, 3000, 90, 1.8 * 1024 * 1024, 2.4 * 1024 * 1024, 'SPECIMEN');
  await jpegInRange('passport-big.jpg', 4000, 2800, 90, 2.5 * 1024 * 1024, 4 * 1024 * 1024, 'SPECIMEN PASSPORT');
  // PNG photo in 25–50 KB: small image with moderate noise
  for (const side of [160, 150, 140, 170, 130, 180, 120]) {
    const bytes = await make(side, side, 'image/png', 18, 'SP', 1);
    if (bytes.length >= 28 * 1024 && bytes.length <= 47 * 1024) { fs.writeFileSync(path.join(out, 'photo-png.png'), Buffer.from(bytes)); console.log('photo-png.png', (bytes.length / 1024).toFixed(1) + ' KB', side + 'px'); break; }
  }
  await b.close();

  // minimal valid PDF, padded to ~60 KB
  const pad = '% ' + 'TEST ONLY - NOT A REAL DOCUMENT '.repeat(1800) + '\n';
  const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 60>>stream\nBT /F1 28 Tf 60 700 Td (SPECIMEN PASSPORT - TEST) Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' + pad + 'trailer<</Root 1 0 R>>\n%%EOF\n';
  fs.writeFileSync(path.join(out, 'passport.pdf'), pdf); console.log('passport.pdf', (pdf.length / 1024).toFixed(1) + ' KB');
  fs.writeFileSync(path.join(out, 'fake.jpg'), 'This is a plain text file pretending to be a JPEG.\n'.repeat(800));
  console.log('fake.jpg (text) written');
  for (let i = 1; i <= 12; i++) fs.copyFileSync(path.join(out, 'passport.jpg'), path.join(out, `pax${String(i).padStart(2, '0')}.jpg`));
  console.log('pax01..12.jpg copies written');
})().catch(e => { console.error(e); process.exit(2); });
