import type { AssetRecord, SpriteAtlasData, TilesetData } from '@glix/shared';

/**
 * Sprite-sheet slicing (GODOT_PARITY.md #48).
 *
 * Pure functions, no DOM: given an imported texture's `AssetRecord` and the
 * sheet's pixel size, produce the frame records the existing runtime already
 * understands — `SpriteAtlas` (`textureId` + `regions`) and
 * `createFrameAnimation(atlasId, frames, fps, loop)`. Slicing never touches
 * the Engine or any system; the editor stores the result as a `spriteatlas`
 * asset whose `textureId` points at the sheet (PROJECT_FORMAT_v2.md §3).
 *
 * Two modes: grid (`sliceGrid`, Godot's SpriteFrames grid) and explicit
 * (`sliceByFrames`, for hand-placed frames). `sliceTileset` is the same
 * grid with TileSet semantics for the tilemap editor.
 */

export class SliceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SliceError';
  }
}

export interface FrameRect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SliceResult {
  /** Id of the `spriteatlas` asset this slice produces, e.g. `hero-atlas`. */
  atlasId: string;
  /** Id of the sheet texture (the imported `AssetRecord.id`). */
  textureId: string;
  textureRecord: AssetRecord;
  sheetWidth: number;
  sheetHeight: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  spacing: number;
  margin: number;
  frames: FrameRect[];
  /** Frame names in row-major order — pass straight to `createFrameAnimation`. */
  frameNames: string[];
  /** `SpriteAtlasData['regions']` shape. */
  regions: SpriteAtlasData['regions'];
}

export interface SliceGridOptions {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  /** Outer border around the whole grid, in pixels. Default 0. */
  margin?: number;
  /** Gap between cells, in pixels. Default 0. */
  spacing?: number;
  /** Top-left of the grid inside the sheet, in pixels. Default 0, 0. */
  originX?: number;
  originY?: number;
  /** Prefix for generated frame names. Default `<textureId>_frame`. */
  namePrefix?: string;
  /** Exact names for every cell, row-major. Must have columns * rows entries. */
  frameNames?: string[];
}

function fail(message: string): never {
  throw new SliceError(message);
}

function checkPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) fail(`${label} must be a positive whole number (got ${value})`);
}

/**
 * Slice a sheet into a uniform grid. The grid must fit inside the sheet:
 * origin + margin + cells + spacing + margin <= sheet size, or it is a
 * plain-language error naming the axis — never a silent crop.
 */
export function sliceGrid(
  textureRecord: AssetRecord,
  sheetWidth: number,
  sheetHeight: number,
  options: SliceGridOptions,
): SliceResult {
  const { columns, rows, cellWidth, cellHeight } = options;
  checkPositiveInt(columns, 'columns');
  checkPositiveInt(rows, 'rows');
  checkPositiveInt(cellWidth, 'cellWidth');
  checkPositiveInt(cellHeight, 'cellHeight');
  if (!Number.isInteger(sheetWidth) || sheetWidth < 1 || !Number.isInteger(sheetHeight) || sheetHeight < 1) {
    fail(`sheet size must be positive whole pixels (got ${sheetWidth}x${sheetHeight})`);
  }
  const margin = options.margin ?? 0;
  const spacing = options.spacing ?? 0;
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  if (margin < 0 || spacing < 0 || originX < 0 || originY < 0) {
    fail('margin, spacing, originX and originY cannot be negative');
  }
  const needW = originX + margin + columns * cellWidth + (columns - 1) * spacing + margin;
  const needH = originY + margin + rows * cellHeight + (rows - 1) * spacing + margin;
  if (needW > sheetWidth) {
    fail(`grid is ${needW}px wide but the sheet is only ${sheetWidth}px wide — reduce columns, cellWidth or spacing`);
  }
  if (needH > sheetHeight) {
    fail(`grid is ${needH}px tall but the sheet is only ${sheetHeight}px tall — reduce rows, cellHeight or spacing`);
  }
  if (options.frameNames && options.frameNames.length !== columns * rows) {
    fail(`frameNames has ${options.frameNames.length} entries but the grid has ${columns * rows} cells`);
  }

  const prefix = options.namePrefix ?? `${textureRecord.id}-frame`;
  const frames: FrameRect[] = [];
  const regions: SpriteAtlasData['regions'] = {};
  const frameNames: string[] = [];
  const seen = new Set<string>();
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const i = row * columns + col;
      const name = options.frameNames?.[i] ?? `${prefix}_r${row}_c${col}`;
      if (seen.has(name)) fail(`duplicate frame name "${name}"`);
      seen.add(name);
      const x = originX + margin + col * (cellWidth + spacing);
      const y = originY + margin + row * (cellHeight + spacing);
      const frame: FrameRect = { name, x, y, w: cellWidth, h: cellHeight };
      frames.push(frame);
      regions[name] = { x, y, w: cellWidth, h: cellHeight };
      frameNames.push(name);
    }
  }
  return {
    atlasId: `${textureRecord.id}-atlas`,
    textureId: textureRecord.id,
    textureRecord,
    sheetWidth,
    sheetHeight,
    columns,
    rows,
    cellWidth,
    cellHeight,
    spacing,
    margin,
    frames,
    frameNames,
    regions,
  };
}

