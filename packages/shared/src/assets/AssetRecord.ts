import { z } from 'zod';

/**
 * Shared asset-record type — the single shape used by the editor importer
 * (`packages/editor/src/import/AssetImporter.ts`), the AssetBrowser, the
 * format-v2 project file, and the runtime resource system.
 *
 * Format v2 rule (PROJECT_FORMAT_v2.md §3): asset bytes live only in
 * `assets/<sha256>.<ext>`; the project JSON holds a reference, never base64.
 * Two identical files dedupe to one blob because the path is content-derived.
 *
 * NOTE on fonts (resolved 2026-11-12 by the format-v2 team): ProjectV2.ts
 * imports this file's single `AssetRefSchema`, whose `type` enum already
 * includes `font` — there is no second enum to drift. This file
 * keeps `font` as a first-class kind (the importer supports TTF/OTF) and
 * `toAssetRef()` emits `type: 'font'`; the format team needs the one-line
 * extension `z.enum(['texture','audio','spriteatlas','tileset','font'])`
 * in `packages/shared/src/project/ProjectV2.ts` when that file lands.
 * Until then, font records are valid in the editor but must not be written
 * into a v2 `project.json` — `toAssetRef()` is the only conversion point,
 * so the gap is visible, not silent.
 */

export const ASSET_KINDS = ['texture', 'audio', 'spriteatlas', 'tileset', 'font'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Single-asset cap from PROJECT_FORMAT_v2.md §1. */
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/** Extension (lowercase, no dot) -> kind + MIME. One table, used by importer and browser. */
export const SUPPORTED_ASSET_TYPES: Readonly<Record<string, { kind: AssetKind; mimeType: string }>> = {
  png: { kind: 'texture', mimeType: 'image/png' },
  jpg: { kind: 'texture', mimeType: 'image/jpeg' },
  jpeg: { kind: 'texture', mimeType: 'image/jpeg' },
  wav: { kind: 'audio', mimeType: 'audio/wav' },
  ogg: { kind: 'audio', mimeType: 'audio/ogg' },
  mp3: { kind: 'audio', mimeType: 'audio/mpeg' },
  ttf: { kind: 'font', mimeType: 'font/ttf' },
  otf: { kind: 'font', mimeType: 'font/otf' },
};

/** `accept` attribute value for `<input type="file">` / drag-drop filtering. */
export const ASSET_IMPORT_ACCEPT =
  '.png,.jpg,.jpeg,.wav,.ogg,.mp3,.ttf,.otf,image/png,image/jpeg,audio/wav,audio/ogg,audio/mpeg,font/ttf,font/otf';

export const AssetRecordSchema = z.object({
  /** Stable id used by components, e.g. `hero-sprite`. Slug of the file name. */
  id: z.string().min(1),
  /** Lowercase hex SHA-256 of the file bytes. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  /** Original file name as imported, e.g. `Hero Sprite.png`. */
  name: z.string().min(1),
  kind: z.enum(ASSET_KINDS),
  /** Content-addressed path inside the project: `assets/<sha256>.<ext>`. */
  path: z.string().regex(/^assets\/[0-9a-f]{64}\.[a-z0-9]+$/),
  mimeType: z.string().min(1),
  /** File extension, lowercase, no dot. */
  ext: z.string().min(1),
  /** Size in bytes. */
  size: z.number().int().nonnegative(),
  /** Images only: pixel dimensions. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Audio only: duration in seconds. */
  durationSeconds: z.number().nonnegative().optional(),
  /** Fonts only: family name from the font name table (or file name fallback). */
  fontFamily: z.string().optional(),
  /** ISO 8601 import time. */
  createdAt: z.string(),
});

export type AssetRecord = z.infer<typeof AssetRecordSchema>;

/** The format-v2 project-file reference (PROJECT_FORMAT_v2.md §3). */
export const AssetRefSchema = z.object({
  id: z.string(),
  type: z.enum(['texture', 'audio', 'spriteatlas', 'tileset', 'font']),
  name: z.string(),
  mimeType: z.string(),
  file: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number(),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;

/** `assets/<sha256>.<ext>` — the only place asset bytes live in v2. */
export function assetBlobPath(hash: string, ext: string): string {
  return `assets/${hash.toLowerCase()}.${ext.toLowerCase()}`;
}

/** File name -> lowercase extension without the dot ('' when there is none). */
export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** `Hero Sprite.png` -> `hero-sprite`. Safe for ids, component refs and URLs. */
export function slugifyAssetName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const withoutExt = base.replace(/\.[^.]*$/, '');
  const slug = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'asset';
}

/**
 * Stable id for an imported file. Appends `-2`, `-3`, … when the slug is
 * already taken, so importing `hero.png` twice never overwrites an id.
 * (The bytes still dedupe: same content -> same hash -> same blob path.)
 */
export function makeAssetId(fileName: string, existingIds: ReadonlySet<string> = new Set()): string {
  const base = slugifyAssetName(fileName);
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Runtime shape check (no throw): is this object a plausible AssetRecord? */
export function isAssetRecord(value: unknown): value is AssetRecord {
  return AssetRecordSchema.safeParse(value).success;
}

/** AssetRecord -> format-v2 project-file reference. See the `font` note above. */
export function toAssetRef(record: AssetRecord): AssetRef {
  return {
    id: record.id,
    type: record.kind,
    name: record.name,
    mimeType: record.mimeType,
    file: record.path,
    sha256: record.hash,
    size: record.size,
  };
}

/**
 * Format-v2 reference -> AssetRecord. `ext` is recovered from the file path;
 * width/height/duration/fontFamily are not stored in the ref and come back
 * empty — the editor re-probes them from the blob on load when needed.
 */
export function fromAssetRef(ref: AssetRef): AssetRecord {
  return {
    id: ref.id,
    hash: ref.sha256,
    name: ref.name,
    kind: ref.type,
    path: ref.file,
    mimeType: ref.mimeType,
    ext: fileExtension(ref.file),
    size: ref.size,
    createdAt: new Date(0).toISOString(),
  };
}
