// Builds the site.  node build.js  ->  dist/ (the real site, one page per tool) and preview.html (single file).
const fs = require('fs'), path = require('path');
const { site, cats, tools } = require('./tools.js');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ready = tools.filter(t => t.ready);
const css = fs.readFileSync('src/style.css', 'utf8'), js = fs.readFileSync('src/app.js', 'utf8');
const LOGO = '<span class="ico ico-logo" aria-hidden="true"></span>';
const iconCss = m => ['logo', ...cats.map(c => c[0])].map(n => { const u = m.img(n === 'logo' ? 'logo.png' : `icons/${n}.png`); return `.ico-${n}{-webkit-mask-image:url(${u});mask-image:url(${u})}`; }).join('\n');
const FACES = [['IBM Plex Sans', 'ibm-plex-sans', [400, 500, 600]], ['Bricolage Grotesque', 'bricolage-grotesque', [600, 700]]];
const fontCss = FACES.map(([fam, file, ws]) => ws.map(w => `@font-face{font-family:"${fam}";font-weight:${w};font-display:swap;src:url(/fonts/${file}-latin-${w}-normal.woff2) format("woff2")}`).join('\n')).join('\n');
const GOOGLE_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">';
const sizePages = ready.filter(t => t.engine === 'compress-pdf');
const GENERIC_FAQ = [
  ['Are my files uploaded?', `No. ${site.name} runs in your browser, so the file is read and changed on your own device. It is never sent to us or anyone else.`],
  ['Is it free?', 'Yes. There is no sign-up, no page limit and no watermark added to your file.'],
];
const steps = t => {
  const eng = t.engine || t.slug, img = /jpg-to|scan/.test(eng), many = /merge|jpg-to|scan|compare/.test(eng);
  return [`Choose your ${img ? 'photo' : 'PDF'}${many ? 's' : ''}, or drop ${many ? 'them' : 'it'} onto the page.`, t.step, 'Download the result. Nothing was uploaded at any point.'];
};

