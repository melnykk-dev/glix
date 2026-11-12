# Harvest Valley — Glix proof game (Studio Gate item 5)

A small Stardew Valley-like demo: farm, sleep/save, shop, NPC + quest,
fishing. Built entirely from real Kenney CC0 art (Tiny Farm + Tiny Town).
All work is local; nothing is pushed to GitHub.

## Files

- `harvest-valley.glix` — the game (v1 project, 143 KB, 72 entities).
  Rebuild it any time with `python3 build.py` (copies the current farm art
  out of `topdown.glix`, packs the pond water tiles, compiles the scripts
  with esbuild, writes the .glix).
- `scripts/GameManager.ts` — all game state: clock/day, coins, seeds, bag,
  quest, plots, shop, dialogue, fishing, save/load, HUD, camera follow.
- `scripts/PlayerController.ts` — movement (WASD / arrows / touch D-pad /
  gamepad stick) + input forwarding (`hv:interact` / `hv:key` / `hv:cancel`).
- `scripts/NpcWander.ts` — wander behaviour for Mira and the chicken.
- `CREDITS.md` — art sources and licences.

## How to open and play

In the editor: pick **Harvest Valley** on the Welcome screen (or in New
Project) — it is registered as a template — then press Play. Or **File →
Open** and pick `harvest-valley.glix`.

Export: open the project, **Export** → standalone HTML. The exporter takes
any loaded `MgexFile`, so no export changes were needed. The mobile
controller defaults apply (`visibility: auto`, `dpad-buttons`) because the
project has no `mobileController` section yet — add one to force the pad
visible while developing on desktop.

## Controls

- Move: WASD / arrows, touch D-pad, or gamepad left stick.
- `E` / `Space` / pad `A`: context action (till, plant, water, harvest,
  talk, shop, fish, sleep). `Esc` / pad `B`: close / cancel.
- `1` Hoe, `2` Seeds, `3` Watering can, `Q` switch seed (tomato / carrot).
- Shop (open at the stall): `1` buy tomato seed (10c), `2` buy carrot seed
  (15c), `3` sell all, `4` close — or tap the on-screen buttons.

## The game loop

Start with 20c and 2 tomato seeds. Till a plot (hoe), plant (seeds), water
(can) — a watered crop grows one stage per 20s, 3 stages to ripe. Harvest
with E, sell at Mira's stall. Mira (the villager) gives the quest: bring
her 3 tomatoes for 50c. Fish at the pond: press E when the marker is in the
green zone. Sleep in the farmhouse bed to advance to the next day — sleeping
saves the game and grows watered crops one stage overnight.

## Save / load — host bridge (IMPLEMENTED 2026-11-12)

There is no engine storage API for scripts (the sandbox blocks
`localStorage`/`IndexedDB` by design), so the game exposes a bridge — and
the host side is now built in the runtime, not in each host:

- `GameManager.serialize()` → save JSON; `restore(json)` applies it.
- On sleep the script emits `hv:save` `{ save }` on the engine event bus
  and stashes it at `engine.__hvSave`.
- `packages/runtime/src/storage/SaveBridge.ts` (attached in
  `ScriptSystem.init()`, before any script's `onStart` — one attach covers
  editor Play mode AND the exported page): listens for `hv:save` and writes
  the JSON to IndexedDB (db `GlixGameSaves`, store `saves`, key `hv-save`);
  on `hv:load-request` (emitted by `GameManager.onStart` when no save was
  injected synchronously) it reads IndexedDB and calls
  `engine.__hvGame.restoreFromSave(save)`, which restores, refreshes the
  HUD and greets the player. The bridge never throws: no IndexedDB (plain
  Node) is a silent no-op, corrupt saves are warned about, never fatal.
- The synchronous path still works too: a host may set
  `engine.__hvSaveData = <json>` before the scene loads — `GameManager`
  reads it in `onStart()`. `engine.__hvGame` is the live manager instance
  (harness + console debugging).

Harnesses: `~/workspace/glix-revamp/office/harness/hv-save/` —
`build-and-test.sh` (Node, fake IndexedDB: sleep → persist → fresh boot
restores day/coins/seeds/plot/player/HUD; empty-storage fresh start;
corrupt save ignored) **29/29**, and `test-hv-save-export.py`
(Playwright, real browser + real IndexedDB: export from the Welcome
screen → farm → sleep → reload → day 2 + planted stage-1 crop + HUD,
0 console errors) **ALL PASS**.

## Verification

Harness: `~/workspace/glix-revamp/office/harness/harvest-valley/` —
`build-and-test.sh` bundles the real `World` + `PhysicsSystem` +
`ScriptSystem` + `SceneLoader` with a fake input/audio layer and runs a
scripted playthrough: **47/47 checks pass** (boot with no script errors,
keyboard + touch-D-pad movement, till → plant → water → grow → harvest,
sleep + save emitted + restore round-trip, shop buy/sell/close, NPC quest
complete for 50c, fishing catch in the green zone, Mira wanders).
`tsc --noEmit`: editor 0, runtime 0, shared 0.

## Known gaps (honest)

- No real-phone playtest yet (headless Chromium only); the 10-minute phone
  playtest is still owed (see REAL_PHONE_CHECKLIST.md section C).
- No fish sprite exists in the CC0 packs — the catch is HUD text + coins.
  No fences in Tiny Farm either; the farm border is pine trees.
- Crops have 3 growth stages (sprout → leafy → mature), not 5 — the packs
  have no uniform 5-stage crop set.
- The bed tile (Tiny Farm tile 110) reads as a wooden trough with a blue
  mattress; it is the sleep spot inside the farmhouse.
- Scripts cannot read InputMap actions (`ScriptComponent._engine` is
  private), so movement/interact use raw keys + `pad:*` touch sources and
  will not follow custom action rebinding until a script action API exists.