/**
 * Slice by explicit frame rectangles (hand-placed frames, non-uniform
 * sheets). Every rect must sit fully inside the sheet and names must be
 * unique — violations are errors, not clamps.
 */
export function sliceByFrames(
  textureRecord: AssetRecord,
  sheetWidth: number,
  sheetHeight: number,
  frames: ReadonlyArray<{ name: string; x: number; y: number; w: number; h: number }>,
): SliceResult {
  if (frames.length === 0) fail('at least one frame is required');
  if (!Number.isInteger(sheetWidth) || sheetWidth < 1 || !Number.isInteger(sheetHeight) || sheetHeight < 1) {
    fail(`sheet size must be positive whole pixels (got ${sheetWidth}x${sheetHeight})`);
  }
  const seen = new Set<string>();
  const out: FrameRect[] = [];
  const regions: SpriteAtlasData['regions'] = {};
  for (const f of frames) {
    if (!f.name) fail('every frame needs a name');
    if (seen.has(f.name)) fail(`duplicate frame name "${f.name}"`);
    seen.add(f.name);
    if (![f.x, f.y, f.w, f.h].every((n) => Number.isInteger(n))) {
      fail(`frame "${f.name}" has non-integer bounds`);
    }
    if (f.w < 1 || f.h < 1) fail(`frame "${f.name}" has zero width or height`);
    if (f.x < 0 || f.y < 0 || f.x + f.w > sheetWidth || f.y + f.h > sheetHeight) {
      fail(`frame "${f.name}" (${f.x},${f.y} ${f.w}x${f.h}) falls outside the ${sheetWidth}x${sheetHeight} sheet`);
    }
    out.push({ ...f });
    regions[f.name] = { x: f.x, y: f.y, w: f.w, h: f.h };
  }
  // Explicit frames have no grid: columns/rows here just count the frames
  // (row-major, one row) so grid consumers never see a zero.
  return {
    atlasId: `${textureRecord.id}-atlas`,
    textureId: textureRecord.id,
    textureRecord,
    sheetWidth,
    sheetHeight,
    columns: out.length,
    rows: 1,
    cellWidth: 0,
    cellHeight: 0,
    spacing: 0,
    margin: 0,
    frames: out,
    frameNames: out.map((f) => f.name),
    regions,
  };
}

export interface SliceTilesetOptions {
  tileWidth: number;
  tileHeight: number;
  spacing?: number;
  margin?: number;
  originX?: number;
  originY?: number;
  solidTiles?: number[];
}

export interface TilesetSliceResult {
  /** `TilesetData` shape for the tilemap editor / TilemapComponent. */
  tileset: TilesetData;
  /** The same tiles as atlas regions (`tile_0`, `tile_1`, … row-major). */
  slice: SliceResult;
}

/**
 * Slice a sheet into tiles. Columns/rows are derived from the sheet size,
 * so a 256x256 sheet of 16px tiles is 16x16 without the caller doing math.
 * At least one full tile must fit, or it is an error.
 */
export function sliceTileset(
  textureRecord: AssetRecord,
  sheetWidth: number,
  sheetHeight: number,
  options: SliceTilesetOptions,
): TilesetSliceResult {
  const { tileWidth, tileHeight } = options;
  checkPositiveInt(tileWidth, 'tileWidth');
  checkPositiveInt(tileHeight, 'tileHeight');
  const spacing = options.spacing ?? 0;
  const margin = options.margin ?? 0;
  const columns = Math.floor((sheetWidth - 2 * margin + spacing) / (tileWidth + spacing));
  const rows = Math.floor((sheetHeight - 2 * margin + spacing) / (tileHeight + spacing));
  if (columns < 1 || rows < 1) {
    fail(`no ${tileWidth}x${tileHeight} tile fits in the ${sheetWidth}x${sheetHeight} sheet`);
  }
  const frameNames = Array.from({ length: columns * rows }, (_, i) => `tile_${i}`);
  const slice = sliceGrid(textureRecord, sheetWidth, sheetHeight, {
    columns,
    rows,
    cellWidth: tileWidth,
    cellHeight: tileHeight,
    spacing,
    margin,
    originX: options.originX ?? 0,
    originY: options.originY ?? 0,
    frameNames,
  });
  return {
    tileset: {
      textureId: textureRecord.id,
      tileWidth,
      tileHeight,
      columns,
      rows,
      spacing,
      solidTiles: options.solidTiles ?? [],
    },
    slice,
  };
}

/** `SliceResult` -> the shape `new SpriteAtlas(textureId, regions)` takes. */
export function toSpriteAtlasData(result: SliceResult): SpriteAtlasData {
  return { textureId: result.textureId, regions: result.regions };
}

/**
 * `SliceResult` -> the arguments of the runtime's
 * `createFrameAnimation(atlasId, frames, fps, loop)`. The slicer does not
 * import the runtime; the editor passes this object straight through.
 */
export function toFrameAnimationInput(
  result: SliceResult,
  options: { fps?: number; loop?: boolean } = {},
): { atlasId: string; frames: string[]; fps: number; loop: boolean } {
  return {
    atlasId: result.atlasId,
    frames: [...result.frameNames],
    fps: options.fps ?? 10,
    loop: options.loop ?? true,
  };
}
