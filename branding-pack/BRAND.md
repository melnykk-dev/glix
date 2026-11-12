# Glix brand pack v2 — Palette A (Logo True)

Locked 2026-11-12 by Artem's call ("whatever", "fully up to u"). Local only —
**not in the GitHub repo yet.** It ships with the revamp when the Studio Gate
passes, per his no-commit-until-studio-level rule.

## What changed vs the old logo

The old mark was already good: a 3x3 pixel grid, raspberry cells, two purple
cells at the bottom. This pack keeps that grid exactly — same cells, same
positions — and makes two moves:

1. **The centre cell is now a play triangle.** The old mark had an empty
   centre and a ghost cell at middle-right. The ghost cell is now solid
   raspberry, and the centre is a raspberry ▶. The mark is now a play button
   made of pixels: press play, build a game.
2. **The wordmark is lowercase Outfit Bold `glix`, not monospace `Glix`.**
   Same font the editor already uses. A trailing raspberry pixel was tried
   and cut — it floated away from the text in every renderer.

Everything else is continuity: same raspberry, same purple, same ink.

## Palette A — Logo True

| Token | Hex | Use |
|---|---|---|
| Raspberry | `#E94560` | Primary, Play / Export, accents |
| Raspberry light | `#FF6B81` | Hover / highlight on dark |
| Raspberry dark | `#C22E47` | Accent on light |
| Purple | `#533483` | Secondary, selection, bottom rule |
| Purple light | `#7A5CAB` | Secondary on dark, info |
| Purple deep | `#3A235F` | Deep backgrounds |
| Ink | `#1A1A2E` | Primary dark surface, text on light |
| Ink deep | `#12122A` | App background (dark theme) |
| Ink panel | `#23233F` | Panels (dark theme) |
| Ink panel 2 | `#2B2B4A` | Raised panels (dark theme) |
| Paper | `#F5F5F5` | Light background, text on dark |
| Paper dim | `#E9E9F2` | Alt light background |
| Muted on dark | `#A8A8C0` | Secondary text on dark |
| Muted on light | `#5C5C78` | Secondary text on light |
| Success | `#2FBF71` | — |
| Warning | `#FFB224` | — |
| Danger | `#E94560` | Danger *is* raspberry |
| Info | `#7A5CAB` | — |

What died with the old palette: indigo `#6366F1` / `#818CF8`. It matched
nothing in the logo and appears nowhere in this pack. No gradients, no
shadows baked into the logo, no Erthiox gold.

Full token files: `tokens.css` (drop-in `:root` + `[data-theme="light"]`) and
`tokens.json` (same values for the editor / export templates).

## Type

**Outfit** everywhere — wordmark, editor UI, exported-game chrome.
Google Fonts, OFL licence. Bold (700) for the wordmark and headings,
Regular (400) / Medium (500) for UI text. The old monospace wordmark is retired.

## Banner fix (2026-11-12, Artem's call)
v1 banner was bad: the grey tagline almost touched the logo (mark ended
y≈260, tagline baseline y=268) and the grey was too dim. v2: mark shrunk to
144px and raised (y=48, ends y=192), tagline dropped to y=272 in brighter
`#C9C9DC` — 54px clear gap — dots faded to 8%, and a FREE FOREVER pill was
added top-right. Re-render with `office/build-branding-pack.py` after any
banner change, and eyeball the PNG before calling it done.

## Files

```
svg/  — source of truth (edit these, re-render PNGs with office/build-branding-pack.py)
  glix-mark.svg              mark only, transparent
  glix-mark-app-icon.svg     512 app icon, ink rounded square
  glix-wordmark-dark.svg     mark + glix on ink (360x200)
  glix-wordmark-light.svg    mark + glix, transparent, ink text (360x200)
  glix-favicon.svg           simplified 7-cell grid, no triangle (32)
  glix-github-banner.svg     1280x320
  glix-social-preview.svg    1280x640
  glix-splash.svg            800x500, editor welcome screen
png/  — rendered from the SVGs (same geometry)
  glix-mark-512/256/128/64.png
  glix-app-icon-512.png
  glix-favicon-180/64/32.png
  glix-wordmark-dark-720.png / glix-wordmark-light-720.png
  glix-github-banner-1280.png
  glix-social-preview-1280.png
  glix-splash-800.png
tokens.css / tokens.json
```

## Rules

- Clear space around the mark: at least one cell-width on all sides.
- Minimum sizes: mark 24px, wordmark 120px wide. Below that, use the
  favicon (simplified grid, no triangle) — the triangle muddies under 32px.
- Don't recolour the cells, don't stretch the mark, don't put raspberry text
  on a raspberry background, don't add a gradient or drop shadow to the logo,
  don't use indigo anywhere.
- Dark theme is the default (ink deep bg, paper text, raspberry accent).
  Light theme is paper bg, ink text, raspberry accent (dark variant for hover).

## Wiring it into the engine (Phase 3, not done yet)

- Replace the `--glix-*` tokens in `packages/editor/src/index.css` /
  `mobile.css` with `tokens.css`.
- Swap `packages/editor/public/favicon.svg`, `logo-mark-dark.svg`,
  `logo-wordmark-*.svg`, `social-preview.svg` for the new files, and use
  `glix-splash.svg` on the welcome screen.
- Exported games use the same tokens for the fullscreen button, the
  Tap-to-start overlay, and the virtual gamepad.