// m.href(slug) gives the link for a page: "/merge-pdf/" on the real site, "#merge-pdf" in the preview.
function header(m) {
  return `<header class="top"><div class="top-in"><a class="brand" href="${m.href('')}">${LOGO}${esc(site.name)}</a>
<nav aria-label="Main"><a href="${m.href('tools')}">All tools</a><a class="wide" href="${m.href('compress-pdf')}">Compress</a><a class="wide" href="${m.href('merge-pdf')}">Merge</a><a href="${m.href('security')}">Security</a></nav></div></header>`;
}
function footer(m) {
  return `<footer><div class="foot-in"><span>${esc(site.name)}. Your files stay on your device.</span><span class="foot-links">${[['tools', 'All tools'], ['security', 'Security'], ['privacy', 'Privacy'], ['terms', 'Terms'], ['about', 'About']].map(([s, l]) => `<a href="${m.href(s)}">${l}</a>`).join('')}</span></div></footer>`;
}
function grid(m, all) {
  return cats.map(([id, label]) => {
    const list = tools.filter(t => t.cat === id && (all || !t.hidden)); if (!list.length) return '';
    return `<section class="cat"><h2><span class="ico ico-${id}" aria-hidden="true"></span>${esc(label)}</h2><div class="grid">${list.map(t => t.ready
      ? `<a class="card" href="${m.href(t.slug)}"><b>${esc(t.name)}</b><span>${esc(t.short)}</span></a>`
      : `<div class="card soon"><b>${esc(t.name)} <span class="pill">Soon</span></b><span>${esc(t.short)}</span></div>`).join('')}</div></section>`;
  }).join('\n');
}
function home(m) {
  return `<section class="hero"><div><h1>PDF tools that never upload your files</h1>
<p class="lede">Compress, merge, fill, sign and convert PDFs right in your browser. Free, with no sign-up and no file limits.</p></div>
<img src="${m.img('phone.png')}" width="640" height="871" alt="PDF pages being merged, split and signed inside a phone"></section>
<section><div class="proof">
<div class="them"><h2>Most PDF sites</h2><ul><li>Send your file to their servers</li><li>Make you wait for the upload and the download</li><li>Often cap file size or daily use unless you pay</li></ul></div>
<div class="us"><h2>${esc(site.name)}</h2><ul><li>Your file stays on your device</li><li>Starts working the moment you pick a file</li><li>No sign-up, no limits, no watermark</li></ul></div>
</div><p class="try"><b>Check it yourself:</b> open any tool, wait a moment, switch your device to airplane mode, then use it. It still works, because nothing is sent anywhere. <a href="${m.href('security')}">How it works</a></p></section>
<section class="more"><h2>Popular jobs</h2><div class="links">${[['compress-pdf-to-1mb', 'Compress a PDF to 1 MB'], ['fill-and-sign-pdf', 'Fill and sign a form'], ['heic-to-pdf', 'iPhone photos to one PDF'], ['merge-pdf', 'Merge PDFs'], ['protect-pdf', 'Password-protect a PDF']].map(([s, l]) => `<a href="${m.href(s)}">${l}</a>`).join('')}</div></section>
${grid(m, false)}`;
}
function toolsPage(m) {
  return `<section><p class="crumb"><a href="${m.href('')}">Home</a> / Tools</p><h1>All PDF tools</h1>
<p class="lede">${ready.length} tools that work in your browser, with more on the way. None of them upload your file.</p></section>
${grid(m, true)}`;
}
function toolPage(t, m) {
  const eng = t.engine || t.slug, faq = t.faq.concat(GENERIC_FAQ), st = steps(t);
  const others = ready.filter(o => o.slug !== t.slug && !o.hidden).sort((a, b) => (b.cat === t.cat) - (a.cat === t.cat)).slice(0, 8);
  const sizes = eng === 'compress-pdf' ? `<section class="more"><h2>Compress to an exact size</h2><div class="links">${sizePages.filter(o => o.slug !== t.slug).map(o => `<a href="${m.href(o.slug)}">${esc(o.name.replace('Compress PDF to', 'Under'))}</a>`).join('')}${t.slug !== 'compress-pdf' ? `<a href="${m.href('compress-pdf')}">Any size or quality</a>` : ''}</div></section>` : '';
  return `<section><p class="crumb"><a href="${m.href('')}">Home</a> / <a href="${m.href('tools')}">Tools</a> / ${esc(t.name)}</p><h1>${esc(t.h1 || t.name)}</h1>
<p class="lede">${esc(t.short)} Free, with no sign-up, and your file never leaves your device.</p>${t.intro ? `<p class="intro">${esc(t.intro)}</p>` : ''}</section>
<div class="tool" data-tool="${eng}" data-key="${t.slug}"${t.preset ? ` data-preset="${esc(JSON.stringify(t.preset))}"` : ''}><noscript>This tool needs JavaScript, because it works on your file inside your browser instead of uploading it.</noscript></div>
<section class="how"><h2>How to use ${esc(t.name)}</h2><ol>${st.map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>
${sizes}<section class="faq"><h2>Questions</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
<section class="more"><h2>More tools</h2><div class="links">${others.map(o => `<a href="${m.href(o.slug)}">${esc(o.name)}</a>`).join('')}</div></section>`;
}
const prose = (title, lede, body) => `<section class="prose"><h1>${title}</h1><p class="lede">${lede}</p>${body}</section>`;
const privacy = () => prose('Privacy', 'The short version: we cannot see your files, because they never reach us.', `
<h2>Your files</h2><ul><li>Every tool runs inside your browser. Your file is opened, changed and saved on your own device.</li><li>Files, passwords and signatures are not uploaded, stored or shared. When you close the tab they are gone from the page.</li></ul>
<h2>What we do receive</h2><ul><li>Like any website, our hosting provider logs basic visit details such as IP address, browser type and the page requested.</li><li>There are no accounts, so we hold no names, emails or passwords.</li><li>The site loads no adverts, trackers or third-party scripts.</li></ul>
<h2>Changes</h2><p>If we add analytics, adverts or paid features, this page will be updated first to say exactly what they collect.</p>`);
const security = m => prose('Security', 'How the tools work, and how you can check our claims yourself.', `
<h2>Everything happens on your device</h2><p>When you pick a file, your browser reads it straight from your device. The PDF work is done by code running in the page. The result is saved back to your device. There is no upload step and no copy on a server, so there is nothing for us to delete later.</p>
<h2>Check it yourself</h2><ul><li><b>Airplane mode:</b> open a tool, wait a couple of seconds for it to finish loading, then turn off your internet connection and use the tool. It still works.</li><li><b>Network tab:</b> on a computer, open your browser's developer tools, choose Network, and use a tool. You will see the page and its code load, and no request carrying your file.</li></ul>
<h2>Locked down by design</h2><p>The site sends a security rule to your browser that stops its pages from contacting any other server. Even if our code had a mistake, your browser would refuse to send a file elsewhere.</p>
<h2>What we cannot protect</h2><ul><li>Your own device. If it has malware, or someone else can use it, your files are only as safe as the device.</li><li>Passwords you choose. A protected PDF is as strong as its password.</li><li>Very large files. The work uses your device's memory, so huge files can fail on older phones. The original is never changed.</li></ul>
<h2>The code we rely on</h2><p>The tools are built on open-source projects that anyone can inspect: pdf-lib, PDF.js, JSZip and heic-to. They are served from this site, not from another company's network.</p>
<p>Read the <a href="${m.href('privacy')}">privacy page</a> for what the site itself records.</p>`);
const terms = () => prose('Terms of use', 'Plain terms for a free tool.', `
<h2>Using the tools</h2><ul><li>The tools are free to use for personal and work documents.</li><li>Only work on files you have the right to use. Unlock PDF is for removing a password you already know.</li><li>Do not use the site to break the law or to harm others.</li></ul>
<h2>Your files are your responsibility</h2><ul><li>Keep your original files. The tools give you a new copy and cannot recover a lost original or a forgotten password.</li><li>Check every result before you rely on it, especially compressed, redacted or signed documents.</li></ul>
<h2>Signatures</h2><p>Sign PDF and Fill &amp; Sign place a drawn signature on the page. They are not a certified electronic-signature service. Whether a drawn signature is accepted depends on the document and the law where you live.</p>
<h2>No warranty</h2><p>The site is provided as it is, without any guarantee that it will be available, free of errors or suitable for a particular purpose. To the extent the law allows, we are not liable for loss arising from its use.</p>
<h2>Changes</h2><p>These terms may change as the site grows. The current version is always on this page.</p>`);
const about = m => prose(`About ${esc(site.name)}`, 'A free set of PDF tools that respects the fact that your documents are yours.', `
<h2>Why it exists</h2><p>The files people need to compress, sign or merge are often the most private ones they have: IDs, bank letters, contracts, job applications. Most PDF sites need those files sent to their servers. This one does the same jobs inside your browser, so the file stays with you.</p>
<h2>What you get</h2><ul><li>No upload, ever.</li><li>No account, no daily limit and no watermark.</li><li>Honest tools. Where a job has a trade-off, such as compression turning text into images, the tool says so before you run it.</li></ul>
<h2>How it is paid for</h2><p>The site is free. If adverts or paid extras are ever added, they will be explained here and on the <a href="${m.href('privacy')}">privacy page</a> first.</p>
<p>See <a href="${m.href('security')}">how it works</a> or go to <a href="${m.href('tools')}">all tools</a>.</p>`);
const PAGES = [
  ['tools', toolsPage, 'All PDF Tools - Free, With No Upload', 'Every PDF tool on the site in one place: compress, merge, split, convert, fill, sign and protect. All run in your browser with no upload.'],
  ['security', security, `Security: How ${site.name} Keeps Files on Your Device`, 'How the tools process PDFs inside your browser, how to verify that nothing is uploaded, and what the site cannot protect.'],
  ['privacy', privacy, `Privacy | ${site.name}`, `How ${site.name} handles your files: it does not receive them.`],
  ['terms', terms, `Terms of Use | ${site.name}`, `The terms for using ${site.name}, in plain language.`],
  ['about', about, `About ${site.name}`, `Why ${site.name} exists: free PDF tools that work in your browser so private documents stay private.`],
];
function doc(o) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title><meta name="description" content="${esc(o.desc)}">
${o.canon ? `<link rel="canonical" href="${o.canon}"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.desc)}"><meta property="og:url" content="${o.canon}"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(site.name)}"><meta property="og:image" content="${site.domain}/images/share.jpg"><meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="${o.m.img('icon-64.png')}"><link rel="apple-touch-icon" href="${o.m.img('icon-180.png')}">
${o.head}${o.ld ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': o.ld }).replace(/</g, '\\u003c')}</script>` : ''}</head><body>
${o.body}
${o.tail || ''}</body></html>`;
}

/* ---------- real site: dist/ ---------- */
const D = 'dist', m = { href: s => s ? `/${s}/` : '/', img: f => '/images/' + f }, U = s => site.domain + m.href(s);
fs.rmSync(D, { recursive: true, force: true });
const put = (p, s) => { fs.mkdirSync(path.dirname(path.join(D, p)), { recursive: true }); fs.writeFileSync(path.join(D, p), s); };
const HEAD = '<link rel="preload" href="/fonts/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/style.css">';
const cfg = JSON.stringify({ name: site.name, libs: { pdflib: '/vendor/pdf-lib.min.js', pdfjs: '/vendor/pdf.min.js', zip: '/vendor/jszip.min.js', heic: '/vendor/heic-to.js', worker: '/vendor/pdf.worker.min.js' } });
const SCRIPTS = `<script type="application/json" id="site">${cfg}</script><script src="/assets/app.js" defer></script>`;
const wrap = main => `${header(m)}<main>${main}</main>${footer(m)}`;
const crumbs = list => ({ '@type': 'BreadcrumbList', itemListElement: list.map(([name, s], i) => ({ '@type': 'ListItem', position: i + 1, name, item: U(s) })) });
const app = (name, s, desc) => ({ '@type': 'SoftwareApplication', name, url: U(s), description: desc, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (runs in a web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } });
const homeDesc = 'Compress, merge, split, convert, fill and sign PDFs in your browser. Free, no sign-up, no limits, and your files never leave your device.';
put('index.html', doc({
  title: `${site.name}: Free PDF Tools That Never Upload Your Files`, desc: homeDesc, canon: U(''), m, head: HEAD, body: wrap(home(m)),
  ld: [{ '@type': 'Organization', name: site.name, url: U(''), logo: site.domain + '/images/icon-180.png' }, { '@type': 'WebSite', name: site.name, url: U('') }, app(site.name, '', homeDesc)],
}));
for (const [slug, fn, title, desc] of PAGES) put(`${slug}/index.html`, doc({ title, desc, canon: U(slug), m, head: HEAD, body: wrap(fn(m)), ld: [crumbs([['Home', ''], [title.split(/ [-|:] |: /)[0], slug]])] }));
for (const t of ready) {
  const desc = t.meta || `${t.short} Free, no sign-up, and your file never leaves your device.`;
  put(`${t.slug}/index.html`, doc({
    title: t.meta ? t.title : `${t.title} | ${site.name}`, desc, canon: U(t.slug), m, head: HEAD, body: wrap(toolPage(t, m)), tail: SCRIPTS,
    ld: [app(t.name, t.slug, desc),
      { '@type': 'HowTo', name: `How to use ${t.name}`, step: steps(t).map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text })) },
      { '@type': 'FAQPage', mainEntity: t.faq.concat(GENERIC_FAQ).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      crumbs([['Home', ''], ['Tools', 'tools'], [t.name, t.slug]])],
  }));
}
put('assets/style.css', fontCss + '\n' + css + '\n' + iconCss(m)); put('assets/app.js', js);
for (const dir of ['images', 'vendor', 'fonts']) fs.cpSync(dir, path.join(D, dir), { recursive: true });
const urls = ['', ...PAGES.map(p => p[0]), ...ready.map(t => t.slug)];
put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(s => `<url><loc>${U(s)}</loc></url>`).join('\n')}\n</urlset>\n`);
put('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site.domain}/sitemap.xml\n`);
// The page may only talk to this site. It cannot send a file to any other server, even by mistake.
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'";
put('_headers', `/*\n  Content-Security-Policy: ${CSP}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/vendor/*\n  Cache-Control: public, max-age=31536000, immutable\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n`);

/* ---------- single-file preview ---------- */
const s = { href: x => '#' + (x || 'home'), img: f => 'images/' + f }, CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const pages = [`<div data-page="home">${home(s)}</div>`].concat(PAGES.map(([slug, fn]) => `<div data-page="${slug}" hidden>${fn(s)}</div>`), ready.map(t => `<div data-page="${t.slug}" hidden>${toolPage(t, s)}</div>`)).join('\n');
const pcfg = { name: site.name, single: true, libs: { pdflib: 'https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.11.1/dist/pdf-lib.min.js', pdfjs: `${CDN}/pdf.js/3.11.174/pdf.min.js`, zip: `${CDN}/jszip/3.10.1/jszip.min.js`, heic: 'https://cdn.jsdelivr.net/npm/heic-to@1.6.7/dist/csp/heic-to.js', worker: `${CDN}/pdf.js/3.11.174/pdf.worker.min.js` } };
fs.writeFileSync('preview.html', doc({
  title: `${site.name} preview`, desc: site.tagline, m: s, head: `${GOOGLE_FONTS}<style>${css}\n${iconCss(s)}\n[data-page]{display:flex;flex-direction:column;gap:36px}</style>`,
  body: `${header(s)}<main>${pages}</main>${footer(s)}`,
  tail: `<script type="application/json" id="site">${JSON.stringify(pcfg)}</script>\n<script>${js.replace(/<\/script/g, '<\\/script')}</script>`,
}));
console.log(`Built ${ready.length} tool pages and ${PAGES.length + 1} other pages into dist/, plus preview.html (${Math.round(fs.statSync('preview.html').size / 1024)} KB)`);
