// assemble-dev-preview.mjs: turn kevinrhaas/chicago's published dev tree into
// this repository's Pages site, the dev preview at dev.chicago.polecat.live/4d/dev/.
//
//   node .github/assemble-dev-preview.mjs <chicago-dev-checkout> <sha> <committedIso> <out-site>
//
// WHY A SITE OF ITS OWN (2026-11-13). The dev preview used to live inside the
// production Pages artifact at chicago.polecat.live/4d/dev/. One GitHub Pages site
// is capped at 1 GB, and production plus the preview plus the landing films and the
// older viewers had reached it. Every dev deploy also had to re-download the exact
// live production artifact so it could leave production untouched, and when that
// artifact expired the preview froze. On its own site, the preview has its own 1 GB
// and touches nothing of production's.
//
// THE PATH STAYS /4d/dev/. The app has no root-absolute URLs (kevinrhaas/chicago
// .github/chicago-4d-dev-preview.mjs explains how that was measured), and about.js,
// year-pack.js and the offline service worker read "/4d/dev/" as "this is the dev
// tier". Keeping the same path on a new host keeps all of that true.
//
// NO ASSET ALIASES. Inside the shared artifact, dev GLBs identical to production's
// were served from /4d/. Production is on another origin now, so every file ships
// here as itself.
import { readFile, writeFile, cp, rm, readdir, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [srcRoot, sha = '', committedIso = '', outSite = 'site'] = process.argv.slice(2);
if (!srcRoot) {
  console.error('usage: node .github/assemble-dev-preview.mjs <chicago-dev-checkout> [sha] [committedIso] [out-site]');
  process.exit(2);
}
const PRODUCTION = 'https://chicago.polecat.live/4d/';
const HOST = 'dev.chicago.polecat.live';
const LIMIT = 1_000_000_000; // GitHub Pages: "no larger than 1 GB", read as 10^9 bytes

function ct(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  return `${d.toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).replace(/[  ]/g, ' ')} CT`;
}

const SRC = join(srcRoot, 'site/4d');
const OUT = join(outSite, '4d/dev');
if (!existsSync(join(SRC, 'walk/index.html'))) {
  console.error(`::error::${SRC} has no published app (walk/index.html); refusing an empty preview`);
  process.exit(1);
}
await rm(outSite, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const item of await readdir(SRC)) {
  if (['dev', '.git', 'node_modules'].includes(item)) continue;
  await cp(join(SRC, item), join(OUT, item), { recursive: true });
}

const stamp = `dev${sha ? `@${sha}` : ''}`;
const when = ct(committedIso);
const gateStamp = `DEV PREVIEW · ${stamp}${when ? ` · ${when}` : ''}`;
for (const file of await htmlFiles(OUT)) {
  let html = await readFile(file, 'utf8');
  if (/<meta[^>]*name="robots"/i.test(html)) {
    html = html.replace(/<meta[^>]*name="robots"[^>]*\/?>/gi, '<meta name="robots" content="noindex,nofollow">');
  } else {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n  <meta name="robots" content="noindex,nofollow">`);
  }
  html = html.replace(/<p class="gate-build" id="gate-build"[^>]*>.*?<\/p>/s,
    `<p class="gate-build" id="gate-build">${gateStamp}</p>`);
  if (!html.includes('id="__dev"')) html = html.replace(/<\/body>/i, `${banner(stamp)}\n</body>`);
  await writeFile(file, html);
}

await writeFile(join(OUT, 'build.json'), `${JSON.stringify({
  tier: 'dev',
  app: 'chicago/4d',
  ref: 'refs/heads/dev',
  sha,
  committedAt: committedIso || null,
  committedCT: when || null,
  host: HOST,
  note: `Integration preview on its own Pages site. Production is at ${PRODUCTION} and is promoted only on owner dispatch (chicago-4d-promote-to-prod.yml).`,
}, null, 2)}\n`);

// The whole host is a preview: keep all of it out of search.
await writeFile(join(outSite, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
await writeFile(join(outSite, 'CNAME'), `${HOST}\n`);
await writeFile(join(outSite, '.nojekyll'), '');
// Anything outside /4d/dev/ on this host goes to the preview, keeping the rest of
// the path, so dev.chicago.polecat.live/1904/ lands on /4d/dev/1904/.
const redirect = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">
<title>Chicago 4D dev preview</title>
<script>(function(){var l=location.pathname;if(/^\\/4d\\/dev\\//.test(l))return;var p=l.replace(/^\\/(4d\\/)?/,"");location.replace("/4d/dev/"+p+location.search+location.hash)})();</script>
<p>Not found. <a href="/4d/dev/">Open the dev preview</a></p>\n`;
await writeFile(join(outSite, 'index.html'), redirect);
await writeFile(join(outSite, '404.html'), redirect);

const bytes = await total(outSite);
console.log(`dev-preview: assembled ${OUT} from ${SRC}${sha ? ` (${sha})` : ''}: ${(bytes / 1048576).toFixed(3)} MiB`);
if (bytes > LIMIT) {
  console.error(`::error::the preview is ${bytes} bytes, over the ${LIMIT}-byte Pages limit`);
  process.exit(1);
}

async function htmlFiles(dir) {
  const out = [];
  for (const item of await readdir(dir)) {
    const p = join(dir, item);
    if ((await stat(p)).isDirectory()) out.push(...await htmlFiles(p));
    else if (item.endsWith('.html')) out.push(p);
  }
  return out;
}
async function total(dir) {
  let n = 0;
  for (const item of await readdir(dir)) {
    const p = join(dir, item), s = await stat(p);
    n += s.isDirectory() ? await total(p) : s.size;
  }
  return n;
}
function banner(rev) {
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif";
  return `<div id="__dev" role="status" style="position:fixed;left:0;right:0;top:0;z-index:2147483000;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;padding:5px 40px 5px 12px;font:600 12px ${FONT};color:#1a1503;background:linear-gradient(135deg,#fbbf24,#d97706);box-shadow:0 4px 16px rgba(0,0,0,.3)">
  <span><b>DEV PREVIEW</b> — ${rev} · not production, not indexed</span>
  <a href="${PRODUCTION}" style="color:#1a1503;text-decoration:underline">open production</a>
  <button id="__devmin" aria-label="Collapse the dev preview banner" title="Collapse" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:24px;height:24px;border:0;border-radius:50%;background:rgba(0,0,0,.22);color:#1a1503;font:700 13px/1 ${FONT};cursor:pointer">&times;</button>
</div>
<button id="__devpill" aria-label="Expand the dev preview banner" title="Dev preview" style="position:fixed;right:8px;top:8px;z-index:2147483000;display:none;border:0;border-radius:999px;padding:5px 11px;font:800 10px ${FONT};letter-spacing:.06em;color:#1a1503;background:linear-gradient(135deg,#fbbf24,#d97706);box-shadow:0 3px 12px rgba(0,0,0,.35);cursor:pointer">DEV</button>
<script>(function(){var K="__dev.min",b=document.getElementById("__dev"),p=document.getElementById("__devpill");function set(m){b.style.display=m?"none":"flex";p.style.display=m?"inline-block":"none";try{localStorage.setItem(K,m?"1":"0")}catch(e){}}document.getElementById("__devmin").onclick=function(){set(true)};p.onclick=function(){set(false)};try{if(localStorage.getItem(K)==="1")set(true)}catch(e){}})();</script>`;
}
