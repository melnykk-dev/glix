// Harvest Valley — GameManager
// Type-only import so the editor's tsc can resolve the base class: at
// runtime ScriptComponent is a sandbox global provided by ScriptSandbox,
// never imported. `import type` + `declare const` are both erased by
// esbuild, so the compiled script has no require() and the sandbox stays
// intact. All this.* members below are the real ScriptComponent API.
import type { ScriptComponent as _ScriptComponent } from '@glix/runtime';
declare const ScriptComponent: typeof _ScriptComponent;
// Owns ALL game state: clock/day, coins, seeds, harvest bag, quest, plots,
// shop, dialogue, fishing, save/load. The player script only forwards input
// as events (hv:interact / hv:key / hv:cancel); this script decides what
// happens. HUD + dialogue + fishing bar are UI entities mutated in place.
//
// Persistence contract (no engine storage API exists yet):
//   - serialize() returns the save JSON; restore(json) applies it.
//   - On sleep, this script emits `hv:save` { save } on the event bus AND
//     stashes it at engine.__hvSave. The host (editor Play mode / exported
//     page) listens for hv:save and writes the JSON to IndexedDB, and on
//     boot sets engine.__hvSaveData before the scene loads; onStart() reads
//     it back here. See harvest-valley/README.md for the host snippet.
//   - Test/debug hook: engine.__hvGame is this instance (harness + console).
//
// World coordinates: tilemap transform (-8, 6.5), 16x13 tiles.
// Tile (col,row) centre = (col - 7.5, 6.0 - row).
// Layering (matches the layering team's topdown.glix): ground tilemaps
// layer 0, every sprite layer 1 with ySort.

type CropKind = 'tomato' | 'carrot';
type ToolKind = 'hoe' | 'seeds' | 'can';

interface PlotState {
  col: number;
  row: number;
  x: number;
  y: number;
  state: 'grass' | 'tilled' | 'planted';
  crop: CropKind | '';
  stage: number; // 0 sprout, 1 growing, 2 mature
  watered: boolean;
  timer: number; // seconds of watered growth in the current stage
  sprite: any; // crop sprite entity id, or -1
}

const STAGE_TIME = 20; // seconds of watered growth per stage
const DAY_MINUTES = 960; // 06:00 -> 22:00
const DAY_START_MINUTES = 360; // 06:00
const DAY_LENGTH_SECONDS = 480; // one full day = 8 real minutes
const CROP_DEFS: Record<CropKind, { seedPrice: number; sellPrice: number; matureRegion: string }> = {
  tomato: { seedPrice: 10, sellPrice: 12, matureRegion: 'tomato' },
  carrot: { seedPrice: 15, sellPrice: 18, matureRegion: 'carrot' },
};
const FISH_SELL_PRICE = 15;
const QUEST_REWARD = 50;
const FISH_ZONE: [number, number] = [0.35, 0.65];

class GameManager extends ScriptComponent {
  // --- persistent state ---
  day = 1;
  minutes = DAY_START_MINUTES;
  coins = 20;
  seeds: Record<CropKind, number> = { tomato: 2, carrot: 0 };
  bag: Record<'tomato' | 'carrot' | 'fish', number> = { tomato: 0, carrot: 0, fish: 0 };
  quest: 'none' | 'active' | 'done' = 'none';
  tool: ToolKind = 'hoe';
  seedType: CropKind = 'tomato';

  // --- transient state ---
  plots: PlotState[] = [];
  dialogueTimer = 0;
  shopOpen = false;
  fishing = false;
  fishMarker = 0;
  fishDir = 1;
  private dialogueText = '';
  private uiHiddenY = 2000;

