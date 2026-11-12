import {
  ASSET_IMPORT_ACCEPT,
  MAX_ASSET_BYTES,
  SUPPORTED_ASSET_TYPES,
  assetBlobPath,
  fileExtension,
  makeAssetId,
  slugifyAssetName,
  type AssetKind,
  type AssetRecord,
} from '@glix/shared';

export type { AssetKind, AssetRecord } from '@glix/shared';

/**
 * Asset import pipeline (GODOT_PARITY.md #47).
 *
 * v1 stored assets as base64 data URLs inside the `.glix` JSON. v2 stores
 * content-addressed blobs under `assets/<sha256>.<ext>` and keeps only an
 * `AssetRecord` reference in the project file (PROJECT_FORMAT_v2.md §3).
 * This module is the import side of that rule: validate -> hash -> probe
 * (dimensions / duration / font family) -> record. It never writes base64
 * into a project file and never touches the runtime or the Engine.
 *
 * The pure parts (`importAssetBytes`, the `parse*` probers, `sha256Hex`)
 * use only `Uint8Array` + `crypto.subtle`, so the same code runs in the
 * browser and in the node test harness. `importFile` / `importFiles` are
 * the thin browser wrappers over `File` / `DataTransfer`.
 *
 * Supported: PNG/JPG (sprites), WAV/OGG/MP3 (audio), TTF/OTF (fonts).
 * Not supported (rejected with a plain-language error): everything else,
 * empty files, and single assets over 50 MB (format v2 §1).
 */

export type AssetImportErrorCode =
  | 'unsupported-type'
  | 'empty-file'
  | 'too-large'
  | 'corrupt-image'
  | 'corrupt-audio'
  | 'corrupt-font'
  | 'hash-failed'
  | 'read-failed';

export class AssetImportError extends Error {
  readonly code: AssetImportErrorCode;
  readonly fileName: string;
  constructor(code: AssetImportErrorCode, fileName: string, detail?: string) {
    super(detail ? `${fileName}: ${detail}` : fileName);
    this.name = 'AssetImportError';
    this.code = code;
    this.fileName = fileName;
  }
}

export interface ImportOptions {
  /** Ids already in the project — new ids are de-duplicated against these. */
  existingIds?: ReadonlySet<string>;
  /** Override the 50 MB cap (tests use a small cap to check the error path). */
  maxBytes?: number;
  /**
   * Optional audio decoder for MP3/OGG (browser: `AudioContext.decodeAudioData`).
   * WAV duration comes from the header and never needs a decoder. When no
   * decoder is supplied, MP3/OGG import succeeds with `durationSeconds`
   * left empty — the editor fills it in on first playback.
   */
  decodeAudio?: (bytes: Uint8Array, mimeType: string) => Promise<number | null>;
}

export interface ImportFailure {
  fileName: string;
  code: AssetImportErrorCode;
  message: string;
}

export interface ImportBatchResult {
  imported: AssetRecord[];
  failed: ImportFailure[];
}

/** Re-exported for file inputs and drop zones. */
export const IMPORT_ACCEPT = ASSET_IMPORT_ACCEPT;

/** `hero.png` / `song.MP3` -> true; `notes.txt`, `level.exe` -> false. */
export function isSupportedFileName(fileName: string): boolean {
  return fileExtension(fileName) in SUPPORTED_ASSET_TYPES;
}

/** SHA-256 hex of the bytes (WebCrypto; works in browsers and Node 18+). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('SHA-256 unavailable: WebCrypto is missing in this environment');
  const digest = await subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** PNG: width/height from the IHDR chunk. Throws AssetImportError on bad data. */
export function parsePngDimensions(bytes: Uint8Array, fileName: string): { width: number; height: number } {
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || !PNG_SIG.every((b, i) => bytes[i] === b)) {
    throw new AssetImportError('corrupt-image', fileName, 'not a valid PNG file (bad signature)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // First chunk must be IHDR: length @8, type @12, width @16, height @20.
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (type !== 'IHDR') {
    throw new AssetImportError('corrupt-image', fileName, 'not a valid PNG file (first chunk is not IHDR)');
  }
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) {
    throw new AssetImportError('corrupt-image', fileName, 'PNG has zero width or height');
  }
  return { width, height };
}

