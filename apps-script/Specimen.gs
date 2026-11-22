/**
 * SPECIMEN visa files for the staging test (testApproveVisa) and sendEmailSamples. Generated, never real:
 * each is a one-page PDF that says "SPECIMEN - NOT A VISA" and holds no name or personal data.
 * Plain JavaScript (no Apps Script services) and deterministic, so tools/qa/visa-live.js builds the very
 * same bytes and checks that a download through the web app matches them exactly.
 *   specimenVisaPdf_(1) → small PDF (~1 KB)
 *   specimenVisaPdf_(2) → large PDF (~4.5 MB: the same page plus an unused padding stream)
 * Returns an ASCII string (1 character = 1 byte).
 */
const SPECIMEN_LARGE_BYTES = Math.round(4.5 * 1024 * 1024);

function specimenVisaPdf_(variant) {
  const large = variant === 2;
  const lines = [
    ['BT /F1 54 Tf 70 700 Td (SPECIMEN) Tj ET'],
    ['BT /F1 26 Tf 70 655 Td (NOT A VISA - TEST FILE ONLY) Tj ET'],
    ['BT /F2 14 Tf 70 610 Td (Elite Global staging test of the visa download.) Tj ET'],
    ['BT /F2 14 Tf 70 590 Td (Generated file. It contains no personal data.) Tj ET'],
    ['BT /F2 14 Tf 70 570 Td (' + (large ? 'Large test file (about 4.5 MB), 2 of 2.' : 'Small test file, 1 of 2.') + ') Tj ET'],
  ].map(function (l) { return l[0]; }).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + lines.length + ' >>\nstream\n' + lines + '\nendstream',
  ];
  if (large) objs.push(''); // padding stream, filled below to reach the target size
  const build = function (pad) {
    if (large) objs[6] = '<< /Length ' + pad.length + ' >>\nstream\n' + pad + '\nendstream';
    let out = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach(function (o, i) { offsets.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (off) { out += ('0000000000' + off).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return out;
  };
  if (!large) return build('');
  const overhead = build('').length;
  return build(specimenPadding_(SPECIMEN_LARGE_BYTES - overhead));
}

/** n characters of deterministic hex (lines of 64 + new line). */
function specimenPadding_(n) {
  const parts = [];
  let seed = 20261122, len = 0;
  while (len < n) {
    let line = '';
    for (let i = 0; i < 8; i++) {
      seed = (seed * 48271) % 2147483647; // Park–Miller: exact in doubles, same bytes everywhere
      line += ('00000000' + seed.toString(16)).slice(-8);
    }
    line += '\n';
    parts.push(line);
    len += line.length;
  }
  return parts.join('').slice(0, n);
}
