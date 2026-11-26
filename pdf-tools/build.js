// Builds the site.  node build.js  ->  dist/ (the real site, one page per tool) and preview.html (single file).
const fs = require('fs'), path = require('path');
const { site, cats, tools } = require('./tools.js');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ready = tools.filter(t => t.ready);
const css = fs.readFileSync('src/style.css', 'utf8'), js = fs.readFileSync('src/app.js', 'utf8');
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">';
const LOGO = '<svg viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="2" width="16" height="22" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 9h6M8 13h6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="19" cy="19" r="6" fill="var(--accent)"/><path d="M16.4 19.1l1.8 1.8 3.4-3.6" fill="none" stroke="var(--accent-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b6b52"/><path d="M9 16.5l5 5 9-10" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');

// mode.href(slug) gives the link for a page: "/merge-pdf/" on the real site, "#merge-pdf" in the preview.
function header(m) {
  return `<header class="top"><div class="top-in"><a class="brand" href="${m.href('')}">${LOGO}${esc(site.name)}</a>
<nav aria-label="Main"><a href="${m.href('')}">All tools</a><a class="wide" href="${m.href('merge-pdf')}">Merge</a><a class="wide" href="${m.href('compress-pdf')}">Compress</a><a href="${m.href('privacy')}">Privacy</a></nav></div></header>`;
}
function footer(m) {
  return `<footer><div class="foot-in"><span>${esc(site.name)}. Your files stay on your device.</span><span><a href="${m.href('privacy')}">Privacy</a></span></div></footer>`;
}
function home(m) {
  const groups = cats.map(([id, label]) => {
    const list = tools.filter(t => t.cat === id); if (!list.length) return '';
    return `<section class="cat"><h2>${esc(label)}</h2><div class="grid">${list.map(t => t.ready
      ? `<a class="card" href="${m.href(t.slug)}"><b>${esc(t.name)}</b><span>${esc(t.short)}</span></a>`
      : `<div class="card soon"><b>${esc(t.name)} <span class="pill">Soon</span></b><span>${esc(t.short)}</span></div>`).join('')}</div></section>`;
  }).join('\n');
  return `<section><h1>PDF tools that never upload your files</h1>
<p class="lede">Merge, split, compress, convert and sign PDFs right in your browser. Free, with no sign-up and no file limits.</p></section>
<section><div class="proof">
<div class="them"><h2>Most PDF sites</h2><ul><li>Send your file to their servers</li><li>Make you wait for the upload and the download</li><li>Often cap file size or daily use unless you pay</li></ul></div>
<div class="us"><h2>${esc(site.name)}</h2><ul><li>Your file stays on your device</li><li>Starts working the moment you pick a file</li><li>No sign-up, no limits, no watermark</li></ul></div>
</div><p class="try"><b>Check it yourself:</b> open any tool, switch your device to airplane mode, then use it. It still works, because nothing is sent anywhere.</p></section>
${groups}`;
}
function toolPage(t, m) {
  const cat = cats.find(c => c[0] === t.cat)[1], img = /jpg-to|scan/.test(t.slug), many = /merge|jpg-to|scan|compare/.test(t.slug);
  const faq = t.faq.concat([['Are my files uploaded?', `No. ${site.name} runs in your browser, so the file is read and changed on your own device. It is never sent to us or anyone else.`], ['Is it free?', 'Yes. There is no sign-up, no page limit and no watermark added to your file.']]);
  const others = ready.filter(o => o.slug !== t.slug).sort((a, b) => (b.cat === t.cat) - (a.cat === t.cat)).slice(0, 8);
  return `<section><p class="crumb"><a href="${m.href('')}">All tools</a> / ${esc(cat)}</p><h1>${esc(t.name)}</h1>
<p class="lede">${esc(t.short)} Free, with no sign-up, and your file never leaves your device.</p></section>
<div class="tool" data-tool="${t.slug}"><noscript>This tool needs JavaScript, because it works on your file inside your browser instead of uploading it.</noscript></div>
<section class="how"><h2>How to use ${esc(t.name)}</h2><ol><li>Choose your ${img ? 'image' : 'PDF'}${many ? 's' : ''}, or drop ${many ? 'them' : 'it'} onto the page.</li><li>${esc(t.step)}</li><li>Download the result. Nothing was uploaded at any point.</li></ol></section>
<section class="faq"><h2>Questions</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
<section class="more"><h2>More tools</h2><div class="links">${others.map(o => `<a href="${m.href(o.slug)}">${esc(o.name)}</a>`).join('')}</div></section>`;
}
function privacy() {
  return `<section class="prose"><h1>Privacy</h1>
<p class="lede">The short version: we cannot see your files, because they never reach us.</p>
<h2>Your files</h2><ul><li>Every tool runs inside your browser. Your file is opened, changed and saved on your own device.</li><li>Files are not uploaded, stored or shared. When you close the tab they are gone from the page.</li><li>You can test this: load a tool, turn on airplane mode, and it keeps working.</li></ul>
<h2>What we do receive</h2><ul><li>Like any website, our hosting provider logs basic visit details such as IP address, browser type and the page requested.</li><li>There are no accounts, so we hold no names, emails or passwords.</li></ul>
<h2>Changes</h2><p>If we add analytics, adverts or paid features, this page will be updated first to say exactly what they collect.</p></section>`;
}
function doc(o) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title><meta name="description" content="${esc(o.desc)}">
${o.canon ? `<link rel="canonical" href="${o.canon}"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}"><meta property="og:url" content="${o.canon}"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(site.name)}">` : ''}
<link rel="icon" href="${ICON}">${FONTS}
${o.head}</head><body>
${o.body}
${o.tail || ''}</body></html>`;
}

/* ---------- real site: dist/ ---------- */
const D = 'dist', m = { href: s => s ? `/${s}/` : '/' };
fs.rmSync(D, { recursive: true, force: true });
const put = (p, s) => { fs.mkdirSync(path.dirname(path.join(D, p)), { recursive: true }); fs.writeFileSync(path.join(D, p), s); };
const HEAD = '<link rel="stylesheet" href="/assets/style.css">';
const cfg = JSON.stringify({ name: site.name, worker: '/vendor/pdf.worker.min.js' });
const SCRIPTS = `<script type="application/json" id="site">${cfg}</script><script src="/vendor/pdf-lib.min.js" defer></script><script src="/vendor/pdf.min.js" defer></script><script src="/vendor/jszip.min.js" defer></script><script src="/assets/app.js" defer></script>`;
const wrap = (main, mm) => `${header(mm)}<main>${main}</main>${footer(mm)}`;
put('index.html', doc({ title: `${site.name}: free PDF tools that never upload your files`, desc: 'Merge, split, compress, convert and sign PDFs in your browser. Free, no sign-up, no limits, and your files never leave your device.', canon: site.domain + '/', head: HEAD, body: wrap(home(m), m) }));
put('privacy/index.html', doc({ title: `Privacy | ${site.name}`, desc: `How ${site.name} handles your files: it does not receive them.`, canon: site.domain + '/privacy/', head: HEAD, body: wrap(privacy(), m) }));
for (const t of ready) {
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: t.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  put(`${t.slug}/index.html`, doc({
    title: `${t.title} | ${site.name}`, desc: `${t.short} Free, no sign-up, and your file never leaves your device.`, canon: `${site.domain}/${t.slug}/`,
    head: HEAD + `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`, body: wrap(toolPage(t, m), m), tail: SCRIPTS,
  }));
}
put('assets/style.css', css); put('assets/app.js', js);
for (const f of fs.readdirSync('vendor')) fs.copyFileSync(path.join('vendor', f), (fs.mkdirSync(path.join(D, 'vendor'), { recursive: true }), path.join(D, 'vendor', f)));
put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['', ...ready.map(t => t.slug + '/'), 'privacy/'].map(p => `<url><loc>${site.domain}/${p}</loc></url>`).join('\n')}\n</urlset>\n`);
put('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site.domain}/sitemap.xml\n`);
// connect-src 'self' means the page is not able to send a file to any other server, even by mistake.
put('_headers', `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/vendor/*\n  Cache-Control: public, max-age=31536000, immutable\n`);

/* ---------- single-file preview ---------- */
const s = { href: x => '#' + (x || 'home') }, CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const pages = [`<div data-page="home">${home(s)}</div>`, `<div data-page="privacy" hidden>${privacy()}</div>`].concat(ready.map(t => `<div data-page="${t.slug}" hidden>${toolPage(t, s)}</div>`)).join('\n');
fs.writeFileSync('preview.html', doc({
  title: `${site.name} preview`, desc: site.tagline, head: `<style>${css}\n[data-page]{display:flex;flex-direction:column;gap:36px}</style>`,
  body: `${header(s)}<main>${pages}</main>${footer(s)}`,
  tail: `<script type="application/json" id="site">${JSON.stringify({ name: site.name, single: true, worker: `${CDN}/pdf.js/3.11.174/pdf.worker.min.js` })}</script>
<script src="${CDN}/pdf-lib/1.17.1/pdf-lib.min.js"></script><script src="${CDN}/pdf.js/3.11.174/pdf.min.js"></script><script src="${CDN}/jszip/3.10.1/jszip.min.js"></script>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>`,
}));
console.log(`Built ${ready.length} tool pages into dist/ and preview.html (${Math.round(fs.statSync('preview.html').size / 1024)} KB)`);
