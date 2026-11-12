import { parseProjectJson, SceneDefV2Schema, MAX_PROJECT_BYTES } from './ProjectV2';
import type { GlixProjectV2, SceneDefV2 } from './ProjectV2';
import { EntitySchema } from '../scene/MgexSchema';
import type { EntityDef } from '../scene/MgexSchema';
import { MAX_ASSET_BYTES } from '../assets/AssetRecord';
import { sha256Hex } from './migrate';
import type { GlixProjectV2Bundle } from './migrate';

/**
 * ZIP pack/unpack for `.glix` v2 (PROJECT_FORMAT_v2.md §1, §7).
 *
 * No zip dependency: the container (local headers / central directory /
 * EOCD) is written and read here, and deflate goes through the platform
 * `CompressionStream('deflate-raw')`, which exists in browsers and in
 * Node 18+. That keeps `@glix/shared` dependency-free apart from zod —
 * `pnpm add` cannot run in this sandbox (EPERM on the lockfile), and a
 * hand-rolled container is ~200 lines with a full round-trip harness.
 *
 * Every failure is a plain-language Error naming the entry involved.
 */

export interface ZipEntry {
    name: string;
    data: Uint8Array;
}

/* ---------------- CRC-32 (IEEE 802.3) ---------------- */

const CRC_TABLE: Uint32Array = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/* ---------------- deflate via platform streams ---------------- */

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ---------------- writing ---------------- */

