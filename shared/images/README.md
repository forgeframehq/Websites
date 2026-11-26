# Shared images

Originals are kept exactly as generated, so any site can reuse or re-cut them. Cut and resized versions live in each site's own `images/` folder.

All four were made with ChatGPT on 26 Nov 2026 in one style: deep green `#0b6b52` on off-white `#f4f6f2`, flat, thick lines, no text.

| Original | What it shows | Used by |
| --- | --- | --- |
| `originals/pdf-icon-sheet.png` | 3x3 sheet of 9 icons: document with shield, document with check, page stack, compress, image to document, document to image, pencil, padlock, sparkle | `pdf-tools/images/icons/` (category icons; the first two are spare logo options) |
| `originals/pdf-logo.png` | Document with a shield-and-check badge | `pdf-tools/images/logo.png`, `icon-64.png`, `icon-180.png` |
| `originals/pdf-share-art.png` | Laptop and phone inside a green shield, crossed-out cloud, empty left third | `pdf-tools/images/share.jpg` (headline added) |
| `originals/pdf-phone-illustration.png` | Phone outline containing merge, split and sign diagrams | `pdf-tools/images/phone.png` (home page) |

## Prompts

To get a matching image later, reuse these and change only the subject.

**Icon sheet**

> A sheet of 9 flat icons arranged in a strict 3x3 grid, square 1:1 image. Every icon sits centered in its own equal-sized cell with wide empty space around it, and no icon touches or overlaps another. Plain off-white (#f4f6f2) background, no grid lines, no borders, no text, no letters, no numbers. All icons share one style: deep green (#0b6b52), bold geometric shapes, thick clean lines, flat, no gradients, no shadows. Row 1: (1) a document with a small shield badge on its corner, (2) a document with a small checkmark badge on its corner, (3) a stack of pages being put in order. Row 2: (4) a document being squeezed smaller between two arrows, (5) a photo turning into a document with an arrow, (6) a document turning into a photo with an arrow. Row 3: (7) a document with a pencil, (8) a document with a padlock, (9) a document with a small sparkle star.

**Logo**

> A minimal flat logo icon for a privacy-focused PDF tools website. A simple document sheet with a small shield or checkmark badge on its lower right corner. Deep green (#0b6b52) on a plain off-white (#f4f6f2) background. Bold, geometric, thick clean lines, no gradients, no shadows, no text or letters. Must stay clear when shrunk to 32 pixels. Centered, square 1:1.

**Share image art**

> A wide flat illustration for a website link preview, 1200x630 landscape. A laptop and a phone sit side by side, each showing a document page, with a soft green shield glowing around both devices. A faint cloud in the corner has a line crossed through it, showing files do not go to the cloud. Deep green (#0b6b52) and off-white (#f4f6f2) with a small amount of dark charcoal. Clean, modern, flat vector style, lots of empty space on the left third for a headline to be added later. No text, no letters, no logos.

**Phone illustration**

> A simple flat vector illustration of PDF document pages being merged, split and signed, all contained inside the outline of a phone, to show the work happens on the device. Deep green (#0b6b52), off-white (#f4f6f2) and dark charcoal only. Minimal, friendly, thick clean lines, no gradients, no text or letters. Transparent or plain off-white background, landscape 3:2.

## How the cut versions are made

Green-on-off-white art is turned into a transparent PNG (solid green plus alpha). The site paints icons with CSS masks, so they follow the page's accent colour in light and dark mode.
