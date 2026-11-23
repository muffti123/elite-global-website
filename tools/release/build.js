#!/usr/bin/env node
/*
 * Production release of the website for Hostinger (docs/LAUNCH.md §2). No dependencies.
 *
 *   node tools/release/build.js             → release/site/ + release/elitetravelng-<yyyymmdd>-<commit>.zip
 *                                             (upload the zip in hPanel → File Manager → public_html → Extract)
 *   node tools/release/build.js --preview   → release/site/ only, still pointing at the STAGING web app, so the
 *                                             static QA can run on the release before production exists.
 *                                             A preview is never uploaded (no zip is made).
 *
 * public/ itself is never changed: staging (Netlify) keeps using it as it is.
 * Then: node tools/release/check.js [--preview]  and  cd tools/qa && node run.js static --root ../../release/site
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'release');
const SITE = path.join(OUT, 'site');
const PREVIEW = process.argv.includes('--preview');
const STAGING_ID = 'AKfycbzSBOiav81YF7eKJvqLaXJM1p2S6oRXeKVVhsGKgCtMfkdKZUrXr7cC0UQ-bRZ6kjtqXQ';
const die = (m) => { console.error('❌ ' + m); process.exit(1); };

// --- production settings --------------------------------------------------------------------------
const prod = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy/production.json'), 'utf8'));
const SITE_URL = String(prod.siteUrl || '').replace(/\/+$/, '');
if (SITE_URL !== 'https://elitetravelng.com') die('deploy/production.json siteUrl must be https://elitetravelng.com');
const stagingSrc = fs.readFileSync(path.join(PUBLIC, 'assets/js/config.js'), 'utf8');
const stagingUrl = (/webAppUrl:\s*'([^']*)'/.exec(stagingSrc) || [])[1] || '';
let webAppUrl = String(prod.webAppUrl || '');
if (PREVIEW) {
  webAppUrl = stagingUrl; // preview only: the static QA's health check needs a web app that answers
} else {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/AKfycb[\w-]{20,}\/exec$/.test(webAppUrl)) {
    die('deploy/production.json webAppUrl is not a production /exec URL yet (LAUNCH.md §1.5). For a test build use --preview.');
  }
  if (webAppUrl.indexOf(STAGING_ID) !== -1) die('deploy/production.json webAppUrl is the STAGING web app.');
}

// --- a release is built from committed files only -------------------------------------------------
const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const commit = (git(['rev-parse', '--short=7', 'HEAD']).stdout || '').trim() || 'nogit';
const dirty = (git(['status', '--porcelain', '--', 'public', 'deploy', 'tools/release']).stdout || '').trim();
if (dirty && !PREVIEW) die('uncommitted changes in public/, deploy/ or tools/release/ — commit first:\n' + dirty);
const version = commit + (dirty ? '-dirty' : '');

// --- copy public/ (without Netlify's _headers) ------------------------------------------------------
fs.rmSync(SITE, { recursive: true, force: true });
const SKIP = new Set(['_headers', '_redirects', '.DS_Store', 'Thumbs.db']);
(function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copy(a, b); else fs.copyFileSync(a, b);
  }
})(PUBLIC, SITE);

// --- config.js: the production web app ---------------------------------------------------------------
const cfgFile = path.join(SITE, 'assets/js/config.js');
const cfg = fs.readFileSync(cfgFile, 'utf8');
if ((cfg.match(/webAppUrl:\s*'[^']*'/g) || []).length !== 1) die('config.js: expected exactly one webAppUrl');
fs.writeFileSync(cfgFile, cfg.replace(/webAppUrl:\s*'[^']*'/, () => "webAppUrl: '" + webAppUrl + "'"));

// --- HTML: asset versions, canonical URLs, Content-Security-Policy ------------------------------------
const INDEXABLE = { 'index.html': '/', 'apply-visa.html': '/apply-visa.html', 'customize-umrah.html': '/customize-umrah.html' };
const pages = fs.readdirSync(SITE).filter((f) => f.endsWith('.html'));
const inline = new Set();
for (const f of pages) {
  const s = fs.readFileSync(path.join(SITE, f), 'utf8');
  for (const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g)) inline.add(m[1]);
  if (/<script[^>]*\son\w+=|\son(click|load|error|submit|change)=/i.test(s)) die(f + ': inline event handlers are not allowed (CSP)');
}
const hashes = [...inline].map((src) => "'sha256-" + crypto.createHash('sha256').update(src, 'utf8').digest('base64') + "'");
const CSP_BASE = [
  "default-src 'self'",
  "script-src 'self' " + hashes.join(' '),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];
const CSP_META = CSP_BASE.join('; '); // frame-ancestors and upgrade-insecure-requests only work as a header
const CSP_HEADER = CSP_BASE.concat(["frame-ancestors 'none'", 'upgrade-insecure-requests']).join('; ');

for (const f of pages) {
  const file = path.join(SITE, f);
  let s = fs.readFileSync(file, 'utf8');
  // every local stylesheet and script gets ?v=<commit>: cached for a year, refreshed by every release
  s = s.replace(/(\s(?:href|src))="(\/?assets\/[^"?#]+\.(?:css|js))"/g, (m, a, u) => a + '="' + u + '?v=' + version + '"');
  if (!s.includes('<meta charset="utf-8">')) die(f + ': no <meta charset="utf-8">');
  s = s.replace('<meta charset="utf-8">', () => '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="' + CSP_META + '">');
  if (INDEXABLE[f]) {
    const url = SITE_URL + INDEXABLE[f];
    if (/<meta name="robots"[^>]*noindex/.test(s)) die(f + ' is indexable but has noindex');
    s = s.replace(/(<meta name="description"[^>]*>)/, (m) => m + '\n<link rel="canonical" href="' + url + '">');
    if (s.includes('<meta property="og:type"')) s = s.replace(/(<meta property="og:type"[^>]*>)/, (m) => m + '\n<meta property="og:url" content="' + url + '">');
    if (!s.includes('rel="canonical"')) die(f + ': canonical not added');
  } else if (!/<meta name="robots" content="noindex">/.test(s)) {
    die(f + ': not in the sitemap, so it must have <meta name="robots" content="noindex">');
  }
  fs.writeFileSync(file, s);
}

// --- robots.txt, sitemap.xml ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(SITE, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE_URL + '/sitemap.xml\n');
fs.writeFileSync(path.join(SITE, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  Object.values(INDEXABLE).map((u) => '  <url><loc>' + SITE_URL + u + '</loc><lastmod>' + today + '</lastmod></url>\n').join('') + '</urlset>\n');

// --- .htaccess (Hostinger runs LiteSpeed, which reads it) ------------------------------------------------
const HSTS = Number(prod.hstsMaxAge) || 86400; // LAUNCH.md: 1 day first, 31536000 (1 year) after a week; no preload
fs.writeFileSync(path.join(SITE, '.htaccess'), `# Elite Global World Travel & Tours — production (Hostinger). Generated by tools/release/build.js
# (release ${version}, ${today}). Do not edit it on the server: change the build and upload a new release.

Options -Indexes
DirectoryIndex index.html
ErrorDocument 404 /404.html
AddDefaultCharset utf-8
AddType image/webp .webp
AddType font/woff2 .woff2

<IfModule mod_rewrite.c>
RewriteEngine On
# one 301 to https://elitetravelng.com/ — http → https and www → the bare domain in a single step
# (the certificate check under /.well-known/ is never redirected)
RewriteCond %{REQUEST_URI} !^/\\.well-known/
RewriteCond %{HTTPS} off [OR]
RewriteCond %{HTTP_HOST} !^elitetravelng\\.com$ [NC]
RewriteRule ^(.*)$ https://elitetravelng.com/$1 [R=301,L]
# hidden files (.htaccess, .git …) and files that are never part of the site
RewriteRule (^|/)\\.(?!well-known/) - [F,L]
RewriteRule \\.(md|map|zip|bak|log|ps1|sh|txt~)$ - [F,L]
</IfModule>

<IfModule mod_headers.c>
Header always set Strict-Transport-Security "max-age=${HSTS}"
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set X-Frame-Options "DENY"
Header always set Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
Header always set Cross-Origin-Opener-Policy "same-origin"
Header always set Content-Security-Policy "${CSP_HEADER}"

# HTML: always checked again (a new release shows at once)
<FilesMatch "\\.html$">
Header set Cache-Control "no-cache"
</FilesMatch>
# CSS/JS (linked with ?v=<release>) and fonts: one year
<FilesMatch "\\.(css|js|woff2)$">
Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>
# images, airport list, sitemap: one week
<FilesMatch "\\.(webp|jpg|jpeg|png|svg|ico|json)$">
Header set Cache-Control "public, max-age=604800"
</FilesMatch>
<FilesMatch "\\.(xml|txt)$">
Header set Cache-Control "public, max-age=3600"
</FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
AddOutputFilterByType DEFLATE text/html text/css text/plain text/xml application/xml application/javascript application/json image/svg+xml
</IfModule>
`);

// --- file list, removed files, zip -------------------------------------------------------------------------
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(path.relative(SITE, p).split(path.sep).join('/')); } })(SITE);
files.sort();
console.log('release/site: ' + files.length + ' files, version ' + version + (PREVIEW ? ' (PREVIEW — staging web app, do not upload)' : ''));
if (PREVIEW) { console.log('Next: node tools/release/check.js --preview'); process.exit(0); }

const manifest = path.join(OUT, 'last-release.json');
const prev = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : null;
const removed = prev ? prev.files.filter((f) => files.indexOf(f) === -1) : [];
const zip = path.join(OUT, 'elitetravelng-' + today.replace(/-/g, '') + '-' + commit + '.zip');
fs.rmSync(zip, { force: true });
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar';
const z = spawnSync(tar, ['-a', '-c', '-f', zip, '-C', SITE].concat(fs.readdirSync(SITE)), { encoding: 'utf8' });
if (z.status !== 0) die('zip failed: ' + (z.stderr || z.error));
fs.writeFileSync(manifest, JSON.stringify({ version, date: today, webAppUrl, zip: path.basename(zip), files }, null, 1));
const notes = ['Release ' + version + ' — ' + today, 'Web app: ' + webAppUrl, 'Zip: ' + path.basename(zip) + ' (' + files.length + ' files)', '',
  'Upload: hPanel → Websites → elitetravelng.com → File Manager → public_html → Upload the zip → right-click → Extract (into public_html) → delete the zip.',
  removed.length ? 'Delete these files on the server by hand (they are no longer part of the site):\n  ' + removed.join('\n  ') : 'No files were removed since the last release.', '',
  'Then: node tools/release/check-live.js'];
fs.writeFileSync(path.join(OUT, 'RELEASE-NOTES.txt'), notes.join('\n') + '\n');
console.log(notes.join('\n'));
console.log('\nNext: node tools/release/check.js');
