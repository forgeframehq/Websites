# PDF tools site

PDF tools that run entirely in the visitor's browser. Files are never uploaded.

## Build

```
node build.js
```

- `dist/` is the real site: a home page, one page per tool (for search engines), a privacy page, `sitemap.xml`, `robots.txt` and `_headers`.
- `preview.html` is a single-file version for quick previews.

No install step is needed. The PDF libraries are committed in `vendor/` and the fonts in `fonts/`, so the live site loads nothing from other companies.

## Change the name or domain

Edit `site` at the top of `tools.js`, then rebuild. The domain is used for canonical links and the sitemap.

## Deploy (Cloudflare Pages)

- Root directory: `pdf-tools`
- Build command: `node build.js`
- Output directory: `dist`

The `_headers` file sets a Content Security Policy that only allows the site to talk to itself, so the pages cannot send a file to any other server.
Adding adverts or analytics later means loosening that policy and updating the privacy page.

## Files

- `tools.js`: the tool list and all page copy (titles, how-to steps, FAQs). Tools marked `soon` show on the home page but have no page yet. A tool with `engine` reuses another tool's logic under its own page, such as the compress-to-a-size pages.
- `docs/`: the two SEO and market briefs the plan is based on.
- `images/`: site images. Originals and prompts are in `../shared/images/`.
- `src/app.js`: every tool's logic and the tool screen.
- `src/style.css`: styles.
- `build.js`: generates the pages.

## Libraries in `vendor/`

- `pdf-lib.min.js`: @cantoo/pdf-lib 2.11.1 (a maintained fork of pdf-lib that adds password protection)
- `pdf.min.js`, `pdf.worker.min.js`: PDF.js 3.11.174
- `jszip.min.js`: JSZip 3.10.1
- `heic-to.js`: heic-to 1.6.7, the build made for strict security policies. Loaded only when a browser cannot open an iPhone photo by itself.

## Still to do

- Pick the name and domain, then set them in `tools.js`.
- The terms page is a plain-language draft and has not had a legal review.
- Search Console and Bing verification, and analytics, need the owner's accounts.
- Not built: OCR, Edit PDF, PDF/A, Office conversions, AI tools, blog and guides.
