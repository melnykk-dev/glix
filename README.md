# Glix

Ultra-fast, local-first game engine for the modern web.
Powerful ECS architecture meets an intuitive visual editor.

**A fun, local-first 2D game engine for the browser.**  
Build games visually. Save as a single `.glix` file. No installs, no accounts, no backend.

---

## What is Glix?

Glix is a browser-based 2D game engine with a built-in visual editor. You open it in any browser, build your game, and save everything to a single `.glix` file on your own machine. Share projects by sharing the file. Export finished games as standalone HTML.

It sits between **Godot** (powerful but desktop-only) and **PlayCanvas** (browser-based but account-required). Glix is designed for indie developers who want fast iteration in a tool that gets out of the way.

## Features

- **Visual editor** — viewport, hierarchy, inspector, script editor, all in the browser
- **Entity-Component System** — clean architecture, fully scriptable with TypeScript
- **WebGL2 renderer** — batched sprite rendering, custom shaders, post-processing
- **2D physics** — rigid bodies and collision via Planck.js
- **Tilemap editor** — paint tiles, auto-collision, multiple layers
- **Local-first storage** — everything lives in your `.glix` file, auto-saved to IndexedDB
- **One-click export** — self-contained HTML bundle, runs anywhere
- **No accounts required** — open the URL and start building

## Project File Format

Every Glix project is a `.glix` file — a single JSON document containing your scenes, entities, components, and all assets base64-encoded inline.

`Ctrl+S` — save to `.glix` file  
`Ctrl+O` — open a `.glix` file  
`Download` — export standalone game

## Tech Stack

| Layer | Choice |
|---|---|
| Engine runtime | TypeScript + WebGL2 + gl-matrix |
| Physics | Planck.js |
| Editor UI | React + Vite + Zustand |
| Scripting | Monaco Editor + esbuild-wasm |
| Persistence | IndexedDB + File System Access API |
| Monorepo | pnpm workspaces |

## Repo Structure

```
glix/
├── packages/
│   ├── runtime/     # Engine core — ECS, WebGL2, physics, audio
│   ├── editor/      # React SPA — editor UI, panels, file I/O
│   └── shared/      # Types, .glix schema, utilities
├── pnpm-workspace.yaml
└── package.json
```

## Status

Glix is now fully featured and stable. Enjoy building games!

## License

MIT

---

<div align="center">
  <sub>Built with passion for game devs.</sub>
</div>
