/* All PDF work happens in this file, in the visitor's browser. Nothing is sent to a server. */
(function () {
  'use strict';
  const C = JSON.parse(document.getElementById('site').textContent);
  class Friendly extends Error {}
  // The PDF engine is loaded after the page has appeared, so the page itself shows fast.
  let L, pj, loading;
  const script = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res;
    s.onerror = () => rej(new Friendly('The PDF engine could not load. Check your connection and reload the page.'));
    document.head.append(s);
  });
  function engine() {
    return loading || (loading = Promise.all([script(C.libs.pdflib), script(C.libs.pdfjs), script(C.libs.zip)]).then(() => {
      L = window.PDFLib; pj = window.pdfjsLib; pj.GlobalWorkerOptions.workerSrc = C.libs.worker;
    }).catch(e => { loading = null; throw e; }));
  }

  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const stem = f => f.name.replace(/\.[^.]+$/, '');
  const size = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
  const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
  const pdfOut = (name, bytes) => ({ name, blob: new Blob([bytes], { type: 'application/pdf' }) });

  async function lib(f, opts) {
    try { return await L.PDFDocument.load(await f.arrayBuffer(), opts || {}); }
    catch (e) {
      if (/encrypt/i.test(e.message)) throw new Friendly(`"${f.name}" is password protected. Remove the password with Unlock PDF first, then try again.`);
      throw new Friendly(`"${f.name}" could not be read. It may be damaged. Try Repair PDF.`);
    }
  }
  async function view(f) {
    try { return await pj.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise; }
    catch (e) {
      if (e && e.name === 'PasswordException') throw new Friendly(`"${f.name}" is password protected. Remove the password first, then try again.`);
      throw new Friendly(`"${f.name}" could not be read. It may be damaged.`);
    }
  }
  // Render page n. Pass {scale} or {width} in pixels.
  async function draw(pdf, n, o) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: o.scale || o.width / base.width });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { canvas: c, w: base.width, h: base.height };
  }
  // "1-3, 5" -> [[0,1,2],[4]]
  function ranges(str, total) {
    const groups = [];
    for (const part of String(str || '').split(',')) {
      const s = part.trim(); if (!s) continue;
      const m = s.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if (!m) throw new Friendly(`"${s}" is not a page or a range. Write pages like 1-3, 5.`);
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (a < 1 || b < 1 || a > total || b > total) throw new Friendly(`This PDF has ${total} page${total === 1 ? '' : 's'}, so "${s}" is out of range.`);
      const g = []; for (let i = a; a <= b ? i <= b : i >= b; a <= b ? i++ : i--) g.push(i - 1);
      groups.push(g);
    }
    if (!groups.length) throw new Friendly('Type at least one page number.');
    return groups;
  }
  // Lets tools draw on a page as the reader sees it, whatever its rotation or crop.
  function frame(page) {
    const r = ((page.getRotation().angle % 360) + 360) % 360, b = page.getCropBox(), W = b.width, H = b.height;
    const vw = r % 180 ? H : W, vh = r % 180 ? W : H;
    const at = (vx, vy) => {
      const u = r === 0 ? [vx, vy] : r === 90 ? [W - vy, vx] : r === 180 ? [W - vx, H - vy] : [vy, H - vx];
      return { x: b.x + u[0], y: b.y + u[1] };
    };
    return { r, vw, vh, at };
  }
  // Redraw every page as a JPEG image.
  async function raster(f, dpi, q, p, paint) {
    const pdf = await view(f), out = await L.PDFDocument.create();
    for (let n = 1; n <= pdf.numPages; n++) {
      p(`Page ${n} of ${pdf.numPages}`);
      const d = await draw(pdf, n, { scale: dpi / 72 });
      if (paint) paint(n, d.canvas);
      const img = await out.embedJpg(await (await toBlob(d.canvas, 'image/jpeg', q)).arrayBuffer());
      out.addPage([d.w, d.h]).drawImage(img, { x: 0, y: 0, width: d.w, height: d.h });
    }
    return out.save();
  }
  async function pick(f, idx) {
    const src = await lib(f), out = await L.PDFDocument.create();
    (await out.copyPages(src, idx)).forEach(pg => out.addPage(pg));
    return out.save();
  }

  /* ---------- page viewer used by Sign and Redact ---------- */
  function pager(pdf, onShow) {
    let n = 1, busy = false, again = false, pw = 595;
    const cv = h('canvas'), ov = h('div', { class: 'pg-ov' }), wrap = h('div', { class: 'pg-wrap' }, cv, ov);
    const label = h('span', { class: 'pg-label' });
    const go = d => { const m = Math.min(pdf.numPages, Math.max(1, n + d)); if (m !== n) { n = m; show(); } };
    const el = h('div', { class: 'pg' },
      h('div', { class: 'pg-bar' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => go(-1), text: 'Previous page' }), label,
        h('button', { type: 'button', class: 'btn sm', onclick: () => go(1), text: 'Next page' })), wrap);
    async function show() {
      if (busy) { again = true; return; }
      busy = true;
      const cssW = Math.min(wrap.clientWidth || 600, 760);
      const d = await draw(pdf, n, { width: Math.min(2200, cssW * (window.devicePixelRatio || 1)) });
      cv.width = d.canvas.width; cv.height = d.canvas.height; cv.getContext('2d').drawImage(d.canvas, 0, 0);
      pw = d.w; label.textContent = `Page ${n} of ${pdf.numPages}`;
      ov.replaceChildren(); onShow(n, ov);
      busy = false; if (again) { again = false; show(); }
    }
    return { el, ov, show, get n() { return n; }, get pw() { return pw; } };
  }

  /* ---------- signature pad used by Sign and Fill & Sign ---------- */
  function sigPad(onChange) {
    const pad = h('canvas', { class: 'pad', width: 640, height: 240, 'aria-label': 'Draw your signature here' }), ctx = pad.getContext('2d');
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10182a';
    let down = false, sig = null;
    const pt = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
    const trim = () => {
      const d = ctx.getImageData(0, 0, pad.width, pad.height).data; let x0 = pad.width, y0 = pad.height, x1 = -1, y1 = -1;
      for (let y = 0; y < pad.height; y++) for (let x = 0; x < pad.width; x++) if (d[(y * pad.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { sig = null; return; }
      const c = document.createElement('canvas'); c.width = x1 - x0 + 9; c.height = y1 - y0 + 9;
      c.getContext('2d').drawImage(pad, x0 - 4, y0 - 4, c.width, c.height, 0, 0, c.width, c.height);
      sig = { url: c.toDataURL('image/png'), ratio: c.height / c.width };
    };
    pad.addEventListener('pointerdown', e => { down = true; pad.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pt(e)); ctx.lineTo(...pt(e)); ctx.stroke(); e.preventDefault(); });
    pad.addEventListener('pointermove', e => { if (down) { ctx.lineTo(...pt(e)); ctx.stroke(); } });
    const up = () => { if (down) { down = false; trim(); onChange(); } };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    const el = h('div', { class: 'opts' }, pad, h('div', {}, h('button', { type: 'button', class: 'btn sm', text: 'Clear signature', onclick: () => { ctx.clearRect(0, 0, pad.width, pad.height); sig = null; onChange(); } })));
    return { el, get sig() { return sig; } };
  }
  // Opens any image the browser knows. iPhone HEIC photos are converted first where the browser cannot read them.
  async function bitmap(f) {
    try { return await createImageBitmap(f, { imageOrientation: 'from-image' }); }
    catch (e) {
      if (!/hei[cf]/i.test(f.type + f.name)) throw e;
      const { heicTo } = await import(C.libs.heic).catch(() => { throw new Friendly('The iPhone photo converter could not load. Check your connection and try again.'); });
      return createImageBitmap(await heicTo({ blob: f, type: 'image/jpeg', quality: 0.92 }));
    }
  }

  /* ---------- the tools ---------- */
  const A4 = [595.28, 841.89], LETTER = [612, 792];
  const imagesToPdf = async (fs, o, p) => {
    const out = await L.PDFDocument.create(), m = +o.margin;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i]; p(`Image ${i + 1} of ${fs.length}`);
      let img;
      try {
        if (f.type === 'image/png') img = await out.embedPng(await f.arrayBuffer());
        else {
          const bmp = await bitmap(f);
          const k = Math.min(1, 4000 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
          c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
          img = await out.embedJpg(await (await toBlob(c, 'image/jpeg', 0.9)).arrayBuffer());
        }
      } catch (e) { if (e instanceof Friendly) throw e; throw new Friendly(`"${f.name}" is not an image this browser can open.`); }
      let pw, ph;
      if (o.size === 'fit') { const k = 842 / Math.max(img.width, img.height); pw = img.width * k + 2 * m; ph = img.height * k + 2 * m; }
      else {
        [pw, ph] = o.size === 'a4' ? A4 : LETTER;
        const land = o.orient === 'landscape' || (o.orient === 'auto' && img.width > img.height);
        if (land) [pw, ph] = [ph, pw];
      }
      const k = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height), w = img.width * k, hh = img.height * k;
      out.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - hh) / 2, width: w, height: hh });
    }
    return [pdfOut(fs.length === 1 ? stem(fs[0]) + '.pdf' : 'images.pdf', await out.save())];
  };
  const imgOpts = [
    { id: 'size', label: 'Page size', type: 'select', options: [['fit', 'Same shape as the image'], ['a4', 'A4'], ['letter', 'US Letter']] },
    { id: 'orient', label: 'Page direction', type: 'select', options: [['auto', 'Match each image'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], showIf: v => v.size !== 'fit' },
    { id: 'margin', label: 'Margin', type: 'select', options: [['0', 'None'], ['20', 'Small'], ['45', 'Large']] },
  ];

  const T = {
    'merge-pdf': {
      many: true, min: 2, order: true, go: 'Merge PDFs',
      run: async (fs, o, p) => {
        const out = await L.PDFDocument.create();
        for (const f of fs) { p(`Adding ${f.name}`); const d = await lib(f); (await out.copyPages(d, d.getPageIndices())).forEach(pg => out.addPage(pg)); }
        return [pdfOut('merged.pdf', await out.save())];
      },
    },
    'split-pdf': {
      go: 'Split PDF',
      opts: [
        { id: 'mode', label: 'How to split', type: 'select', options: [['each', 'Every page becomes its own file'], ['ranges', 'By page ranges I type']] },
        { id: 'ranges', label: 'Page ranges', type: 'text', placeholder: '1-3, 4-6', hint: 'Each part between commas becomes one file.', showIf: v => v.mode === 'ranges' },
      ],
      run: async ([f], o, p) => {
        const src = await lib(f), total = src.getPageCount();
        const groups = o.mode === 'each' ? src.getPageIndices().map(i => [i]) : ranges(o.ranges, total);
        const res = [];
        for (const g of groups) {
          p(`File ${res.length + 1} of ${groups.length}`);
          const out = await L.PDFDocument.create();
          (await out.copyPages(src, g)).forEach(pg => out.addPage(pg));
          const tag = g.length === 1 ? `page-${g[0] + 1}` : `pages-${g[0] + 1}-${g[g.length - 1] + 1}`;
          res.push(pdfOut(`${stem(f)}-${tag}.pdf`, await out.save()));
        }
        return res;
      },
    },
    'remove-pages': {
      go: 'Remove pages',
      opts: [{ id: 'pages', label: 'Pages to remove', type: 'text', placeholder: '2, 5-7' }],
      run: async ([f], o) => {
        const src = await lib(f), gone = new Set(ranges(o.pages, src.getPageCount()).flat());
        const keep = src.getPageIndices().filter(i => !gone.has(i));
        if (!keep.length) throw new Friendly('That would remove every page. Leave at least one.');
        return [Object.assign(pdfOut(`${stem(f)}-edited.pdf`, await pick(f, keep)), { note: `Removed ${gone.size} page${gone.size === 1 ? '' : 's'}. ${keep.length} left.` })];
      },
    },
    'extract-pages': {
      go: 'Extract pages',
      opts: [{ id: 'pages', label: 'Pages to keep', type: 'text', placeholder: '1, 4-6' }],
      run: async ([f], o) => {
        const src = await lib(f);
        return [pdfOut(`${stem(f)}-extract.pdf`, await pick(f, ranges(o.pages, src.getPageCount()).flat()))];
      },
    },
    'organize-pdf': {
      go: 'Save new order',
      setup: async ([f], box) => {
        const pdf = await view(f), grid = h('div', { class: 'thumbs' }), order = [];
        const redraw = () => { grid.replaceChildren(...order.map(o => o.card)); order.forEach((o, k) => { o.pos.textContent = `Position ${k + 1}`; }); };
        const move = (o, d) => { const k = order.indexOf(o), j = k + d; if (j < 0 || j >= order.length) return; order.splice(k, 1); order.splice(j, 0, o); redraw(); };
        box.append(grid);
        for (let n = 1; n <= pdf.numPages; n++) {
          const d = await draw(pdf, n, { width: 220 });
          const o = { i: n - 1, rot: 0, pos: h('span', { class: 'thumb-pos' }) };
          const b = (label, text, fn) => h('button', { type: 'button', class: 'btn sm', 'aria-label': `${label} page ${n}`, title: label, onclick: fn, text });
          o.card = h('div', { class: 'thumb' },
            h('div', { class: 'thumb-img' }, d.canvas),
            h('div', { class: 'thumb-meta' }, o.pos, h('span', { text: `was page ${n}` })),
            h('div', { class: 'thumb-bar' },
              b('Move earlier', '←', () => move(o, -1)), b('Move later', '→', () => move(o, 1)),
              b('Rotate', '⟳', () => { o.rot = (o.rot + 90) % 360; d.canvas.style.transform = `rotate(${o.rot}deg)`; }),
              b('Delete', '✕', () => { order.splice(order.indexOf(o), 1); redraw(); })));
          order.push(o); redraw();
        }
        return { order };
      },
      run: async ([f], o, p, x) => {
        if (!x.order.length) throw new Friendly('Every page is deleted. Start over to bring them back.');
        const src = await lib(f), out = await L.PDFDocument.create();
        (await out.copyPages(src, x.order.map(q => q.i))).forEach((pg, k) => {
          if (x.order[k].rot) pg.setRotation(L.degrees((pg.getRotation().angle + x.order[k].rot) % 360));
          out.addPage(pg);
        });
        return [pdfOut(`${stem(f)}-organized.pdf`, await out.save())];
      },
    },
    'scan-to-pdf': { kind: 'img', many: true, min: 1, order: true, camera: true, go: 'Make PDF', opts: imgOpts, run: imagesToPdf },
    'jpg-to-pdf': { kind: 'img', many: true, min: 1, order: true, go: 'Convert to PDF', opts: imgOpts, run: imagesToPdf },
    'compress-pdf': {
      go: 'Compress PDF',
      opts: [
        { id: 'mode', label: 'How to compress', type: 'select', value: 'level', options: [['target', 'Get under a size limit'], ['level', 'Choose a quality level']] },
        { id: 'target', label: 'Size limit', type: 'select', value: '1024', showIf: v => v.mode === 'target', hint: 'The tool keeps the best quality that fits under the limit.',
          options: [['100', '100 KB'], ['200', '200 KB'], ['300', '300 KB'], ['500', '500 KB'], ['1024', '1 MB'], ['2048', '2 MB'], ['5120', '5 MB']] },
        { id: 'level', label: 'Compression', type: 'select', value: 'strong', showIf: v => v.mode === 'level',
          options: [['light', 'Light: keeps text selectable, small saving'], ['strong', 'Strong: much smaller, pages become images'], ['extreme', 'Extreme: smallest, lower quality images']] },
      ],
      run: async ([f], o, p) => {
        const done = (bytes, extra) => [Object.assign(pdfOut(`${stem(f)}-compressed.pdf`, bytes), { note: `${size(f.size)} down to ${size(bytes.length)}, ${Math.round((1 - bytes.length / f.size) * 100)}% smaller. ${extra}` })];
        if (o.mode === 'target') {
          const goal = +o.target * 1024, label = +o.target >= 1024 ? `${+o.target / 1024} MB` : `${o.target} KB`;
          if (f.size <= goal) throw new Friendly(`This file is ${size(f.size)}, which is already under ${label}.`);
          const light = await (await lib(f)).save({ useObjectStreams: true });
          if (light.length <= goal) return done(light, 'Text is still selectable.');
          const steps = [[150, 0.8], [130, 0.7], [110, 0.6], [96, 0.5], [80, 0.45], [66, 0.38], [54, 0.32], [44, 0.28], [36, 0.24]];
          let i = 0, tries = 0, best = null, hit = null, jump = 1;
          while (i < steps.length && tries < 6) {
            const k = ++tries, bytes = await raster(f, steps[i][0], steps[i][1], t => p(`Attempt ${k}, ${t.toLowerCase()}`));
            if (!best || bytes.length < best.length) best = bytes;
            if (bytes.length <= goal) { hit = { bytes, i }; break; }
            const r = goal / bytes.length; jump = r > 0.75 ? 1 : r > 0.45 ? 2 : r > 0.25 ? 3 : 4; i += jump;
          }
          if (!hit && i >= steps.length && tries < 7 && best.length > goal) { const bytes = await raster(f, 36, 0.24, t => p(`Last attempt, ${t.toLowerCase()}`)); if (bytes.length < best.length) best = bytes; if (bytes.length <= goal) hit = { bytes, i: steps.length - 1 }; }
          if (!hit) throw new Friendly(`The smallest this file can get is about ${size(best.length)}, which is still over ${label}. Split it into parts with Split PDF, or remove pages you do not need.`);
          if (jump > 1 && hit.bytes.length < goal * 0.7) { // we may have overshot: try one step better quality
            const bytes = await raster(f, steps[hit.i - 1][0], steps[hit.i - 1][1], t => p(`Improving quality, ${t.toLowerCase()}`));
            if (bytes.length <= goal) hit = { bytes, i: hit.i - 1 };
          }
          return done(hit.bytes, `Pages were redrawn as images at ${steps[hit.i][0]} dpi, so check that small text is still readable.`);
        }
        let bytes;
        if (o.level === 'light') bytes = await (await lib(f)).save({ useObjectStreams: true });
        else bytes = await raster(f, o.level === 'strong' ? 120 : 80, o.level === 'strong' ? 0.6 : 0.45, p);
        if (bytes.length >= f.size) throw new Friendly(`This file is already compact: ${o.level} compression would not make it smaller.${o.level === 'extreme' ? '' : ' Try a stronger level.'}`);
        return done(bytes, o.level === 'light' ? 'Text is still selectable.' : 'Pages are now images.');
      },
    },
    'repair-pdf': {
      go: 'Repair PDF',
      run: async ([f], o, p) => {
        try {
          const src = await L.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true, throwOnInvalidObject: false });
          const out = await L.PDFDocument.create();
          (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg));
          if (!out.getPageCount()) throw new Error('empty');
          return [Object.assign(pdfOut(`${stem(f)}-repaired.pdf`, await out.save()), { note: 'The file structure was rebuilt. Text and quality are unchanged.' })];
        } catch (e) {
          try {
            return [Object.assign(pdfOut(`${stem(f)}-repaired.pdf`, await raster(f, 150, 0.85, p)), { note: 'The structure could not be rebuilt, so each readable page was redrawn as an image.' })];
          } catch (e2) { throw new Friendly('This file is too damaged to recover. If you have another copy, try that one.'); }
        }
      },
    },
    'pdf-to-jpg': {
      go: 'Convert to JPG',
      opts: [{ id: 'dpi', label: 'Image quality', type: 'select', value: '150', options: [['100', 'Normal, for screens'], ['150', 'Good'], ['300', 'High, for printing']] }],
      run: async ([f], o, p) => {
        const pdf = await view(f), res = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          p(`Page ${n} of ${pdf.numPages}`);
          const d = await draw(pdf, n, { scale: +o.dpi / 72 });
          res.push({ name: `${stem(f)}-page-${n}.jpg`, blob: await toBlob(d.canvas, 'image/jpeg', 0.9) });
        }
        return res;
      },
    },
    'pdf-to-markdown': {
      go: 'Convert',
      opts: [{ id: 'fmt', label: 'Save as', type: 'select', options: [['md', 'Markdown (.md), with headings'], ['txt', 'Plain text (.txt)']] }],
      run: async ([f], o, p) => {
        const pdf = await view(f), lines = [], hist = {};
        for (let n = 1; n <= pdf.numPages; n++) {
          p(`Page ${n} of ${pdf.numPages}`);
          const items = (await (await pdf.getPage(n)).getTextContent()).items.filter(i => i.str && i.str.trim() || i.str === ' ')
            .map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, hh: i.height || Math.abs(i.transform[3]) || 10 }));
          items.sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);
          let cur = null;
          for (const it of items) {
            if (!cur || Math.abs(cur.y - it.y) > Math.max(2, it.hh * 0.5)) {
              cur = { y: it.y, hh: it.hh, t: '', end: 0, gap: cur ? cur.y - it.y : 0, page: n }; lines.push(cur);
            } else if (it.x - cur.end > it.hh * 0.15 && !/\s$/.test(cur.t) && !/^\s/.test(it.s)) cur.t += ' ';
            cur.t += it.s; cur.end = it.x + it.w; cur.hh = Math.max(cur.hh, it.hh);
          }
          if (cur) lines.push({ brk: true });
        }
        for (const l of lines) if (!l.brk && l.t.trim()) { const k = Math.round(l.hh); hist[k] = (hist[k] || 0) + l.t.length; }
        const body = +Object.keys(hist).sort((a, b) => hist[b] - hist[a])[0];
        if (!body) throw new Friendly('No text was found. This looks like a scanned PDF, which is a picture of text.');
        let txt = '';
        for (const l of lines) {
          if (l.brk) { txt += '\n'; continue; }
          const t = l.t.replace(/\s+/g, ' ').trim(); if (!t) continue;
          const head = o.fmt === 'md' && t.length < 120 ? (l.hh >= body * 1.5 ? '# ' : l.hh >= body * 1.18 ? '## ' : '') : '';
          if (head || l.gap > l.hh * 1.7) txt += '\n';
          txt += head + t + '\n' + (head ? '\n' : '');
        }
        txt = txt.replace(/\n{3,}/g, '\n\n').trim() + '\n';
        return [{ name: `${stem(f)}.${o.fmt}`, blob: new Blob([txt], { type: 'text/plain' }) }];
      },
    },
    'rotate-pdf': {
      go: 'Rotate PDF',
      opts: [
        { id: 'angle', label: 'Turn', type: 'select', options: [['90', 'Right, 90°'], ['270', 'Left, 90°'], ['180', 'Upside down, 180°']] },
        { id: 'pages', label: 'Pages', type: 'text', placeholder: 'All pages', hint: 'Leave empty for every page, or type pages like 1, 3-5.' },
      ],
      run: async ([f], o) => {
        const d = await lib(f), idx = o.pages.trim() ? ranges(o.pages, d.getPageCount()).flat() : d.getPageIndices();
        for (const i of new Set(idx)) { const pg = d.getPage(i); pg.setRotation(L.degrees((pg.getRotation().angle + +o.angle) % 360)); }
        return [pdfOut(`${stem(f)}-rotated.pdf`, await d.save())];
      },
    },
    'add-page-numbers': {
      go: 'Add page numbers',
      opts: [
        { id: 'pos', label: 'Position', type: 'select', options: [['b-c', 'Bottom centre'], ['b-r', 'Bottom right'], ['b-l', 'Bottom left'], ['t-c', 'Top centre'], ['t-r', 'Top right'], ['t-l', 'Top left']] },
        { id: 'style', label: 'Style', type: 'select', options: [['n', '1'], ['pn', 'Page 1'], ['nt', '1 / 12'], ['pnt', 'Page 1 of 12']] },
        { id: 'start', label: 'Start counting at', type: 'number', value: 1, min: 0 },
        { id: 'fs', label: 'Text size', type: 'select', value: '11', options: [['9', 'Small'], ['11', 'Medium'], ['14', 'Large']] },
        { id: 'skip', label: 'Leave the first page without a number', type: 'check' },
      ],
      run: async ([f], o) => {
        const d = await lib(f), font = await d.embedFont(L.StandardFonts.Helvetica), fs = +o.fs, m = 28;
        const pages = d.getPages(), off = o.skip ? 1 : 0, start = Math.max(0, parseInt(o.start, 10) || 0), last = start + pages.length - off - 1;
        pages.forEach((pg, i) => {
          if (o.skip && i === 0) return;
          const num = start + i - off;
          const t = { n: `${num}`, pn: `Page ${num}`, nt: `${num} / ${last}`, pnt: `Page ${num} of ${last}` }[o.style];
          const fr = frame(pg), tw = font.widthOfTextAtSize(t, fs), [v, a] = o.pos.split('-');
          const vx = a === 'l' ? m : a === 'r' ? fr.vw - m - tw : (fr.vw - tw) / 2, vy = v === 'b' ? m : fr.vh - m - fs;
          pg.drawText(t, Object.assign(fr.at(vx, vy), { size: fs, font, color: L.rgb(0.15, 0.15, 0.15), rotate: L.degrees(fr.r) }));
        });
        return [pdfOut(`${stem(f)}-numbered.pdf`, await d.save())];
      },
    },
    'add-watermark': {
      go: 'Add watermark',
      opts: [
        { id: 'text', label: 'Watermark text', type: 'text', value: 'DRAFT' },
        { id: 'layout', label: 'Layout', type: 'select', options: [['diag', 'One, diagonal'], ['flat', 'One, straight'], ['tile', 'Repeated across the page']] },
        { id: 'big', label: 'Size', type: 'select', value: '0.6', options: [['0.35', 'Small'], ['0.6', 'Medium'], ['0.85', 'Large']], showIf: v => v.layout !== 'tile' },
        { id: 'color', label: 'Colour', type: 'select', options: [['0.45,0.45,0.45', 'Grey'], ['0.8,0.1,0.1', 'Red'], ['0.1,0.25,0.75', 'Blue'], ['0,0,0', 'Black']] },
        { id: 'alpha', label: 'Strength', type: 'select', value: '0.2', options: [['0.1', 'Faint'], ['0.2', 'Medium'], ['0.4', 'Strong']] },
      ],
      run: async ([f], o) => {
        const text = o.text.trim(); if (!text) throw new Friendly('Type the watermark text first.');
        const d = await lib(f), font = await d.embedFont(L.StandardFonts.HelveticaBold), col = L.rgb(...o.color.split(',').map(Number));
        let unit; try { unit = font.widthOfTextAtSize(text, 1); } catch (e) { throw new Friendly('Use plain Latin letters and numbers for the watermark. Other scripts are not supported yet.'); }
        for (const pg of d.getPages()) {
          const fr = frame(pg);
          const stamp = (cx, cy, width, deg) => {
            const fs = width / unit, th = deg * Math.PI / 180, tw = width;
            const vx = cx - tw / 2 * Math.cos(th) + fs * 0.35 * Math.sin(th), vy = cy - tw / 2 * Math.sin(th) - fs * 0.35 * Math.cos(th);
            pg.drawText(text, Object.assign(fr.at(vx, vy), { size: fs, font, color: col, opacity: +o.alpha, rotate: L.degrees(fr.r + deg) }));
          };
          if (o.layout === 'tile') for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) stamp((c + 0.5) / 3 * fr.vw, (r + 0.5) / 4 * fr.vh, fr.vw * 0.22, 35);
          else stamp(fr.vw / 2, fr.vh / 2, fr.vw * +o.big, o.layout === 'diag' ? Math.atan2(fr.vh, fr.vw) * 180 / Math.PI : 0);
        }
        return [pdfOut(`${stem(f)}-watermarked.pdf`, await d.save())];
      },
    },
    'crop-pdf': {
      go: 'Crop PDF',
      opts: ['Top', 'Right', 'Bottom', 'Left'].map(s => ({ id: s.toLowerCase(), label: `${s}, in mm`, type: 'number', value: 10, min: 0 })),
      run: async ([f], o) => {
        const d = await lib(f), mm = v => Math.max(0, parseFloat(v) || 0) * 72 / 25.4;
        const [t, r, b, l] = [o.top, o.right, o.bottom, o.left].map(mm);
        for (const pg of d.getPages()) {
          const fr = frame(pg);
          if (fr.vw - l - r < 20 || fr.vh - t - b < 20) throw new Friendly('Those margins would leave nothing of the page. Use smaller numbers.');
          const p1 = fr.at(l, b), p2 = fr.at(fr.vw - r, fr.vh - t);
          pg.setCropBox(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
        }
        return [pdfOut(`${stem(f)}-cropped.pdf`, await d.save())];
      },
    },
    'fill-and-sign-pdf': {
      go: 'Save PDF',
      opts: [{ id: 'flat', label: 'Lock the form answers so upload portals show them', type: 'check', value: true }],
      setup: async ([f], box) => {
        const doc = await lib(f), pdf = await view(f), rows = [], st = { items: [], sel: null, mode: null, rows };
        let fields = []; try { fields = doc.getForm().getFields(); } catch (e) { /* no form */ }
        const fbox = h('div', { class: 'opts' });
        fields.forEach((fd, k) => {
          const id = `fld-${k}`, name = fd.getName(); let el, kind;
          const sel = (opts, cur) => h('select', { id }, h('option', { value: '', text: '(nothing chosen)' }), opts.map(v => h('option', Object.assign({ value: v, text: v }, v === cur ? { selected: true } : {}))));
          if (fd instanceof L.PDFTextField) { kind = 'text'; el = fd.isMultiline() ? h('textarea', { id, rows: 3 }) : h('input', { id, type: 'text' }); el.value = fd.getText() || ''; }
          else if (fd instanceof L.PDFCheckBox) { kind = 'check'; el = h('input', { id, type: 'checkbox' }); el.checked = fd.isChecked(); }
          else if (fd instanceof L.PDFDropdown || fd instanceof L.PDFOptionList) { kind = 'pick'; el = sel(fd.getOptions(), fd.getSelected()[0]); }
          else if (fd instanceof L.PDFRadioGroup) { kind = 'radio'; el = sel(fd.getOptions(), fd.getSelected()); }
          else return;
          rows.push({ k, el, kind });
          fbox.append(kind === 'check' ? h('label', { class: 'field check', for: id }, el, h('span', { text: name })) : h('div', { class: 'field' }, h('label', { for: id, text: name }), el));
        });
        const hint = h('p', { class: 'hint', text: 'Pick something to add, then tap the page where it should go.' });
        const removeBtn = h('button', { type: 'button', class: 'btn sm', text: 'Remove selected', disabled: true, onclick: () => { st.items.splice(st.items.indexOf(st.sel), 1); st.sel = null; paint(pg.n, pg.ov); } });
        const paint = (n, ov) => {
          ov.replaceChildren(...st.items.filter(it => it.page === n).map(it => {
            let e;
            if (it.type === 'sig') { e = h('img', { src: pad.sig.url, class: 'it', alt: 'Signature' }); e.style.width = it.wf * 100 + '%'; e.style.left = (it.fx - it.wf / 2) * 100 + '%'; }
            else { e = h('span', { class: 'it', text: it.type === 'check' ? '✓' : it.text }); e.style.fontSize = it.pt * ov.clientWidth / pg.pw + 'px'; e.style.left = it.fx * 100 + '%'; }
            e.style.top = it.fy * 100 + '%'; if (it === st.sel) e.classList.add('sel');
            e.addEventListener('click', ev => { ev.stopPropagation(); st.sel = it; paint(n, ov); });
            return e;
          }));
          removeBtn.disabled = !st.sel;
        };
        const pad = sigPad(() => { if (!pad.sig) st.items = st.items.filter(it => it.type !== 'sig'); paint(pg.n, pg.ov); });
        st.pad = pad;
        const pg = pager(pdf, paint); pg.ov.classList.add('tap');
        const text = h('input', { type: 'text', id: 'fs-text', placeholder: 'Your name, an address, a number…' });
        const sz = h('select', { id: 'fs-size' }, [['9', 'Small'], ['11', 'Medium'], ['14', 'Large']].map(([v, l]) => h('option', Object.assign({ value: v, text: l }, v === '11' ? { selected: true } : {}))));
        const arm = (mode, msg) => { st.mode = mode; hint.textContent = msg || 'Now tap the page where it should go. Tap again to add another.'; };
        pg.ov.addEventListener('click', e => {
          if (!st.mode) { hint.textContent = 'First choose what to add with one of the buttons above.'; return; }
          const r = pg.ov.getBoundingClientRect(), it = Object.assign({ page: pg.n, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, pt: +sz.value, wf: { 9: 0.18, 11: 0.28, 14: 0.4 }[sz.value] }, st.mode);
          st.items.push(it); st.sel = it; paint(pg.n, pg.ov);
        });
        if (rows.length) box.append(h('p', { class: 'step', text: `Form fields (${rows.length})` }), fbox);
        box.append(
          h('p', { class: 'step', text: 'Your signature (skip this if you do not need one)' }), pad.el,
          h('p', { class: 'step', text: rows.length ? 'Add anything else to the page' : 'Add text, ticks and your signature' }),
          h('div', { class: 'field' }, h('label', { for: 'fs-text', text: 'Text to add' }), text),
          h('div', { class: 'field' }, h('label', { for: 'fs-size', text: 'Size' }), sz),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn sm', text: 'Place this text', onclick: () => text.value.trim() ? arm({ type: 'text', text: text.value.trim() }) : arm(null, 'Type the text first.') }),
            h('button', { type: 'button', class: 'btn sm', text: 'Place a tick', onclick: () => arm({ type: 'check' }) }),
            h('button', { type: 'button', class: 'btn sm', text: 'Place today’s date', onclick: () => arm({ type: 'text', text: new Date().toLocaleDateString() }) }),
            h('button', { type: 'button', class: 'btn sm', text: 'Place signature', onclick: () => pad.sig ? arm({ type: 'sig' }) : arm(null, 'Draw your signature in the box above first.') })),
          hint, pg.el, h('div', { class: 'row' }, removeBtn));
        await pg.show();
        return st;
      },
      run: async ([f], o, p, st) => {
        const d = await lib(f); let fds = []; try { fds = d.getForm().getFields(); } catch (e) { /* no form */ }
        try {
          for (const { k, el, kind } of st.rows) {
            const fd = fds[k];
            if (kind === 'text') fd.setText(el.value || undefined);
            else if (kind === 'check') el.checked ? fd.check() : fd.uncheck();
            else if (el.value) fd.select(el.value);
            else if (kind === 'pick') fd.clear();
          }
          const ink = L.rgb(0.06, 0.09, 0.16);
          const font = await d.embedFont(L.StandardFonts.Helvetica), zap = st.items.some(it => it.type === 'check') ? await d.embedFont(L.StandardFonts.ZapfDingbats) : null;
          const img = st.items.some(it => it.type === 'sig') && st.pad.sig ? await d.embedPng(st.pad.sig.url) : null;
          for (const it of st.items) {
            const pg = d.getPage(it.page - 1), fr = frame(pg), vx = it.fx * fr.vw, vy = (1 - it.fy) * fr.vh;
            if (it.type === 'sig') { if (!img) continue; const w = it.wf * fr.vw, hh = w * st.pad.sig.ratio; pg.drawImage(img, Object.assign(fr.at(vx - w / 2, vy - hh / 2), { width: w, height: hh, rotate: L.degrees(fr.r) })); }
            else pg.drawText(it.type === 'check' ? '\u2714' : it.text, Object.assign(fr.at(vx, vy - it.pt * 0.35), { size: it.pt, font: it.type === 'check' ? zap : font, color: ink, rotate: L.degrees(fr.r) }));
          }
          if (o.flat && st.rows.length) d.getForm().flatten();
          return [pdfOut(`${stem(f)}-filled.pdf`, await d.save())];
        } catch (e) {
          if (e instanceof Friendly) throw e;
          throw new Friendly(/encode|WinAnsi/i.test(e.message) ? 'Some of the text uses characters that cannot be written yet. Use plain Latin letters and numbers.' : /length/i.test(e.message) ? 'One answer is longer than its field allows. Shorten it and try again.' : 'This form could not be saved. It may use features that are not supported yet.');
        }
      },
    },
    'sign-pdf': {
      go: 'Sign PDF',
      setup: async ([f], box) => {
        const pdf = await view(f), st = { place: null, wf: 0.3 };
        const preview = ov => {
          ov.replaceChildren();
          if (!st.place || st.place.page !== pg.n || !pad.sig) return;
          const im = h('img', { src: pad.sig.url, alt: 'Your signature', class: 'sig' });
          im.style.width = st.wf * 100 + '%'; im.style.left = (st.place.fx - st.wf / 2) * 100 + '%'; im.style.top = st.place.fy * 100 + '%';
          ov.append(im);
        };
        const pad = sigPad(() => preview(pg.ov)); st.pad = pad;
        const pg = pager(pdf, (n, ov) => preview(ov));
        pg.ov.classList.add('tap');
        pg.ov.addEventListener('click', e => { const r = pg.ov.getBoundingClientRect(); st.place = { page: pg.n, fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height }; preview(pg.ov); });
        const slider = h('input', { type: 'range', id: 'sig-size', min: 10, max: 70, value: 30, oninput: e => { st.wf = e.target.value / 100; preview(pg.ov); } });
        box.append(
          h('p', { class: 'step', text: '1. Draw your signature' }), pad.el,
          h('p', { class: 'step', text: '2. Tap the page where it should go' }), pg.el,
          h('div', { class: 'field' }, h('label', { for: 'sig-size', text: 'Signature size' }), slider));
        await pg.show();
        return st;
      },
      run: async ([f], o, p, st) => {
        const sig = st.pad.sig;
        if (!sig) throw new Friendly('Draw your signature in the box first.');
        if (!st.place) throw new Friendly('Tap the page where the signature should go.');
        const d = await lib(f), img = await d.embedPng(sig.url), pg = d.getPage(st.place.page - 1), fr = frame(pg);
        const w = st.wf * fr.vw, hh = w * sig.ratio;
        pg.drawImage(img, Object.assign(fr.at(st.place.fx * fr.vw - w / 2, (1 - st.place.fy) * fr.vh - hh / 2), { width: w, height: hh, rotate: L.degrees(fr.r) }));
        return [pdfOut(`${stem(f)}-signed.pdf`, await d.save())];
      },
    },
    'protect-pdf': {
      go: 'Protect PDF',
      opts: [
        { id: 'pw', label: 'Password', type: 'password', hint: 'Keep it somewhere safe. A forgotten password cannot be recovered by anyone.' },
        { id: 'pw2', label: 'Type it again', type: 'password' },
      ],
      run: async ([f], o) => {
        if (!o.pw) throw new Friendly('Type a password first.');
        if (o.pw !== o.pw2) throw new Friendly('The two passwords do not match. Type them again.');
        const d = await lib(f);
        await d.encrypt({ userPassword: o.pw, ownerPassword: o.pw, permissions: { printing: 'highResolution', modifying: true, copying: true, annotating: true, fillingForms: true, contentAccessibility: true, documentAssembly: true } });
        return [Object.assign(pdfOut(`${stem(f)}-protected.pdf`, await d.save()), { note: 'This file now asks for the password before it opens.' })];
      },
    },
    'unlock-pdf': {
      go: 'Unlock PDF',
      opts: [{ id: 'pw', label: 'The password for this PDF', type: 'password', hint: 'This removes a password you already know. It cannot guess or break one.' }],
      run: async ([f], o) => {
        const buf = await f.arrayBuffer();
        try { await L.PDFDocument.load(buf.slice(0)); throw new Friendly('This PDF has no password, so there is nothing to unlock.'); }
        catch (e) { if (e instanceof Friendly) throw e; if (!/encrypt/i.test(e.message)) throw new Friendly(`"${f.name}" could not be read. It may be damaged. Try Repair PDF.`); }
        if (!o.pw) throw new Friendly('Type the password for this PDF.');
        let d;
        try { d = await L.PDFDocument.load(buf, { password: o.pw }); }
        catch (e) { throw new Friendly(/incorrect|password/i.test(e.message) ? 'That password is not right. Check it and try again.' : 'This PDF uses a kind of protection that cannot be removed here yet.'); }
        // Drop the old encryption settings so the copy is a plain PDF.
        const F = L.PDFName.of('Filter');
        for (const [ref, obj] of d.context.enumerateIndirectObjects()) if (obj instanceof L.PDFDict && obj.has(F) && String(obj.get(F)) === '/Standard') d.context.delete(ref);
        return [Object.assign(pdfOut(`${stem(f)}-unlocked.pdf`, await d.save()), { note: 'The password has been removed from this copy.' })];
      },
    },
    'redact-pdf': {
      go: 'Redact PDF',
      setup: async ([f], box) => {
        const pdf = await view(f), boxes = [], count = h('span', { class: 'hint' });
        const paint = (n, ov) => {
          ov.replaceChildren(...boxes.filter(b => b.page === n).map(b => { const e = h('div', { class: 'blk' }); Object.assign(e.style, { left: b.x * 100 + '%', top: b.y * 100 + '%', width: b.w * 100 + '%', height: b.h * 100 + '%' }); return e; }));
          count.textContent = boxes.length ? `${boxes.length} box${boxes.length === 1 ? '' : 'es'} on ${new Set(boxes.map(b => b.page)).size} page(s)` : 'No boxes yet';
        };
        const pg = pager(pdf, paint); pg.ov.classList.add('drag');
        let s = null, ghost = null;
        const fr = e => { const r = pg.ov.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
        pg.ov.addEventListener('pointerdown', e => { s = fr(e); pg.ov.setPointerCapture(e.pointerId); ghost = h('div', { class: 'blk ghost' }); pg.ov.append(ghost); e.preventDefault(); });
        pg.ov.addEventListener('pointermove', e => { if (!s) return; const c = fr(e); Object.assign(ghost.style, { left: Math.min(s[0], c[0]) * 100 + '%', top: Math.min(s[1], c[1]) * 100 + '%', width: Math.abs(c[0] - s[0]) * 100 + '%', height: Math.abs(c[1] - s[1]) * 100 + '%' }); });
        const end = e => { if (!s) return; const c = fr(e), b = { page: pg.n, x: Math.min(s[0], c[0]), y: Math.min(s[1], c[1]), w: Math.abs(c[0] - s[0]), h: Math.abs(c[1] - s[1]) }; s = null; if (b.w > 0.01 && b.h > 0.005) boxes.push(b); paint(pg.n, pg.ov); };
        pg.ov.addEventListener('pointerup', end); pg.ov.addEventListener('pointercancel', end);
        box.append(h('p', { class: 'step', text: 'Drag a box over anything you want to hide' }), pg.el,
          h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn sm', text: 'Undo last box', onclick: () => { boxes.pop(); paint(pg.n, pg.ov); } }), count));
        await pg.show();
        return { boxes, pdf };
      },
      run: async ([f], o, p, x) => {
        if (!x.boxes.length) throw new Friendly('Drag at least one box over the page first.');
        const src = await lib(f), out = await L.PDFDocument.create(), N = src.getPageCount();
        for (let i = 0; i < N; i++) {
          p(`Page ${i + 1} of ${N}`);
          const bs = x.boxes.filter(b => b.page === i + 1);
          if (!bs.length) { out.addPage((await out.copyPages(src, [i]))[0]); continue; }
          const d = await draw(x.pdf, i + 1, { scale: 2 }), ctx = d.canvas.getContext('2d'); ctx.fillStyle = '#000';
          for (const b of bs) ctx.fillRect(b.x * d.canvas.width, b.y * d.canvas.height, b.w * d.canvas.width, b.h * d.canvas.height);
          const img = await out.embedJpg(await (await toBlob(d.canvas, 'image/jpeg', 0.88)).arrayBuffer());
          out.addPage([d.w, d.h]).drawImage(img, { x: 0, y: 0, width: d.w, height: d.h });
        }
        return [Object.assign(pdfOut(`${stem(f)}-redacted.pdf`, await out.save()), { note: 'Redacted pages were rebuilt as images, so the hidden content is gone from the file.' })];
      },
    },
    'compare-pdf': {
      many: true, min: 2, max: 2, order: true, go: 'Compare', pickLabel: 'Choose the old and the new PDF',
      run: async ([fa, fb], o, p) => {
        const a = await view(fa), b = await view(fb), N = Math.max(a.numPages, b.numPages), lim = Math.min(N, 40), wrap = h('div', { class: 'cmp' });
        let changed = 0;
        for (let n = 1; n <= lim; n++) {
          p(`Page ${n} of ${lim}`);
          const da = n <= a.numPages ? (await draw(a, n, { width: 700 })).canvas : null, db = n <= b.numPages ? (await draw(b, n, { width: 700 })).canvas : null;
          let state, diff = null;
          if (!da || !db) { state = da ? 'Only in the old file' : 'Only in the new file'; changed++; }
          else {
            const w = Math.max(da.width, db.width), hh = Math.max(da.height, db.height);
            const px = c => { const k = document.createElement('canvas'); k.width = w; k.height = hh; const x = k.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh); x.drawImage(c, 0, 0); return x.getImageData(0, 0, w, hh); };
            const A = px(da), B = px(db), D = A.data, E = B.data; let cnt = 0;
            for (let i = 0; i < D.length; i += 4) {
              if (Math.abs(D[i] - E[i]) + Math.abs(D[i + 1] - E[i + 1]) + Math.abs(D[i + 2] - E[i + 2]) > 90) { D[i] = 236; D[i + 1] = 28; D[i + 2] = 124; cnt++; }
              else { const g = 255 - (255 - (D[i] + D[i + 1] + D[i + 2]) / 3) * 0.3; D[i] = D[i + 1] = D[i + 2] = g; }
            }
            diff = document.createElement('canvas'); diff.width = w; diff.height = hh; diff.getContext('2d').putImageData(A, 0, 0);
            const isDiff = cnt > w * hh * 0.0002; state = isDiff ? 'Changed' : 'Same'; if (isDiff) changed++; else diff = null;
          }
          const cell = (c, cap) => c ? h('figure', {}, c, h('figcaption', { text: cap })) : null;
          wrap.append(h('section', { class: 'cmp-page' }, h('h3', {}, `Page ${n} `, h('span', { class: 'pill ' + (state === 'Same' ? 'ok' : 'chg'), text: state })),
            state === 'Same' ? null : h('div', { class: 'cmp-row' }, cell(da, 'Old'), cell(db, 'New'), cell(diff, 'Differences in pink'))));
        }
        return { view: wrap, note: `${changed} of ${lim} page${lim === 1 ? '' : 's'} differ.${N > lim ? ` Only the first ${lim} pages were compared.` : ''}` };
      },
    },
  };

  /* ---------- saving files ---------- */
  let dl; // downloads bridge when the page runs inside a Claude preview
  if (window.claude && window.claude.use) window.claude.use('downloads').then(d => { dl = d; }, () => { dl = null; });
  async function save(blob, name) {
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); }
      catch (e) { if (!e || e.code !== 'declined') throw new Friendly('This preview could not save the file. On the live site it downloads normally.'); }
      return;
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  /* ---------- the tool screen ---------- */
  function mount(root) {
    const t = T[root.dataset.tool], slug = root.dataset.key || root.dataset.tool, preset = root.dataset.preset ? JSON.parse(root.dataset.preset) : {};
    if (!t || root.dataset.on) return;
    root.dataset.on = '1';
    (window.requestIdleCallback || setTimeout)(() => { engine().catch(() => {}); }, { timeout: 2500 });
    const img = t.kind === 'img', what = img ? 'image' : 'PDF';
    let files = [], extra = null, token = 0;
    const accept = img ? 'image/*,.heic,.heif' : 'application/pdf,.pdf';
    const input = h('input', { type: 'file', id: `file-${slug}`, class: 'sr', accept, multiple: !!t.many });
    const cam = t.camera ? h('input', { type: 'file', id: `cam-${slug}`, class: 'sr', accept: 'image/*', capture: 'environment' }) : null;
    const drop = h('div', { class: 'drop' },
      h('label', { class: 'btn big', for: input.id, text: t.pickLabel || `Choose ${what}${t.many ? ' files' : ' file'}` }), input,
      cam ? h('label', { class: 'btn big alt', for: cam.id, text: 'Take a photo' }) : null, cam,
      h('p', { class: 'drop-hint', text: `or drop ${t.many ? 'them' : 'it'} here` }),
      h('p', { class: 'safe', text: 'Stays on this device. Nothing is uploaded.' }));
    const list = h('ul', { class: 'files' }), optBox = h('form', { class: 'opts' }), custom = h('div', { class: 'custom' });
    const goBtn = h('button', { type: 'button', class: 'btn big go', text: t.go }), msg = h('p', { class: 'msg', role: 'status' }), res = h('div', { class: 'results' });
    const work = h('div', { class: 'work', hidden: true }, list, custom, optBox, h('div', { class: 'row' }, goBtn, h('button', { type: 'button', class: 'btn', text: 'Start over', onclick: () => { files = []; refresh(); } })));
    root.replaceChildren(drop, work, msg, res);
    optBox.addEventListener('submit', e => e.preventDefault());

    const fields = (t.opts || []).map(o => {
      const id = `${slug}-${o.id}`, val = preset[o.id] != null ? preset[o.id] : o.value; let el;
      if (o.type === 'select') el = h('select', { id }, o.options.map(([v, l]) => h('option', Object.assign({ value: v, text: l }, v === String(val) ? { selected: true } : {}))));
      else if (o.type === 'check') { el = h('input', { id, type: 'checkbox' }); el.checked = !!val; }
      else el = h('input', { id, type: o.type, value: val != null ? val : null, autocomplete: o.type === 'password' ? 'off' : null, placeholder: o.placeholder, min: o.min, inputmode: o.type === 'number' ? 'decimal' : null });
      const row = o.type === 'check' ? h('label', { class: 'field check', for: id }, el, h('span', { text: o.label })) : h('div', { class: 'field' }, h('label', { for: id, text: o.label }), el, o.hint ? h('p', { class: 'hint', text: o.hint }) : null);
      optBox.append(row); return { o, el, row };
    });
    const values = () => Object.fromEntries(fields.map(({ o, el }) => [o.id, o.type === 'check' ? el.checked : el.value]));
    const sync = () => { const v = values(); fields.forEach(({ o, row }) => { row.hidden = !!(o.showIf && !o.showIf(v)); }); };
    optBox.addEventListener('change', sync); sync();

    const say = (text, kind) => { msg.textContent = text || ''; msg.className = 'msg' + (kind ? ' ' + kind : ''); };
    const fail = e => { if (!(e instanceof Friendly)) console.error(e); say(e instanceof Friendly ? e.message : 'Something went wrong with this file. Nothing was sent anywhere. Try again, or try a different file.', 'err'); };

    function add(fl) {
      const ok = [...fl].filter(f => img ? /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name) : f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
      if (ok.length < fl.length) say(`Only ${what} files work here. ${fl.length - ok.length} file(s) were skipped.`, 'err'); else say('');
      files = t.many ? files.concat(ok) : ok.slice(0, 1);
      if (t.max && files.length > t.max) { files = files.slice(0, t.max); say(`This tool takes ${t.max} files. The extra ones were left out.`, 'err'); }
      refresh();
    }
    input.addEventListener('change', () => { add(input.files); input.value = ''; });
    if (cam) cam.addEventListener('change', () => { add(cam.files); cam.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); });

    async function refresh() {
      res.replaceChildren(); extra = null; custom.replaceChildren();
      const my = ++token, b = (label, text, fn) => h('button', { type: 'button', class: 'btn sm', 'aria-label': label, title: label, onclick: fn, text });
      list.replaceChildren(...files.map((f, i) => h('li', {},
        h('span', { class: 'f-name', text: f.name }), h('span', { class: 'f-size', text: size(f.size) }),
        t.order && files.length > 1 ? b(`Move ${f.name} up`, '↑', () => { if (i) { files.splice(i - 1, 0, files.splice(i, 1)[0]); refresh(); } }) : null,
        t.order && files.length > 1 ? b(`Move ${f.name} down`, '↓', () => { if (i < files.length - 1) { files.splice(i + 1, 0, files.splice(i, 1)[0]); refresh(); } }) : null,
        b(`Remove ${f.name}`, '✕', () => { files.splice(i, 1); refresh(); }))));
      const ready = files.length >= (t.min || 1);
      work.hidden = !files.length; drop.classList.toggle('small', !!files.length);
      goBtn.disabled = !ready;
      if (files.length && !ready) say(`Add at least ${t.min} files.`);
      if (ready && t.setup) {
        goBtn.disabled = true; say('Opening the file…');
        try { await engine(); const x = await t.setup(files, custom); if (my !== token) return; extra = x; goBtn.disabled = false; say(''); }
        catch (e) { if (my === token) fail(e); }
      }
    }

    goBtn.addEventListener('click', async () => {
      goBtn.disabled = true; res.replaceChildren(); say('Working…', 'busy');
      try {
        await engine();
        const out = await t.run(files, values(), s => say(`Working… ${s}`, 'busy'), extra);
        say('');
        if (out.view) { res.append(h('div', { class: 'done' }, h('h2', { text: 'Result' }), h('p', { text: out.note }), out.view)); }
        else {
          const btn = (o, label) => { const b = h('button', { type: 'button', class: 'btn', text: label, onclick: async () => { try { await save(o.blob, o.name); } catch (e) { fail(e); } } }); return b; };
          const box = h('div', { class: 'done' }, h('h2', { text: out.length === 1 ? 'Your file is ready' : `${out.length} files are ready` }));
          if (out[0].note) box.append(h('p', { text: out[0].note }));
          if (out.length > 1) {
            const zip = new window.JSZip(); out.forEach(o => zip.file(o.name, o.blob));
            box.append(btn({ name: `${stem(files[0])}-files.zip`, blob: await zip.generateAsync({ type: 'blob' }) }, 'Download all as one ZIP'));
          }
          box.append(h('ul', { class: 'files' }, out.map(o => h('li', {}, h('span', { class: 'f-name', text: o.name }), h('span', { class: 'f-size', text: size(o.blob.size) }), btn(o, 'Download')))));
          res.append(box);
          window.__last = out; // used by automated tests
        }
        res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) { fail(e); }
      goBtn.disabled = false;
    });
  }

  /* ---------- start ---------- */
  if (C.single) {
    const route = () => {
      const id = location.hash.slice(1) || 'home';
      let hit = false;
      document.querySelectorAll('[data-page]').forEach(s => { const on = s.dataset.page === id; s.hidden = !on; hit = hit || on; });
      if (!hit) { location.hash = 'home'; return; }
      document.querySelectorAll(`[data-page="${id}"] [data-tool]`).forEach(mount);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', route); route();
  } else document.querySelectorAll('[data-tool]').forEach(mount);
})();