/** JPEG: width/height from the first Start-Of-Frame marker. Throws on bad data. */
export function parseJpegDimensions(bytes: Uint8Array, fileName: string): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new AssetImportError('corrupt-image', fileName, 'not a valid JPEG file (bad SOI marker)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new AssetImportError('corrupt-image', fileName, 'not a valid JPEG file (bad marker)');
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS: no SOF found
    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) {
      throw new AssetImportError('corrupt-image', fileName, 'not a valid JPEG file (truncated segment)');
    }
    // SOF0/1/2 (baseline/extended/progressive); skip SOF4/8/12 (DHT/JPG/LS) etc.
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = view.getUint16(offset + 5, false);
      const width = view.getUint16(offset + 7, false);
      if (width === 0 || height === 0) {
        throw new AssetImportError('corrupt-image', fileName, 'JPEG has zero width or height');
      }
      return { width, height };
    }
    offset += 2 + length;
  }
  throw new AssetImportError('corrupt-image', fileName, 'not a valid JPEG file (no frame found)');
}

export interface WavInfo {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
}

/** WAV: duration from the `fmt ` + `data` chunks (scans past extra chunks). */
export function parseWavInfo(bytes: Uint8Array, fileName: string): WavInfo {
  const text = (start: number, len: number) => String.fromCharCode(...bytes.subarray(start, start + len));
  if (bytes.length < 44 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') {
    throw new AssetImportError('corrupt-audio', fileName, 'not a valid WAV file (bad RIFF/WAVE header)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 0;
  let byteRate = 0;
  let channels = 0;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      if (size < 16 || offset + 8 + size > bytes.length) break;
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      byteRate = view.getUint32(offset + 16, true);
    } else if (id === 'data') {
      // Clamp to the bytes actually present (truncated files lie about size).
      dataSize = Math.min(size, bytes.length - offset - 8);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (sampleRate === 0 || byteRate === 0 || dataSize === 0) {
    throw new AssetImportError('corrupt-audio', fileName, 'not a valid WAV file (missing fmt/data chunk)');
  }
  return { durationSeconds: dataSize / byteRate, sampleRate, channels };
}

/**
 * Best-effort font family from the TTF/OTF `name` table (nameID 1, Windows
 * Unicode preferred, Mac Roman as fallback). Returns null when the table
 * cannot be read — the caller falls back to the file-name slug.
 */
export function parseFontFamily(bytes: Uint8Array): string | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (off: number) => view.getUint16(off, false);
    const u32 = (off: number) => view.getUint32(off, false);
    const tables = u16(4);
    let nameOff = -1;
    for (let i = 0; i < tables; i += 1) {
      const off = 12 + i * 16;
      const tag = String.fromCharCode(...bytes.subarray(off, off + 4));
      if (tag === 'name') {
        nameOff = u32(off + 8);
        break;
      }
    }
    if (nameOff < 0 || nameOff + 6 > bytes.length) return null;
    const count = u16(nameOff + 2);
    const storageOff = nameOff + u16(nameOff + 4);
    let fallback: string | null = null;
    for (let i = 0; i < count; i += 1) {
      const rec = nameOff + 6 + i * 12;
      if (rec + 12 > bytes.length) break;
      const platformId = u16(rec);
      const nameId = u16(rec + 6);
      const length = u16(rec + 8);
      const strOff = storageOff + u16(rec + 10);
      if (nameId !== 1 || strOff + length > bytes.length) continue;
      const raw = bytes.subarray(strOff, strOff + length);
      let decoded: string;
      if (platformId === 3 || platformId === 0) {
        const units: number[] = [];
        for (let j = 0; j + 1 < raw.length; j += 2) units.push((raw[j] << 8) | raw[j + 1]);
        decoded = String.fromCharCode(...units);
      } else {
        decoded = String.fromCharCode(...raw);
      }
      const clean = decoded.replace(/\0/g, '').trim();
      if (!clean) continue;
      if (platformId === 3) return clean;
      fallback ??= clean;
    }
    return fallback;
  } catch {
    return null;
  }
}

/**
 * Import raw bytes as an asset. Pure (no DOM, no File API): this is what the
 * node harness exercises. Validates type + size, hashes the bytes, probes
 * dimensions / duration / font family, and returns the v2 record. The bytes
 * themselves are the caller's responsibility to store under `record.path`.
 */
