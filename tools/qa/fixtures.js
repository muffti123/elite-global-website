// Generates SPECIMEN test files (never real passports). Usage: node fixtures.js <chrome> <outDir>
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const [exe, out] = process.argv.slice(2);
const FIXTURES_VERSION = '3'; // bump when fixtures change; run.js regenerates on mismatch
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
  // Passport photos are portrait 35 × 45 mm (width/height ≈ 0.78), at least 350 × 450 px
  await jpegInRange('photo-40kb.jpg', 420, 540, 40, 36 * 1024, 46 * 1024, 'SPECIMEN');
  await jpegInRange('photo-20kb.jpg', 300, 300, 30, 18 * 1024, 22 * 1024, 'SPECIMEN');
  await jpegInRange('photo-2mb.jpg', 2400, 3086, 90, 1.8 * 1024 * 1024, 2.4 * 1024 * 1024, 'SPECIMEN');
  // Photos the shape check must reject (all 25–50 KB, so only the shape is wrong)
  await jpegInRange('photo-landscape.jpg', 640, 480, 40, 36 * 1024, 46 * 1024, 'SPECIMEN');
  await jpegInRange('photo-square.jpg', 600, 600, 40, 36 * 1024, 46 * 1024, 'SPECIMEN');
  await jpegInRange('photo-selfie.jpg', 450, 800, 40, 36 * 1024, 46 * 1024, 'SPECIMEN');
  await jpegInRange('photo-lowres.jpg', 280, 360, 120, 27 * 1024, 46 * 1024, 'SPEC');
  await jpegInRange('passport-big.jpg', 4000, 2800, 90, 2.5 * 1024 * 1024, 4 * 1024 * 1024, 'SPECIMEN PASSPORT');
  await jpegInRange('hotel.jpg', 1240, 1754, 40, 150 * 1024, 400 * 1024, 'SPECIMEN HOTEL');
  // PNG photo in 25–50 KB, portrait 360 × 463. PNG size jumps from ~11 KB to ~130 KB once the whole
  // image is noisy, so add noise to a band of rows only and search the band height.
  const pngBand = (frac) => p.evaluate(async (frac) => {
    const w = 360, h = 463, c = document.getElementById('c'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    const band = Math.round(h * frac), img = x.getImageData(0, 0, w, band);
    let s = 777; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < img.data.length; i += 4) { const n = (rnd() - 0.5) * 24; img.data[i] = 220 + n; img.data[i + 1] = 228 + n; img.data[i + 2] = 240 + n; }
    x.putImageData(img, 0, h - band);
    x.fillStyle = '#071b50'; x.font = 'bold 40px Arial'; x.fillText('SPECIMEN', 20, 200);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, frac);
  let pngOk = false;
  let lo = 0.02, hi = 0.6;
  for (let i = 0; i < 14 && !pngOk; i++) {
    const frac = (lo + hi) / 2;
    const bytes = await pngBand(frac);
    if (bytes.length < 30 * 1024) lo = frac; else if (bytes.length > 45 * 1024) hi = frac;
    else { fs.writeFileSync(path.join(out, 'photo-png.png'), Buffer.from(bytes)); console.log('photo-png.png', (bytes.length / 1024).toFixed(1) + ' KB', 'band ' + frac.toFixed(2)); pngOk = true; }
  }
  if (!pngOk) throw new Error('could not hit size window for photo-png.png');
  await b.close();

  // minimal valid PDFs, padded to ~60 KB
  const pad = '% ' + 'TEST ONLY - NOT A REAL DOCUMENT '.repeat(1800) + '\n';
  const pdfOf = (title) => '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 60>>stream\nBT /F1 28 Tf 60 700 Td (' + title + ') Tj ET\nendstream endobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' + pad + 'trailer<</Root 1 0 R>>\n%%EOF\n';
  const pdf = pdfOf('SPECIMEN PASSPORT - TEST');
  fs.writeFileSync(path.join(out, 'passport.pdf'), pdf); console.log('passport.pdf', (pdf.length / 1024).toFixed(1) + ' KB');
  fs.writeFileSync(path.join(out, 'ticket.pdf'), pdfOf('SPECIMEN FLIGHT TICKET - TEST')); console.log('ticket.pdf written');
  fs.writeFileSync(path.join(out, 'fake.jpg'), 'This is a plain text file pretending to be a JPEG.\n'.repeat(800));
  console.log('fake.jpg (text) written');
  for (let i = 1; i <= 12; i++) fs.copyFileSync(path.join(out, 'passport.jpg'), path.join(out, `pax${String(i).padStart(2, '0')}.jpg`));
  console.log('pax01..12.jpg copies written');
  fs.writeFileSync(path.join(out, 'VERSION'), FIXTURES_VERSION);
})().catch(e => { console.error(e); process.exit(2); });