  onStart(): void {
    // Debug/test hook for the harness and the editor console.
    const engine = (this as any)._engine;
    if (engine) engine.__hvGame = this;

    // 6 plots, 2 rows x 3 cols, rows 5-6 / cols 4-6 of the tilemap.
    const cols = [4, 5, 6];
    const rows = [5, 6];
    for (const row of rows) {
      for (const col of cols) {
        this.plots.push({
          col,
          row,
          x: col - 7.5,
          y: 6.0 - row,
          state: 'grass',
          crop: '',
          stage: 0,
          watered: false,
          timer: 0,
          sprite: -1,
        });
      }
    }

    this.eventBus.on('hv:interact', (data: any) => this.onInteract(data.x, data.y));
    this.eventBus.on('hv:key', (data: any) => this.onKey(data.code));
    this.eventBus.on('hv:cancel', () => this.onCancel());
    this.eventBus.on('hv:shop-buy-tomato', () => this.buySeed('tomato'));
    this.eventBus.on('hv:shop-buy-carrot', () => this.buySeed('carrot'));
    this.eventBus.on('hv:shop-sell-all', () => this.sellAll());
    this.eventBus.on('hv:shop-close', () => this.closeShop());

    // Restore a save the host injected before the scene loaded, if any.
    // Otherwise ask the host save bridge (IndexedDB) for the save — it
    // restores asynchronously via restoreFromSave() once the read resolves.
    let restoredFromHost = false;
    if (engine && typeof engine.__hvSaveData === 'string' && engine.__hvSaveData.length > 2) {
      try {
        this.restore(engine.__hvSaveData);
        restoredFromHost = true;
        this.showDialogue('Welcome back to Harvest Valley! Day ' + this.day + '.');
      } catch (e) {
        console.warn('[Harvest Valley] Save data was corrupt, starting fresh:', (e as Error).message);
      }
    }
    if (!restoredFromHost) this.eventBus.emit('hv:load-request', undefined);

    this.hideDialogue();
    this.hideFishingBar();
    this.updateHud();
  }