export async function importAssetBytes(
  bytes: Uint8Array,
  fileName: string,
  options: ImportOptions = {},
): Promise<AssetRecord> {
  const ext = fileExtension(fileName);
  const supported = SUPPORTED_ASSET_TYPES[ext];
  if (!supported) {
    const known = Object.keys(SUPPORTED_ASSET_TYPES).join(', ');
    throw new AssetImportError(
      'unsupported-type',
      fileName,
      `"${ext || '(no extension)'}" is not an importable asset type (supported: ${known})`,
    );
  }
  if (bytes.length === 0) {
    throw new AssetImportError('empty-file', fileName, 'the file is empty');
  }
  const maxBytes = options.maxBytes ?? MAX_ASSET_BYTES;
  if (bytes.length > maxBytes) {
    throw new AssetImportError(
      'too-large',
      fileName,
      `file is ${(bytes.length / 1024 / 1024).toFixed(1)} MB, over the ${(maxBytes / 1024 / 1024).toFixed(0)} MB per-asset limit`,
    );
  }

  let hash: string;
  try {
    hash = await sha256Hex(bytes);
  } catch {
    throw new AssetImportError('hash-failed', fileName, 'could not hash the file');
  }

  const kind: AssetKind = supported.kind;
  const record: AssetRecord = {
    id: makeAssetId(fileName, options.existingIds ?? new Set()),
    hash,
    name: fileName.split(/[\\/]/).pop() ?? fileName,
    kind,
    path: assetBlobPath(hash, ext),
    mimeType: supported.mimeType,
    ext,
    size: bytes.length,
    createdAt: new Date().toISOString(),
  };

  if (kind === 'texture') {
    const dims = ext === 'png' ? parsePngDimensions(bytes, fileName) : parseJpegDimensions(bytes, fileName);
    record.width = dims.width;
    record.height = dims.height;
  } else if (kind === 'audio') {
    if (ext === 'wav') {
      record.durationSeconds = parseWavInfo(bytes, fileName).durationSeconds;
    } else if (options.decodeAudio) {
      const decoded = await options.decodeAudio(bytes, supported.mimeType).catch(() => null);
      if (decoded !== null && decoded > 0) record.durationSeconds = decoded;
    }
    // MP3/OGG without a decoder: duration stays empty; the editor fills it
    // in on first playback (see the integration note in content.md).
  } else if (kind === 'font') {
    record.fontFamily = parseFontFamily(bytes) ?? slugifyAssetName(fileName).replace(/-/g, ' ');
  }
  return record;
}

/** Browser wrapper: read a `File` and run it through `importAssetBytes`. */
export async function importFile(file: File, options: ImportOptions = {}): Promise<AssetRecord> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new AssetImportError('read-failed', file.name, 'could not read the file');
  }
  return importAssetBytes(bytes, file.name, options);
}

/** Files dropped on (or picked in) the editor. Never throws for bad files. */
export async function importFiles(files: Iterable<File>, options: ImportOptions = {}): Promise<ImportBatchResult> {
  const imported: AssetRecord[] = [];
  const failed: ImportFailure[] = [];
  const seen = new Set(options.existingIds ?? []);
  for (const file of files) {
    try {
      const record = await importFile(file, { ...options, existingIds: seen });
      seen.add(record.id);
      imported.push(record);
    } catch (err) {
      if (err instanceof AssetImportError) {
        failed.push({ fileName: file.name, code: err.code, message: err.message });
      } else {
        failed.push({ fileName: file.name, code: 'read-failed', message: String(err) });
      }
    }
  }
  return { imported, failed };
}

/** Files carried by a drag-drop event (ignores non-file drags). */
export function filesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer?.files) return [];
  return Array.from(dataTransfer.files).filter((f) => f.size > 0 || f.name.length > 0);
}

/**
 * One call for a drop zone: extract the files and import them.
 * The AssetBrowser wires this to its root element's `onDrop`.
 */
export async function importDroppedFiles(
  dataTransfer: DataTransfer | null,
  options: ImportOptions = {},
): Promise<ImportBatchResult> {
  return importFiles(filesFromDataTransfer(dataTransfer), options);
}
