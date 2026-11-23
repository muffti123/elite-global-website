#!/usr/bin/env node
/*
 * Read-only checks of the LIVE website after an upload (docs/LAUNCH.md §2.5). GET/HEAD requests only: no form is
 * ever submitted, nothing is written anywhere (this is not the live QA suite). No dependencies.
 *   node tools/release/check-live.js              https://elitetravelng.com (+ its web app health check)
 *   node tools/release/check-live.js --staging    staging on Netlify: noindex header only
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DOMAIN = 'https://elitetravelng.com';
let fails = 0;
const ok = (n, c, info) => { console.log((c ? 'PASS  ' : 'FAIL  ') + n + (c || !info ? '' : '  — ' + info)); if (!c) fails++; };
const get = async (url, opts = {}) => {
  try { return await fetch(url, Object.assign({ redirect: 'manual', headers: { 'User-Agent': 'elite-global-release-check' } }, opts)); }
  catch (e) { return { status: 0, error: String(e.cause && e.cause.code || e.message), headers: new Headers(), text: async () => '' }; }
};

(async () => {
  if (process.argv.includes('--staging')) {
    const r = await get('https://elite-global-staging.netlify.app/');
    ok('staging answers 200 with X-Robots-Tag: noindex, nofollow (public/_headers)', r.status === 200 && /noindex/.test(r.headers.get('x-robots-tag') || ''), r.status + ' ' + r.headers.get('x-robots-tag'));
    process.exit(fails ? 1 : 0);
  }
  const prod = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy/production.json'), 'utf8'));

  // redirects: one 301 each, straight to the bare https domain
  for (const from of ['http://elitetravelng.com/', 'http://www.elitetravelng.com/', 'https://www.elitetravelng.com/', 'http://elitetravelng.com/apply-visa.html']) {
    const r = await get(from);
    const want = DOMAIN + '/' + from.replace(/^https?:\/\/(www\.)?elitetravelng\.com\//, '');
    ok(from + ' → one 301 to ' + want, r.status === 301 && r.headers.get('location') === want, r.status + ' ' + (r.headers.get('location') || r.error || ''));
  }

  // pages
  const pages = { '/': 'canonical', '/apply-visa.html': 'canonical', '/customize-umrah.html': 'canonical', '/track.html': 'noindex', '/correct-visa.html': 'noindex' };
  let home = null;
  for (const p of Object.keys(pages)) {
    const r = await get(DOMAIN + p);
    const s = r.status === 200 ? await r.text() : '';
    if (p === '/') home = r;
    ok(p + ' → 200, ' + (pages[p] === 'canonical' ? 'canonical ' + DOMAIN + p : 'noindex'), r.status === 200 &&
      (pages[p] === 'canonical' ? s.includes('<link rel="canonical" href="' + DOMAIN + p + '">') : /<meta name="robots" content="noindex">/.test(s)), r.status + (r.error ? ' ' + r.error : ''));
  }
  const hd = (n) => (home && home.headers.get(n)) || '';
  ok('HSTS max-age=' + (prod.hstsMaxAge || 86400) + ' (no preload)', hd('strict-transport-security') === 'max-age=' + (prod.hstsMaxAge || 86400), hd('strict-transport-security'));
  ok('X-Content-Type-Options nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy', hd('x-content-type-options') === 'nosniff' &&
    hd('referrer-policy') === 'strict-origin-when-cross-origin' && hd('x-frame-options') === 'DENY' && /camera=\(\)/.test(hd('permissions-policy')));
  ok('Content-Security-Policy header with frame-ancestors \'none\'', /default-src 'self'/.test(hd('content-security-policy')) && /frame-ancestors 'none'/.test(hd('content-security-policy')), hd('content-security-policy'));
  ok('HTML: Cache-Control no-cache', /no-cache/.test(hd('cache-control')), hd('cache-control'));

  // config.js → the production web app; cached for a year (versioned link)
  const html = home && home.status === 200 ? await (await get(DOMAIN + '/')).text() : '';
  const cfgPath = (/src="(assets\/js\/config\.js\?v=[^"]+)"/.exec(html) || [])[1];
  const cfgRes = cfgPath ? await get(DOMAIN + '/' + cfgPath) : { status: 0, headers: new Headers(), text: async () => '' };
  const cfg = cfgRes.status === 200 ? await cfgRes.text() : '';
  const url = (/webAppUrl:\s*'([^']*)'/.exec(cfg) || [])[1] || '';
  ok('config.js (?v=…) points at the production web app (deploy/production.json)', !!url && url === prod.webAppUrl, url || cfgRes.status);
  ok('… and is cached for a year (immutable)', /max-age=31536000/.test(cfgRes.headers.get('cache-control') || '') && /immutable/.test(cfgRes.headers.get('cache-control') || ''), cfgRes.headers.get('cache-control'));
  const img = await get(DOMAIN + '/assets/img/hero-1600.webp', { method: 'HEAD' });
  ok('images: cached for a week', img.status === 200 && /max-age=604800/.test(img.headers.get('cache-control') || ''), img.status + ' ' + img.headers.get('cache-control'));
  const logo = await get(DOMAIN + '/assets/brand/email-logo.png', { method: 'HEAD' });
  ok('email logo online (emails load it from SITE_URL)', logo.status === 200 && /image\/png/.test(logo.headers.get('content-type') || ''), logo.status);

  // 404, robots, sitemap, hidden files
  const nf = await get(DOMAIN + '/no-such-page-' + Date.now());
  ok('a missing page → 404 with our "Page not found" page', nf.status === 404 && /Page not found/.test(await nf.text()), nf.status);
  const robots = await get(DOMAIN + '/robots.txt');
  ok('robots.txt names the sitemap', robots.status === 200 && (await robots.text()).includes('Sitemap: ' + DOMAIN + '/sitemap.xml'), robots.status);
  const sm = await get(DOMAIN + '/sitemap.xml');
  ok('sitemap.xml lists the 3 indexable pages', sm.status === 200 && ((await sm.text()).match(/<loc>/g) || []).length === 3, sm.status);
  for (const hidden of ['/.htaccess', '/assets/.htaccess', '/README.md']) {
    const r = await get(DOMAIN + hidden);
    ok(hidden + ' is not served', r.status === 403 || r.status === 404, r.status);
  }

  // the web app health check (GET, read-only)
  if (prod.webAppUrl) {
    const r = await get(prod.webAppUrl, { redirect: 'follow' });
    let j = null; try { j = JSON.parse(await r.text()); } catch (e) { j = null; }
    ok('production web app health check: ok, schema 9' + (j && j.paused ? ' (⏸ FORMS PAUSED)' : ''), !!j && j.ok === true && j.schema === 9, JSON.stringify(j));
    ok('… forms are not paused', !!j && !j.paused);
  } else ok('deploy/production.json has the production webAppUrl', false, 'empty');

  console.log(fails ? '\n❌ ' + fails + ' check(s) failed.' : '\n✅ The live site checks passed.');
  process.exit(fails ? 1 : 0);
})();
