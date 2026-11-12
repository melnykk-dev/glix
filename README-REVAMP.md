# Glix revamp — full main-branch replacement (2026-11-12)

This zip is the complete revamped Glix engine, built locally and verified
headless. It replaces the ENTIRE contents of the `main` branch of
`melnykk-dev/glix` (last commit `71b8381`). No commits were made by Muse;
this zip is the delivery.

## How to apply

1. Check out `main`, delete everything in the repo root (except `.git`).
2. Copy the contents of `glix-revamp/` into the repo root.
3. `git add -A && git commit -m "Glix revamp: studio-level engine (Godot 2D parity 94%)" && git push`

Everything the engine needs is inside: source, templates, real CC0 art/audio,
Harvest Valley demo, branding pack (`branding-pack/`), license file.

## What is in here

- **Runtime** (`packages/runtime`): WebGL2 engine, Physics (Planck.js),
  Animation, Particles, Audio, Input (keyboard/gamepad/touch), Lighting,
  Signals, Tween, AnimationPlayer, Autoloads, UI widgets (incl. textbox,
  scroll view), deterministic fixed-step simulation, Viewport (expand/fit/
  stretch), Y-sort layering, SaveBridge (IndexedDB saves).
- **Editor** (`packages/editor`): Palette A branding (raspberry/purple,
  indigo removed), 4 docked panels (AnimationPlayer, Extensions,
  MobileController, InputRebinding), mobile bottom nav at 390px, FileIO v2
  (ZIP project files, v1 migration, broken-asset banner), mobile controller
  panel with live preview, viewport-mode picker.
- **Extensions** (`packages/shared`, `packages/runtime/src/plugins`):
  real per-extension Worker sandbox, `.glixext` zip pack/unpack, manifest
  validation in plain language, `grantedPermissions` in the project file.
- **Templates** (`packages/editor/src/templates`): topdown farm, platformer,
  space shooter, empty — all with real Kenney CC0 art/audio and layered
  draw order. Plus **Harvest Valley** (farming demo: till/plant/water/
  harvest, day clock, sleep+save, shop, NPC quest, fishing).
- **Quick actions** (`packages/shared/src/Behaviors.ts`): 24 behaviours —
  Player (top-down + platformer), Enemy Chase/Patrol, Prey, NPC Wander,
  Collectible, Projectile Shooter, Health — now on the script action API,
  so they follow input rebinding.
- **Branding** (`branding-pack/`): Logo True palette A, tokens
  (CSS/JSON), SVG + PNG logos, wordmark, favicon, LinkedIn banner v2
  (tagline gap fixed), YouTube banner.
- **Licenses**: `THIRD_PARTY_LICENSES.md` covers every shipped asset
  (Kenney CC0 1.0, Outfit SIL OFL 1.1). Coverage check: 151/151.

## Verified headless (all re-run by Muse, 2026-11-12)

- tsc clean in shared / runtime / editor (0 errors each)
- Harness totals: quick-actions 24/24, integration 25/25, ext-worker
  115/115, licenses 151/151, export 57/57, templates-live 69/69,
  template-script-guards 8/8 — plus the earlier sweep's 866 checks
- Godot 2D parity: 47/50 (94%) — bar was 35/50 (70%)
- Studio Gate: 7/8 headless. Only item 6 (editor at 390px on a real
  phone) is NOT YET, and items 2/5 still owe their real-phone rows.

## Still open — needs Artem

1. **Real-phone checklist**: `office/REAL_PHONE_CHECKLIST.md` was in the
   office files, not in this zip (it lives outside the repo). Run it on
   your iPhone before calling the engine done — it is the final check
   for gate items 2, 5 and 6.
2. **Repo LICENSE**: README says MIT but there is no LICENSE file.
   Confirm MIT + the copyright holder name, and add it.
3. **Farm framing**: in expand mode the farm looks small on tall phones
   (player ~11px). Accept it, or ship the farm template zoomed in.

## Known small gaps (not gate-blocking)

- Coin pickup and laser sounds are single-fire now (guarded); farm
  `ui-click` sound has no in-game trigger yet.
- Extension-contributed panels are counted, not rendered; physical
  gamepad polling not built; Canvas2D renderer fallback deferred.
- Editor still runs on the v1 in-memory model; FileIO is the v2
  translation boundary. Outfit still loads from Google Fonts.
- Exported games use the inline base64 favicon (no `/favicon.ico` 404).
