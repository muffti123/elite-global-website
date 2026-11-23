#!/usr/bin/env node
/*
 * Checks the production release in release/site (and its zip) before it is uploaded (docs/LAUNCH.md §2.1).
 * Sends nothing. No dependencies.
 *   node tools/release/check.js            the release to upload
 *   node tools/release/check.js --preview  a preview build (staging web app allowed, no zip)
 * Then: cd tools/qa && node run.js static --root ../../release/site
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SITE = path.join(ROOT, 'release/site');
const PREVIEW = process.argv.includes('--preview');
const STAGING_ID = 'AKfycbzSBOiav81YF7eKJvqLaXJM1p2S6oRXeKVVhsGKgCtMfkdKZUrXr7cC0UQ-bRZ6kjtqXQ';
const DOMAIN = 'https://elitetravelng.com';
let fails = 0;
const ok = (n, c, info) => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c || !info ? '' : '  — ' + info)); if (!c) fails++; };
if (!fs.existsSync(path.join(SITE, 'index.html'))) { console.error('No release/site — run node tools/release/build.js first.'); process.exit(2); }

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(path.relative(SITE, p).split(path.sep).join('/')); } })(SITE);
const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
const text = files.filter((f) => /\.(html|js|css|json|txt|xml|svg)$|^\.htaccess$/.test(f));

// web app
const prod = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy/production.json'), 'utf8'));
const url = (/webAppUrl:\s*'([^']*)'/.exec(read('assets/js/config.js')) || [])[1] || '';
if (PREVIEW) ok('preview: config.js points at the staging web app (never upload a preview)', url.indexOf(STAGING_ID) !== -1);
else ok('config.js webAppUrl is the production web app from deploy/production.json', url && url === prod.webAppUrl && url.indexOf(STAGING_ID) === -1, url);

// nothing from staging, the developer account or third parties
const banned = [[/netlify/i, 'netlify'], [/eliteglobaltravelsng/i, 'old gmail address'], [/localhost|127\.0\.0\.1/, 'localhost'],
  [/docs\.google\.com\/forms|forms\.gle/i, 'Google Forms'], [/docs\.google\.com\/[^\s"']*\/edit|\/edit[#?"']/i, '/edit URL'], [/images\.unsplash\.com/i, 'Unsplash']];
if (!PREVIEW) banned.push([new RegExp(STAGING_ID), 'the staging web app']);
for (const [re, what] of banned) {
  const hits = text.filter((f) => re.test(read(f)));
  ok('no ' + what + ' anywhere in the release', hits.length === 0, hits.join(', '));
}
ok('no Netlify _headers, source maps or docs in the release', !files.some((f) => /(^|\/)_headers$|\.map$|\.md$/.test(f)));
ok('the company email is info@elitetravelng.com', /email:\s*'info@elitetravelng\.com'/.test(read('assets/js/config.js')));

// pages
const INDEXABLE = { 'index.html': '/', 'apply-visa.html': '/apply-visa.html', 'customize-umrah.html': '/customize-umrah.html' };
const pages = files.filter((f) => /^[^/]+\.html$/.test(f));
ok('pages: index, apply-visa, customize-umrah, track, correct-visa, 404', ['index.html', 'apply-visa.html', 'customize-umrah.html', 'track.html', 'correct-visa.html', '404.html'].every((p) => pages.indexOf(p) !== -1), pages.join(','));
for (const f of pages) {
  const s = read(f);
  const local = [...s.matchAll(/\s(?:href|src)="(\/?assets\/[^"]+\.(?:css|js)(?:\?[^"]*)?)"/g)].map((m) => m[1]);
  ok(f + ': every local CSS/JS link carries ?v=<release>', local.length > 0 && local.every((u) => /\?v=[0-9a-f]{7}/.test(u)), local.filter((u) => !/\?v=/.test(u)).join(' '));
  ok(f + ': Content-Security-Policy meta tag (connect-src Google Apps Script only)', /<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-[^"]*connect-src 'self' https:\/\/script\.google\.com https:\/\/script\.googleusercontent\.com;/.test(s));
  if (INDEXABLE[f]) ok(f + ': canonical ' + DOMAIN + INDEXABLE[f] + ', no noindex', s.includes('<link rel="canonical" href="' + DOMAIN + INDEXABLE[f] + '">') && !/noindex/.test(s));
  else ok(f + ': noindex, no canonical', /<meta name="robots" content="noindex">/.test(s) && !/rel="canonical"/.test(s));
}
ok('index.html: og:url is the domain', read('index.html').includes('<meta property="og:url" content="' + DOMAIN + '/">'));
ok('404.html uses absolute paths (works at any depth)', !/\s(?:href|src)="(?!\/|#|https?:|mailto:|tel:)/.test(read('404.html')));

// robots, sitemap, .htaccess
ok('robots.txt allows all and names the sitemap', /User-agent: \*\nAllow: \/\n/.test(read('robots.txt')) && read('robots.txt').includes('Sitemap: ' + DOMAIN + '/sitemap.xml'));
const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
ok('sitemap.xml lists exactly the 3 indexable pages', JSON.stringify(locs) === JSON.stringify(Object.values(INDEXABLE).map((u) => DOMAIN + u)), locs.join(' '));
const h = read('.htaccess');
const need = [
  ['one 301 to https://elitetravelng.com (http and www)', /RewriteCond %\{HTTPS\} off \[OR\]\nRewriteCond %\{HTTP_HOST\} !\^elitetravelng\\\.com\$ \[NC\]\nRewriteRule \^\(\.\*\)\$ https:\/\/elitetravelng\.com\/\$1 \[R=301,L\]/],
  ['/.well-known/ is never redirected (certificate renewal)', /RewriteCond %\{REQUEST_URI\} !\^\/\\\.well-known\//],
  ['hidden files blocked', /RewriteRule \(\^\|\/\)\\\.\(\?!well-known\/\) - \[F,L\]/],
  ['ErrorDocument 404 /404.html, no directory listings', /ErrorDocument 404 \/404\.html/.source + '[\\s\\S]*' ],
  ['HSTS max-age ' + (Number(prod.hstsMaxAge) || 86400) + ', no preload', new RegExp('Strict-Transport-Security "max-age=' + (Number(prod.hstsMaxAge) || 86400) + '"')],
  ['nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy', /nosniff[\s\S]*strict-origin-when-cross-origin[\s\S]*X-Frame-Options "DENY"[\s\S]*Permissions-Policy "geolocation=\(\), microphone=\(\), camera=\(\)/],
  ['CSP header with frame-ancestors \'none\'', /Content-Security-Policy "default-src 'self';[^"]*frame-ancestors 'none'; upgrade-insecure-requests"/],
  ['HTML no-cache; CSS/JS/fonts one year immutable; images one week', /\\\.html\$">\nHeader set Cache-Control "no-cache"[\s\S]*css\|js\|woff2\)\$">\nHeader set Cache-Control "public, max-age=31536000, immutable"[\s\S]*webp\|jpg[^"]*">\nHeader set Cache-Control "public, max-age=604800"/],
];
for (const [n, re] of need) ok('.htaccess: ' + n, (re instanceof RegExp ? re : new RegExp(re)).test(h) && /Options -Indexes/.test(h));
ok('.htaccess: no preload', !/preload/.test(h));
const metaCsp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(read('index.html')) || [])[1] || '';
ok('the CSP header = the CSP meta + frame-ancestors + upgrade-insecure-requests', h.includes('Content-Security-Policy "' + metaCsp + "; frame-ancestors 'none'; upgrade-insecure-requests\""));

// the zip
if (!PREVIEW) {
  const last = JSON.parse(fs.readFileSync(path.join(ROOT, 'release/last-release.json'), 'utf8'));
  const zip = path.join(ROOT, 'release', last.zip);
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar';
  const list = (spawnSync(tar, ['-t', '-f', zip], { encoding: 'utf8' }).stdout || '').split(/\r?\n/).filter((x) => x && !x.endsWith('/'));
  ok('zip ' + last.zip + ' holds every file of release/site (incl. .htaccess)', list.length === files.length && ['.htaccess', '404.html', 'robots.txt', 'sitemap.xml', 'index.html', 'assets/js/config.js'].every((f) => list.indexOf(f) !== -1), list.length + ' vs ' + files.length);
  ok('zip files sit at the top level (extract straight into public_html)', list.every((f) => !/^(site|release|public)\//.test(f)));
}
console.log(fails ? '\n❌ ' + fails + ' check(s) failed — do not upload.' : '\n✅ Release checks passed.' + (PREVIEW ? ' (preview — do not upload)' : '') + '\nNext: cd tools/qa && node run.js static --root ../../release/site');
process.exit(fails ? 1 : 0);