  onUpdate(dt: number): void {
    // Clock: one full day (06:00-22:00) lasts DAY_LENGTH_SECONDS.
    if (!this.shopOpen && !this.fishing) {
      this.minutes += (dt / DAY_LENGTH_SECONDS) * DAY_MINUTES;
      if (this.minutes >= DAY_START_MINUTES + DAY_MINUTES) {
        this.minutes = DAY_START_MINUTES + DAY_MINUTES;
      }
    }

    // Crop growth: watered plots advance one stage per STAGE_TIME seconds.
    for (const plot of this.plots) {
      if (plot.state === 'planted' && plot.watered && plot.stage < 2) {
        plot.timer += dt;
        if (plot.timer >= STAGE_TIME) {
          plot.timer = 0;
          plot.stage += 1;
          this.setCropSprite(plot);
        }
      }
    }

    // Fishing marker sweeps back and forth.
    if (this.fishing) {
      this.fishMarker += this.fishDir * dt * 0.9;
      if (this.fishMarker >= 1) {
        this.fishMarker = 1;
        this.fishDir = -1;
      } else if (this.fishMarker <= 0) {
        this.fishMarker = 0;
        this.fishDir = 1;
      }
      this.updateFishingBar();
    }

    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0 && !this.shopOpen) this.hideDialogue();
    }

    // Camera follows the player.
    const player = this.findEntityByName('Player');
    if (player !== undefined) {
      const t = this.getComponent<any>(player, 'transform');
      if (t) this.setCameraPosition(t.x, t.y);
    }

    this.updateHud();
  }

  // --- input routing -------------------------------------------------------

  private onInteract(px: number, py: number): void {
    if (this.shopOpen) return; // shop keys/buttons handle input while open
    if (this.fishing) {
      this.tryCatchFish();
      return;
    }

    const near = (x: number, y: number, r: number) =>
      Math.hypot(px - x, py - y) <= r;

    // Bed (sleep) — inside the house, tiles (3.5..4.5, 2.0).
    if (near(4.0, 2.0, 1.4)) {
      this.sleep();
      return;
    }
    // Shop stall counter (1.5..2.5, -1.0).
    if (near(2.0, -1.0, 1.5)) {
      this.openShop();
      return;
    }
    // Pond south edge (-4.0, -2.0).
    if (near(-4.0, -2.0, 1.6)) {
      this.startFishing();
      return;
    }
    // Mira the villager.
    const mira = this.findEntityByName('Mira');
    if (mira !== undefined) {
      const t = this.getComponent<any>(mira, 'transform');
      if (t && near(t.x, t.y, 1.5)) {
        this.talkToMira();
        return;
      }
    }
    // Crop plots.
    let best: PlotState | null = null;
    let bestD = 1.4;
    for (const plot of this.plots) {
      const d = Math.hypot(px - plot.x, py - plot.y);
      if (d < bestD) {
        bestD = d;
        best = plot;
      }
    }
    if (best) this.useToolOnPlot(best);
  }

  private onKey(code: string): void {
    if (this.shopOpen) {
      if (code === 'Digit1') this.buySeed('tomato');
      else if (code === 'Digit2') this.buySeed('carrot');
      else if (code === 'Digit3') this.sellAll();
      else if (code === 'Digit4') this.closeShop();
      return;
    }
    if (this.fishing) return;
    if (code === 'Digit1') {
      this.tool = 'hoe';
      this.showDialogue('Tool: Hoe — till soil, harvest ripe crops.');
    } else if (code === 'Digit2') {
      this.tool = 'seeds';
      this.showDialogue('Tool: Seeds (' + this.seedType + ') — press Q to switch crop.');
    } else if (code === 'Digit3') {
      this.tool = 'can';
      this.showDialogue('Tool: Watering Can — water planted crops so they grow.');
    } else if (code === 'KeyQ') {
      this.seedType = this.seedType === 'tomato' ? 'carrot' : 'tomato';
      if (this.tool !== 'seeds') this.tool = 'seeds';
      this.showDialogue('Seeds: ' + this.seedType + ' (have ' + this.seeds[this.seedType] + ').');
    }
  }

  private onCancel(): void {
    if (this.shopOpen) {
      this.closeShop();
      return;
    }
    if (this.fishing) {
      this.fishing = false;
      this.hideFishingBar();
      this.showDialogue('You reel in and walk away from the pond.');
      return;
    }
    this.hideDialogue();
  }

  // --- farming -------------------------------------------------------------

  private groundTilemap(): any {
    const ground = this.findEntityByName('Valley Ground');
    if (ground === undefined) return null;
    return this.getComponent<any>(ground, 'tilemap');
  }

  private setPlotTile(plot: PlotState, tile: number): void {
    const tm = this.groundTilemap();
    if (!tm || !tm.layers || !tm.layers[1]) return;
    // Details layer is layers[1]; -1 = empty (shows the grass Ground layer).
    tm.layers[1].tiles[plot.row][plot.col] = tile;
  }

  private useToolOnPlot(plot: PlotState): void {
    if (plot.state === 'grass') {
      if (this.tool !== 'hoe') {
        this.showDialogue('This grass needs the Hoe first (press 1).');
        return;
      }
      plot.state = 'tilled';
      // Tilled row tiles: 60 / 61 / 62 across the row.
      this.setPlotTile(plot, 60 + (plot.col % 3));
      this.playClick();
      this.showDialogue('Tilled! Now plant seeds (press 2).');
      return;
    }

    if (plot.state === 'tilled') {
      if (this.tool !== 'seeds') {
        this.showDialogue('Tilled soil — plant seeds (press 2).');
        return;
      }
      if (this.seeds[this.seedType] <= 0) {
        this.showDialogue('No ' + this.seedType + ' seeds left — buy more at the stall.');
        return;
      }
      this.seeds[this.seedType] -= 1;
      plot.state = 'planted';
      plot.crop = this.seedType;
      plot.stage = 0;
      plot.watered = false;
      plot.timer = 0;
      plot.sprite = this.spawn('Crop-' + plot.col + '-' + plot.row, {
        transform: { x: plot.x, y: plot.y, rotation: 0, scaleX: 1, scaleY: 1 },
        sprite: {
          textureId: 'farm-atlas-tex',
          width: 0.9,
          height: 0.9,
          pivotX: 0.5,
          pivotY: 0.5,
          region: 'grass',
        },
        sortingLayer: { layer: 1, orderInLayer: 0, ySort: true },
      });
      this.playClick();
      this.showDialogue('Planted ' + this.seedType + '! Water it (press 3).');
      return;
    }

    // Planted.
    if (plot.stage >= 2) {
      const crop = plot.crop as CropKind;
      this.bag[crop] += 1;
      if (plot.sprite !== -1) this.destroyEntity(plot.sprite);
      plot.sprite = -1;
      plot.state = 'tilled';
      plot.crop = '';
      plot.stage = 0;
      plot.watered = false;
      plot.timer = 0;
      this.setPlotTile(plot, 60 + (plot.col % 3));
      this.playClick();
      this.showDialogue(
        'Harvested 1 ' + crop + '! Bag: ' + this.bag[crop] + ' (sell at the stall).'
      );
      return;
    }
    if (this.tool === 'can') {
      if (plot.watered) {
        this.showDialogue('Already watered — give it time to grow.');
        return;
      }
      plot.watered = true;
      this.setPlotTile(plot, 48);
      this.playClick();
      this.showDialogue('Watered! It will grow while the soil stays wet.');
      return;
    }
    if (this.tool === 'hoe') {
      this.showDialogue('It is growing — water it (press 3), don\'t dig it up.');
      return;
    }
    this.showDialogue('Growing... keep it watered and wait.');
  }

  private setCropSprite(plot: PlotState): void {
    if (plot.sprite === -1 || !plot.crop) return;
    const sprite = this.getComponent<any>(plot.sprite, 'sprite');
    if (!sprite) return;
    if (plot.stage === 0) sprite.region = 'grass';
    else if (plot.stage === 1) sprite.region = 'tomato_plant';
    else sprite.region = CROP_DEFS[plot.crop as CropKind].matureRegion;
  }

  // --- shop ----------------------------------------------------------------

  private openShop(): void {
    this.shopOpen = true;
    this.eventBus.emit('hv:freeze', { frozen: true });
    this.showShopPanel(true);
    this.setDialogueText(
      'Mira\'s Stall — Day ' + this.day + '\n' +
      'Tomato seeds 10c  |  Carrot seeds 15c\n' +
      'Sell: tomato 12c, carrot 18c, fish 15c\n' +
      'Coins: ' + this.coins + '   (keys 1-4 or tap the buttons)'
    );
  }

  private closeShop(): void {
    this.shopOpen = false;
    this.eventBus.emit('hv:freeze', { frozen: false });
    this.showShopPanel(false);
    this.hideDialogue();
  }

  private buySeed(kind: CropKind): void {
    if (!this.shopOpen) return;
    const price = CROP_DEFS[kind].seedPrice;
    if (this.coins < price) {
      this.setDialogueText('Not enough coins for ' + kind + ' seeds (' + price + 'c).');
      return;
    }
    this.coins -= price;
    this.seeds[kind] += 1;
    this.playClick();
    this.setDialogueText(
      'Bought 1 ' + kind + ' seed for ' + price + 'c.\n' +
      'Coins: ' + this.coins + '  |  Seeds: tomato ' + this.seeds.tomato +
      ', carrot ' + this.seeds.carrot
    );
  }

  private sellAll(): void {
    if (!this.shopOpen) return;
    const earned =
      this.bag.tomato * CROP_DEFS.tomato.sellPrice +
      this.bag.carrot * CROP_DEFS.carrot.sellPrice +
      this.bag.fish * FISH_SELL_PRICE;
    if (earned === 0) {
      this.setDialogueText('Nothing to sell — harvest crops or catch a fish first.');
      return;
    }
    this.coins += earned;
    const sold =
      this.bag.tomato + ' tomato, ' + this.bag.carrot + ' carrot, ' + this.bag.fish + ' fish';
    this.bag.tomato = 0;
    this.bag.carrot = 0;
    this.bag.fish = 0;
    this.playClick();
    this.setDialogueText('Sold ' + sold + ' for ' + earned + 'c. Coins: ' + this.coins + '.');
  }

  // --- NPC + quest -----------------------------------------------------------

  private talkToMira(): void {
    if (this.quest === 'none') {
      this.quest = 'active';
      this.showDialogue(
        'Mira: "Morning! The village feast needs tomatoes.\n' +
        'Bring me 3 tomatoes and I will pay you 50c."'
      );
    } else if (this.quest === 'active') {
      if (this.bag.tomato >= 3) {
        this.bag.tomato -= 3;
        this.coins += QUEST_REWARD;
        this.quest = 'done';
        this.playClick();
        this.showDialogue(
          'Mira: "Three perfect tomatoes! Thank you!"\nQuest complete — +' + QUEST_REWARD + 'c. Coins: ' + this.coins + '.'
        );
      } else {
        this.showDialogue(
          'Mira: "I still need 3 tomatoes for the feast.\nYou have ' + this.bag.tomato + ' in your bag."'
        );
      }
    } else {
      this.showDialogue('Mira: "Thanks again for the tomatoes. The feast will be lovely!"');
    }
  }

  // --- fishing ---------------------------------------------------------------

  private startFishing(): void {
    this.fishing = true;
    this.fishMarker = 0;
    this.fishDir = 1;
    this.eventBus.emit('hv:freeze', { frozen: true });
    this.showFishingBar();
    this.showDialogue('Fishing! Press E when the marker is in the green zone.');
  }

  private tryCatchFish(): void {
    this.fishing = false;
    this.eventBus.emit('hv:freeze', { frozen: false });
    this.hideFishingBar();
    if (this.fishMarker >= FISH_ZONE[0] && this.fishMarker <= FISH_ZONE[1]) {
      this.bag.fish += 1;
      this.playClick();
      this.showDialogue('Caught a fish! Fish in bag: ' + this.bag.fish + ' (sell: 15c).');
    } else {
      this.showDialogue('It got away... the marker was outside the green zone.');
    }
  }

  // --- sleep / save / load -----------------------------------------------------

  private sleep(): void {
    // Overnight, watered crops grow one stage.
    for (const plot of this.plots) {
      if (plot.state === 'planted' && plot.watered && plot.stage < 2) {
        plot.stage += 1;
        plot.timer = 0;
        this.setCropSprite(plot);
      }
      plot.watered = false;
      if (plot.state === 'planted') this.setPlotTile(plot, 60 + (plot.col % 3));
    }
    this.day += 1;
    this.minutes = DAY_START_MINUTES;
    // Wake up by the bed BEFORE serializing, so the save records the
    // wake-up spot (4.0, 1.0) — not the bed tile (4.0, 2.0) the player
    // slept on. Otherwise reload spawns the player on the bed.
    const player = this.findEntityByName('Player');
    if (player !== undefined) this.setPositionFor(player, 4.0, 1.0);
    const save = this.serialize();
    const engine = (this as any)._engine;
    if (engine) engine.__hvSave = save;
    this.eventBus.emit('hv:save', { save });
    this.showDialogue('Day ' + this.day + ' — you wake up rested. Game saved.');
  }

  private setPositionFor(entity: any, x: number, y: number): void {
    const t = this.getComponent<any>(entity, 'transform');
    if (t) {
      t.x = x;
      t.y = y;
    }
    this.physics.teleport(entity, x, y);
  }

  serialize(): string {
    return JSON.stringify({
      version: 1,
      day: this.day,
      minutes: Math.round(this.minutes),
      coins: this.coins,
      seeds: this.seeds,
      bag: this.bag,
      quest: this.quest,
      tool: this.tool,
      seedType: this.seedType,
      plots: this.plots.map((p) => ({
        col: p.col,
        row: p.row,
        state: p.state,
        crop: p.crop,
        stage: p.stage,
        watered: p.watered,
        timer: p.timer,
      })),
      player: (() => {
        const player = this.findEntityByName('Player');
        if (player === undefined) return null;
        const t = this.getComponent<any>(player, 'transform');
        return t ? { x: t.x, y: t.y } : null;
      })(),
    });
  }

  /** Host save-bridge entry point: apply a save loaded from IndexedDB
   * after onStart (the read is async). Refreshes the HUD and greets the
   * player. Called by the runtime SaveBridge; never call from a script. */
  restoreFromSave(save: string): void {
    this.restore(save);
    this.updateHud();
    this.showDialogue('Welcome back to Harvest Valley! Day ' + this.day + '.');
  }

  restore(json: string): void {
    const data = JSON.parse(json);
    this.day = data.day ?? 1;
    this.minutes = data.minutes ?? DAY_START_MINUTES;
    this.coins = data.coins ?? 20;
    this.seeds = { tomato: 2, carrot: 0, ...(data.seeds ?? {}) };
    this.bag = { tomato: 0, carrot: 0, fish: 0, ...(data.bag ?? {}) };
    this.quest = data.quest ?? 'none';
    this.tool = data.tool ?? 'hoe';
    this.seedType = data.seedType ?? 'tomato';

    // Clear existing crop sprites, then rebuild plots from the save.
    for (const plot of this.plots) {
      if (plot.sprite !== -1) {
        this.destroyEntity(plot.sprite);
        plot.sprite = -1;
      }
    }
    for (const saved of data.plots ?? []) {
      const plot = this.plots.find((p) => p.col === saved.col && p.row === saved.row);
      if (!plot) continue;
      plot.state = saved.state;
      plot.crop = saved.crop ?? '';
      plot.stage = saved.stage ?? 0;
      plot.watered = !!saved.watered;
      plot.timer = saved.timer ?? 0;
      if (plot.state === 'grass') {
        this.setPlotTile(plot, -1);
      } else if (plot.state === 'tilled') {
        this.setPlotTile(plot, 60 + (plot.col % 3));
      } else {
        this.setPlotTile(plot, plot.watered ? 48 : 60 + (plot.col % 3));
        plot.sprite = this.spawn('Crop-' + plot.col + '-' + plot.row, {
          transform: { x: plot.x, y: plot.y, rotation: 0, scaleX: 1, scaleY: 1 },
          sprite: {
            textureId: 'farm-atlas-tex',
            width: 0.9,
            height: 0.9,
            pivotX: 0.5,
            pivotY: 0.5,
            region: 'grass',
          },
          sortingLayer: { layer: 1, orderInLayer: 0, ySort: true },
        });
        this.setCropSprite(plot);
      }
    }
    if (data.player) {
      const player = this.findEntityByName('Player');
      if (player !== undefined) this.setPositionFor(player, data.player.x, data.player.y);
    }
  }

  // --- HUD / dialogue / fishing bar -------------------------------------------

  private clockText(): string {
    const total = Math.floor(this.minutes);
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    return 'Day ' + this.day + '  ' + pad(hh) + ':' + pad(mm);
  }

  private setLabel(name: string, text: string): void {
    const e = this.findEntityByName(name);
    if (e === undefined) return;
    const label = this.getComponent<any>(e, 'uiLabel');
    if (label) label.text = text;
  }

  private setUiOffsetY(name: string, y: number): void {
    const e = this.findEntityByName(name);
    if (e === undefined) return;
    const t = this.getComponent<any>(e, 'uiTransform');
    if (t) t.offsetY = y;
  }

  private setUiOffset(name: string, x: number, y: number): void {
    const e = this.findEntityByName(name);
    if (e === undefined) return;
    const t = this.getComponent<any>(e, 'uiTransform');
    if (t) {
      t.offsetX = x;
      t.offsetY = y;
    }
  }

  private updateHud(): void {
    const toolName =
      this.tool === 'hoe' ? 'Hoe (1)' : this.tool === 'seeds' ? 'Seeds (2)' : 'Can (3)';
    this.setLabel(
      'HUD-Status',
      this.clockText() + '   |   Coins: ' + this.coins + 'c   |   Tool: ' + toolName +
        (this.tool === 'seeds' ? ' [' + this.seedType + ', Q to switch]' : '')
    );
    this.setLabel(
      'HUD-Inv',
      'Seeds: tomato ' + this.seeds.tomato + ', carrot ' + this.seeds.carrot +
        '   |   Bag: tomato ' + this.bag.tomato + ', carrot ' + this.bag.carrot +
        ', fish ' + this.bag.fish +
        (this.quest === 'active' ? '   |   Quest: 3 tomatoes for Mira' : '')
    );

    // Context hint for whatever is nearest the player.
    if (this.shopOpen || this.fishing) return;
    const player = this.findEntityByName('Player');
    if (player === undefined) return;
    const t = this.getComponent<any>(player, 'transform');
    if (!t) return;
    const px = t.x;
    const py = t.y;
    const near = (x: number, y: number, r: number) => Math.hypot(px - x, py - y) <= r;
    let hint = '';
    if (near(4.0, 2.0, 1.4)) hint = 'E — Sleep until tomorrow (saves the game)';
    else if (near(2.0, -1.0, 1.5)) hint = 'E — Open Mira\'s Stall (buy seeds, sell crops)';
    else if (near(-4.0, -2.0, 1.6)) hint = 'E — Fish in the pond';
    else {
      const mira = this.findEntityByName('Mira');
      if (mira !== undefined) {
        const mt = this.getComponent<any>(mira, 'transform');
        if (mt && near(mt.x, mt.y, 1.5)) {
          hint =
            this.quest === 'none'
              ? 'E — Talk to Mira'
              : this.quest === 'active'
                ? 'E — Talk to Mira (quest: 3 tomatoes)'
                : 'E — Talk to Mira';
        }
      }
    }
    if (!hint) {
      for (const plot of this.plots) {
        if (Math.hypot(px - plot.x, py - plot.y) <= 1.4) {
          if (plot.state === 'grass') hint = 'E — Till with the Hoe (press 1)';
          else if (plot.state === 'tilled') hint = 'E — Plant ' + this.seedType + ' seeds (press 2)';
          else if (plot.stage >= 2) hint = 'E — Harvest the ' + plot.crop + '!';
          else if (!plot.watered) hint = 'E — Water the ' + plot.crop + ' (press 3)';
          else hint = 'Growing... stage ' + (plot.stage + 1) + ' of 3';
          break;
        }
      }
    }
    if (!hint) {
      hint =
        'WASD / arrows or D-pad to walk  •  1/2/3 tools  •  E interact' +
        (this.minutes >= DAY_START_MINUTES + DAY_MINUTES - 30 ? '  •  It is late — go to bed!' : '');
    }
    this.setLabel('HUD-Hint', hint);
  }

  private showDialogue(text: string): void {
    this.setDialogueText(text);
    this.dialogueTimer = 4;
  }

  private setDialogueText(text: string): void {
    this.dialogueText = text;
    this.setLabel('Dialogue-Text', text);
    // Dialogue panel sits at the bottom centre; move it on-screen.
    this.setUiOffsetY('Dialogue-Panel', -140);
    this.setUiOffsetY('Dialogue-Text', -128);
  }

  private hideDialogue(): void {
    this.dialogueTimer = 0;
    this.setUiOffsetY('Dialogue-Panel', this.uiHiddenY);
    this.setUiOffsetY('Dialogue-Text', this.uiHiddenY);
  }

  private showShopPanel(show: boolean): void {
    // Shop buttons ride with the dialogue panel (panel top y=580, buttons y=632).
    const y = show ? -88 : this.uiHiddenY;
    this.setUiOffsetY('Shop-Btn-1', y);
    this.setUiOffsetY('Shop-Btn-2', y);
    this.setUiOffsetY('Shop-Btn-3', y);
    this.setUiOffsetY('Shop-Btn-4', y);
  }

  private showFishingBar(): void {
    this.setUiOffsetY('Fishing-Bg', -320);
    this.setUiOffsetY('Fishing-Zone', -320);
    this.setUiOffsetY('Fishing-Marker', -322);
    this.updateFishingBar();
  }

  private hideFishingBar(): void {
    this.setUiOffsetY('Fishing-Bg', this.uiHiddenY);
    this.setUiOffsetY('Fishing-Zone', this.uiHiddenY);
    this.setUiOffsetY('Fishing-Marker', this.uiHiddenY);
  }

  private updateFishingBar(): void {
    // Bar is 300 wide, anchored centre (offset -150). Marker is 12 wide.
    const x = -150 + this.fishMarker * 300 - 6;
    this.setUiOffset('Fishing-Marker', x, -322);
  }

  private playClick(): void {
    try {
      if (this.audio && typeof (this.audio as any).playSound === 'function') {
        (this.audio as any).playSound('ui-click');
      }
    } catch (e) {
      // Audio is best-effort (headless harness has a stub).
    }
  }
}

export default GameManager;