function dosDateTime(when: Date): { time: number; date: number } {
    return {
        time: ((when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1)) & 0xffff,
        date: (((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()) & 0xffff,
    };
}

function concat(parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

export async function zipFiles(entries: ZipEntry[]): Promise<Uint8Array> {
    const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const entry of sorted) {
        const nameBytes = encoder.encode(entry.name);
        const compressed = await deflateRaw(entry.data);
        const crc = crc32(entry.data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 file names
        local.setUint16(8, 8, true); // deflate
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, compressed.length, true);
        local.setUint32(22, entry.data.length, true);
        local.setUint16(26, nameBytes.length, true);
        local.setUint16(28, 0, true);
        localParts.push(new Uint8Array(local.buffer), nameBytes, compressed);

        const central = new DataView(new ArrayBuffer(46));
        central.setUint32(0, 0x02014b50, true);
        central.setUint16(4, 0x0014, true); // version made by: DOS, 2.0
        central.setUint16(6, 20, true);
        central.setUint16(8, 0x0800, true);
        central.setUint16(10, 8, true);
        central.setUint16(12, time, true);
        central.setUint16(14, date, true);
        central.setUint32(16, crc, true);
        central.setUint32(20, compressed.length, true);
        central.setUint32(24, entry.data.length, true);
        central.setUint16(28, nameBytes.length, true);
        central.setUint16(30, 0, true); // extra
        central.setUint16(32, 0, true); // comment
        central.setUint16(34, 0, true); // disk
        central.setUint16(36, 0, true); // internal attrs
        central.setUint32(38, 0, true); // external attrs
        central.setUint32(42, offset, true);
        centralParts.push(new Uint8Array(central.buffer), nameBytes);

        offset += 30 + nameBytes.length + compressed.length;
    }

    const centralDir = concat(centralParts);
    const cdOffset = offset;
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, sorted.length, true);
    eocd.setUint16(10, sorted.length, true);
    eocd.setUint32(12, centralDir.length, true);
    eocd.setUint32(16, cdOffset, true);
    eocd.setUint16(20, 0, true);

    return concat([...localParts, centralDir, new Uint8Array(eocd.buffer)]);
}

/* ---------------- reading ---------------- */

function assertSafeEntryName(name: string): void {
    if (name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:/.test(name)) {
        throw new Error(`Refusing to open "${name}": absolute paths are not allowed inside a .glix file.`);
    }
    const segments = name.split('/');
    if (segments.some((s) => s === '..')) {
        throw new Error(`Refusing to open "${name}": the path escapes the project folder.`);
    }
    if (segments.some((s) => s.includes('\\'))) {
        throw new Error(`Refusing to open "${name}": backslashes are not allowed in .glix paths.`);
    }
}

interface CentralEntry {
    name: string;
    method: number;
    crc: number;
    compressedSize: number;
    size: number;
    localOffset: number;
}

export async function unzipFiles(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Find the End Of Central Directory record (last 64 KiB + 22 bytes).
    let eocdOffset = -1;
    const scanStart = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= scanStart; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }
    if (eocdOffset < 0) {
        throw new Error('This is not a valid .glix file: the zip directory is missing or damaged.');
    }
    const entryCount = view.getUint16(eocdOffset + 10, true);
    const cdSize = view.getUint32(eocdOffset + 12, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    if (cdOffset + cdSize > bytes.length) {
        throw new Error('This .glix file is damaged: its file list runs past the end of the file.');
    }

    const decoder = new TextDecoder('utf-8');
    const entries: CentralEntry[] = [];
    let cursor = cdOffset;
    for (let i = 0; i < entryCount; i++) {
        if (view.getUint32(cursor, true) !== 0x02014b50) {
            throw new Error('This .glix file is damaged: a file-list entry is not where it should be.');
        }
        const nameLen = view.getUint16(cursor + 28, true);
        const extraLen = view.getUint16(cursor + 30, true);
        const commentLen = view.getUint16(cursor + 32, true);
        const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
        entries.push({
            name,
            method: view.getUint16(cursor + 10, true),
            crc: view.getUint32(cursor + 16, true),
            compressedSize: view.getUint32(cursor + 20, true),
            size: view.getUint32(cursor + 24, true),
            localOffset: view.getUint32(cursor + 42, true),
        });
        cursor += 46 + nameLen + extraLen + commentLen;
    }

    let totalUncompressed = 0;
    const out = new Map<string, Uint8Array>();
    for (const entry of entries) {
        assertSafeEntryName(entry.name);
        if (entry.name.endsWith('/')) continue; // directory entry
        if (entry.size > MAX_ASSET_BYTES) {
            throw new Error(
                `File "${entry.name}" inside this project is ${Math.round(entry.size / 1024 / 1024)} MB, over the 50 MB per-file limit.`,
            );
        }
        totalUncompressed += entry.size;
        if (totalUncompressed > MAX_PROJECT_BYTES) {
            throw new Error('This project is over the 500 MB size limit.');
        }
        if (entry.method !== 0 && entry.method !== 8) {
            throw new Error(`File "${entry.name}" uses compression method ${entry.method}, which Glix cannot read.`);
        }
        const local = entry.localOffset;
        if (view.getUint32(local, true) !== 0x04034b50) {
            throw new Error(`This .glix file is damaged: the data for "${entry.name}" is not where it should be.`);
        }
        const nameLen = view.getUint16(local + 26, true);
        const extraLen = view.getUint16(local + 28, true);
        const dataStart = local + 30 + nameLen + extraLen;
        const dataEnd = dataStart + entry.compressedSize;
        if (dataEnd > bytes.length) {
            throw new Error(`This .glix file is damaged: the data for "${entry.name}" runs past the end of the file.`);
        }
        const raw = bytes.subarray(dataStart, dataEnd);
        const data = entry.method === 8 ? await inflateRaw(raw) : raw.slice();
        if (data.length !== entry.size) {
            throw new Error(`File "${entry.name}" is damaged: it unzipped to the wrong size.`);
        }
        if (crc32(data) !== entry.crc) {
            throw new Error(`File "${entry.name}" is damaged: its checksum does not match.`);
        }
        out.set(entry.name, data);
    }
    return out;
}

/* ---------------- project pack / unpack ---------------- */

export async function packProject(bundle: GlixProjectV2Bundle): Promise<Uint8Array> {
    const entries: ZipEntry[] = [
        { name: 'project.json', data: new TextEncoder().encode(JSON.stringify(bundle.project, null, 2)) },
    ];
    for (const [path, scene] of Object.entries(bundle.scenes)) {
        entries.push({ name: path, data: new TextEncoder().encode(JSON.stringify(scene, null, 2)) });
    }
    for (const [path, prefab] of Object.entries(bundle.prefabs)) {
        entries.push({ name: path, data: new TextEncoder().encode(JSON.stringify(prefab, null, 2)) });
    }
    for (const [path, blob] of Object.entries(bundle.blobs)) {
        entries.push({ name: path, data: blob });
    }
    const total = entries.reduce((n, e) => n + e.data.length, 0);
    if (total > MAX_PROJECT_BYTES) {
        throw new Error('This project is over the 500 MB size limit.');
    }
    return zipFiles(entries);
}

export interface UnpackedProject {
    project: GlixProjectV2;
    scenes: Map<string, SceneDefV2>;
    prefabs: Map<string, EntityDef>;
    /** Asset blobs, keyed by `assets/<sha256>.<ext>`. */
    blobs: Map<string, Uint8Array>;
    /** Asset ids whose blob is missing or whose hash does not match the manifest. */
    brokenAssets: string[];
    /** Non-fatal notes: unknown files ignored, files present but unlisted. */
    warnings: string[];
}

function parseJsonFile<T>(name: string, data: Uint8Array, parse: (raw: unknown) => T): T {
    let raw: unknown;
    try {
        raw = JSON.parse(new TextDecoder().decode(data));
    } catch {
        throw new Error(`File "${name}" is not valid JSON. Open it and fix the syntax, then try again.`);
    }
    try {
        return parse(raw);
    } catch (e) {
        const detail = e instanceof Error ? e.message : 'It does not match the expected shape.';
        throw new Error(`File "${name}" is not valid: ${detail}`);
    }
}

/**
 * Open a v2 `.glix` zip. A bad `project.json` throws a plain-language
 * error. A bad asset never bricks the project: it is listed in
 * `brokenAssets` (the editor renders a magenta placeholder for it).
 */
export async function unpackProject(bytes: Uint8Array): Promise<UnpackedProject> {
    const files = await unzipFiles(bytes);
    const warnings: string[] = [];

    const manifestBytes = files.get('project.json');
    if (!manifestBytes) {
        throw new Error('This .glix file has no project.json, so it cannot be opened as a Glix v2 project.');
    }
    const project = parseJsonFile('project.json', manifestBytes, (raw) => {
        try {
            return parseProjectJson(JSON.stringify(raw));
        } catch (e) {
            throw e instanceof Error ? e : new Error('project.json failed validation.');
        }
    });

    const scenes = new Map<string, SceneDefV2>();
    for (const entry of project.scenes) {
        const data = files.get(entry.file);
        if (!data) {
            throw new Error(`Scene "${entry.name}" is listed in project.json but its file "${entry.file}" is missing from this project.`);
        }
        scenes.set(entry.file, parseJsonFile(entry.file, data, (raw) => SceneDefV2Schema.parse(raw)));
    }
    const prefabs = new Map<string, EntityDef>();
    for (const entry of project.prefabs) {
        const data = files.get(entry.file);
        if (!data) {
            throw new Error(`Prefab "${entry.name}" is listed in project.json but its file "${entry.file}" is missing from this project.`);
        }
        prefabs.set(entry.file, parseJsonFile(entry.file, data, (raw) => EntitySchema.parse(raw)));
    }

    const blobs = new Map<string, Uint8Array>();
    for (const [name, data] of files) {
        if (name.startsWith('assets/')) blobs.set(name, data);
    }

    const brokenAssets: string[] = [];
    for (const [id, ref] of Object.entries(project.assets)) {
        const blob = blobs.get(ref.file);
        if (!blob) {
            brokenAssets.push(id);
            warnings.push(`Asset "${id}" is listed in project.json but its file "${ref.file}" is missing. It will show as a placeholder.`);
            continue;
        }
        const hash = await sha256Hex(blob);
        if (hash !== ref.sha256.toLowerCase()) {
            brokenAssets.push(id);
            warnings.push(
                `Asset "${id}" does not match its recorded checksum (the file may have been edited outside Glix). It will show as a placeholder.`,
            );
        }
    }

    const known = new Set<string>([
        'project.json',
        ...project.scenes.map((s) => s.file),
        ...project.prefabs.map((p) => p.file),
        ...Object.values(project.assets).map((a) => a.file),
    ]);
    for (const name of files.keys()) {
        if (!known.has(name)) warnings.push(`Ignored unknown file "${name}" in this project.`);
    }

    return { project, scenes, prefabs, blobs, brokenAssets, warnings };
}

/** Check asset hashes without unpacking a whole project (editor "verify" action). */
export async function verifyAssetHashes(
    project: GlixProjectV2,
    blobs: ReadonlyMap<string, Uint8Array>,
): Promise<string[]> {
    const broken: string[] = [];
    for (const [id, ref] of Object.entries(project.assets)) {
        const blob = blobs.get(ref.file);
        if (!blob || (await sha256Hex(blob)) !== ref.sha256.toLowerCase()) broken.push(id);
    }
    return broken;
}
