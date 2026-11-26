# PDF tools site

PDF tools that run entirely in the visitor's browser. Files are never uploaded.

## Build

```
node build.js
```

- `dist/` is the real site: a home page, one page per tool (for search engines), a privacy page, `sitemap.xml`, `robots.txt` and `_headers`.
- `preview.html` is a single-file version for quick previews.

No install step is needed. The PDF libraries are committed in `vendor/`.

## Change the name or domain

Edit `site` at the top of `tools.js`, then rebuild. The domain is used for canonical links and the sitemap.

## Deploy (Cloudflare Pages)

- Root directory: `pdf-tools`
- Build command: `node build.js`
- Output directory: `dist`

The `_headers` file sets a Content Security Policy with `connect-src 'self'`, so the pages cannot send a file to any other server.
Adding adverts or analytics later means loosening that policy and updating the privacy page.

## Files

- `tools.js`: the tool list and all page copy (titles, how-to steps, FAQs). Tools marked `soon` show on the home page but have no page yet.
- `src/app.js`: every tool's logic and the tool screen.
- `src/style.css`: styles.
- `build.js`: generates the pages.
