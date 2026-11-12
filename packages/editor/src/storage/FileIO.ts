import { MgexFile, MgexSchema, resolveMobileController } from '@glix/shared';
import {
    migrateV1ToV2,
    packProject,
    unpackProject,
} from '@glix/shared';
import type { ExtensionPermissionV2, GlixProjectV2Bundle, UnpackedProject } from '@glix/shared';
import { useProjectStore, FileSystemFileHandle } from '../store/useProjectStore';

const LAST_SAVE_KEY = 'glix_last_save_time';

/**
 * Format v2 boundary (PROJECT_FORMAT_v2.md, binding).
 *
 * The editor's in-memory model is still the v1 `MgexFile` — a full v2
 * editor-model migration is a separate job, and every consumer
 * (EditorBridge, SceneLoader, Exporter, AssetBrowser) reads v1. FileIO
 * is the translation boundary, and it works like this:
 *
 * - Open sniffs the file: ZIP magic (`PK\x03\x04`) → `unpackProject`
 *   (v2); otherwise JSON → v1, then `migrateV1ToV2` runs in memory.
 *   The v1 file on disk is never rewritten by opening it — it stays v1
 *   until the user saves (Save writes v1 JSON to the same handle).
 * - `packProject` runs ONLY on Download (Toolbar → `downloadProjectV2`),
 *   which migrates the current in-memory project fresh and downloads a
 *   v2 `.glix` zip. Save / Save As never pack.
 * - A bad asset never bricks a project: v2 opens list it in
 *   `brokenAssets` (missing blob / checksum mismatch) and the editor
 *   shows a banner; v1 opens list assets the migration had to skip.
 *   Font assets from a v2 file cannot be held in the v1 model — they are
 *   reported in `fileWarnings` and dropped from a v2 download, never
 *   silently.
 */

export interface OpenResult {
    project: MgexFile;
    sourceFormat: 'v1' | 'v2';
    brokenAssets: string[];
    warnings: string[];
}

/** In-memory v2 bundle for the currently open file, if one exists. */
let currentV2Bundle: GlixProjectV2Bundle | null = null;
/** Unpacked v2 project for the currently open file, if it was a v2 zip. */
let currentUnpacked: UnpackedProject | null = null;
/** Plugin entries recorded in an opened v2 project's `plugins[]`
 * (for the Extensions panel's "recorded, package not loaded" rows). */
let openV2Plugins: Array<{ id: string; version: string; enabled: boolean }> = [];
/** Font asset ids from an opened v2 file (not holdable in the v1 model). */
let openV2FontIds: string[] = [];

/**
 * Plugin entries the extension loader keeps in sync (written by the
 * editor's extension loader after install/enable/disable/uninstall).
 * `downloadProjectV2` carries these into the downloaded file, so an
 * extension installed this session survives the round-trip. Seeded from
 * an opened v2 file's `plugins[]`.
 */
/** One attached plugin entry. `grantedPermissions` uses the shared
 * 12-value union (ExtensionPermissionV2) so it stays assignable to
 * `PluginEntry[]` in migrateV1ToV2 — a loose `string[]` would not. */
export type AttachedPluginEntry = {
    id: string; version: string; enabled: boolean;
    grantedPermissions?: ExtensionPermissionV2[];
};

let attachedPluginEntries: AttachedPluginEntry[] = [];

export function getAttachedPluginEntries(): AttachedPluginEntry[] {
    return [...attachedPluginEntries];
}

export function setAttachedPluginEntries(
    entries: AttachedPluginEntry[],
): void {
    attachedPluginEntries = [...entries];
}

export function getCurrentV2Bundle(): GlixProjectV2Bundle | null {
    return currentV2Bundle;
}

export function getOpenV2Plugins(): Array<{ id: string; version: string; enabled: boolean }> {
    return [...openV2Plugins];
}

export function getOpenV2FontIds(): string[] {
    return [...openV2FontIds];
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
    // Chunked binary-string conversion (a single String.fromCharCode
    // spread over a multi-MB blob blows the stack).
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:${mimeType};base64,${globalThis.btoa(bin)}`;
}

/** v2 bundle → the editor's v1 in-memory model. Lossy by design (see the
 * header comment): fonts and non-keyboard input bindings do not survive,
 * and both are reported in `warnings` instead of dropped silently. */
function v2ToV1(unpacked: UnpackedProject): { project: MgexFile; warnings: string[] } {
    const { project: v2, scenes, prefabs, blobs } = unpacked;
    const warnings: string[] = [...unpacked.warnings];

    const v1Scenes: MgexFile['scenes'] = {};
    for (const entry of v2.scenes) {
        const scene = scenes.get(entry.file);
        if (!scene) continue; // unpackProject already throws for this
        v1Scenes[entry.id] = { id: entry.id, name: entry.name, entities: scene.entities };
    }
    const v1Prefabs: MgexFile['prefabs'] = {};
    for (const entry of v2.prefabs) {
        const prefab = prefabs.get(entry.file);
        if (prefab) v1Prefabs[entry.id] = prefab;
    }

    const v1Assets: MgexFile['assets'] = {};
    const fontIds: string[] = [];
    for (const [id, ref] of Object.entries(v2.assets)) {
        if (ref.type === 'font') {
            fontIds.push(id);
            continue;
        }
        const blob = blobs.get(ref.file);
        if (!blob) continue; // already in brokenAssets
        v1Assets[id] = {
            id,
            type: ref.type,
            name: ref.name,
            mimeType: ref.mimeType,
            data: bytesToDataUrl(blob, ref.mimeType),
        };
    }
    if (fontIds.length > 0) {
        warnings.push(
            `Font assets cannot be edited in this editor yet and were left out of the open project: ${fontIds.join(', ')}. ` +
            'They stay in the .glix file on disk and are not deleted.',
        );
    }

    // v2 input bindings → v1 keyboard codes only.
    const v1Input: Record<string, string[]> = {};
    let droppedBindings = 0;
    for (const [action, def] of Object.entries(v2.input.actions)) {
        const codes = def.bindings
            .filter((b) => {
                if (b.device !== 'keyboard') { droppedBindings += 1; return false; }
                return true;
            })
            .map((b) => (b as { code: string }).code);
        if (codes.length > 0) v1Input[action] = codes;
    }
    if (droppedBindings > 0) {
        warnings.push(
            `${droppedBindings} touch/gamepad input bindings were left out of the open project ` +
            '(the v1 editor model only holds keyboard codes). They stay in the .glix file on disk.',
        );
    }

    const project: MgexFile = {
        version: '2.0.0',
        meta: { name: v2.meta.name, resolution: v2.meta.resolution },
        assets: v1Assets,
        prefabs: v1Prefabs,
        scenes: v1Scenes,
        settings: {
            startScene: v2.settings.startScene,
            physics: v2.settings.physics,
            postProcess: v2.settings.postProcess,
            input: v1Input,
            touchControls: v2.settings.touchControls,
            // Full controller section survives the v2→v1 hop (v1 schema holds it).
            mobileController: resolveMobileController(v2.settings as any),
            // Background fill survives the v2→v1 hop too (Layering, 2026-11-12).
            backgroundColor: v2.settings.backgroundColor,
        },
    };
    return { project, warnings };
}

/** Open one picked file (bytes already read). Sniffs ZIP magic first. */
export async function openProjectFile(
    file: File,
    handle: FileSystemFileHandle | null,
): Promise<OpenResult> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    const store = useProjectStore.getState();

    if (isZip) {
        const unpacked = await unpackProject(bytes);
        const { project, warnings } = v2ToV1(unpacked);
        currentV2Bundle = null; // rebuilt from the v1 model on download
        currentUnpacked = unpacked;
        openV2Plugins = (unpacked.project.plugins ?? []).map((p) => ({ ...p }));
        attachedPluginEntries = openV2Plugins.map((p) => ({ ...p }));
        openV2FontIds = Object.entries(unpacked.project.assets)
            .filter(([, ref]) => ref.type === 'font')
            .map(([id]) => id);
        store.setFileHandle(handle);
        store.setProject(project);
        store.setFileInfo({
            sourceFormat: 'v2',
            brokenAssets: [...unpacked.brokenAssets],
            fileWarnings: warnings,
            migrationReport: null,
        });
        return { project, sourceFormat: 'v2', brokenAssets: [...unpacked.brokenAssets], warnings };
    }

    // JSON path: v1 (or a bare v2 project.json, which cannot open alone).
    const text = new TextDecoder().decode(bytes);
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new Error('This file is not a valid Glix project: it is neither a .glix zip nor JSON.');
    }
    if (raw !== null && typeof raw === 'object' && (raw as Record<string, unknown>).formatVersion === '2.0.0') {
        throw new Error(
            'This is a v2 project.json without its scenes and assets. Open the .glix zip file instead — it holds the whole project.',
        );
    }
    let v1: MgexFile;
    try {
        v1 = MgexSchema.parse(raw);
    } catch (e: unknown) {
        const err = e as { errors?: Array<{ message: string }> };
        const msg = err.errors ? err.errors.map((x) => x.message).join(', ') : 'Invalid project file format.';
        throw new Error(`Project validation failed: ${msg}`);
    }

    // Migrate in memory only. The v1 file on disk is untouched until save.
    let bundle: GlixProjectV2Bundle;
    try {
        bundle = await migrateV1ToV2(raw);
    } catch (e) {
        throw new Error(
            `This v1 project opened, but it cannot be carried into the v2 format yet: ${e instanceof Error ? e.message : 'migration failed'}`,
        );
    }
    currentV2Bundle = bundle;
    currentUnpacked = null;
    openV2Plugins = [];
    attachedPluginEntries = [];
    openV2FontIds = [];
    const brokenAssets = bundle.report.assetsSkipped.map((s) => s.id);
    const warnings = [
        ...bundle.report.warnings,
        ...bundle.report.droppedSettings.map((s) => `Setting "${s}" is not carried into v2 and was dropped from the migration preview.`),
    ];
    store.setFileHandle(handle);
    store.setProject(v1);
    store.setFileInfo({
        sourceFormat: 'v1',
        brokenAssets,
        fileWarnings: warnings,
        migrationReport: {
            assetsExtracted: bundle.report.assetsExtracted,
            assetsSkipped: bundle.report.assetsSkipped,
            warnings: bundle.report.warnings,
        },
    });
    return { project: v1, sourceFormat: 'v1', brokenAssets, warnings };
}

export async function saveProject(project: MgexFile, handle: FileSystemFileHandle | null): Promise<FileSystemFileHandle | null> {
    if (handle) {
        try {
            await writeToHandle(project, handle);
            localStorage.setItem(LAST_SAVE_KEY, Date.now().toString());
            useProjectStore.getState().clearDirty();
            return handle;
        } catch (e) {
            console.warn('Failed to save to existing handle, falling back to Save As', e);
        }
    }
    return saveProjectAs(project);
}

export async function saveProjectAs(project: MgexFile): Promise<FileSystemFileHandle | null> {
    const json = JSON.stringify(project, null, 2);
    const fileName = `${project.meta.name || 'project'}.glix`;

    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'Glix Project',
                    accept: { 'application/json': ['.glix'] },
                }],
            });
            await writeToHandle(project, handle);
            localStorage.setItem(LAST_SAVE_KEY, Date.now().toString());
            useProjectStore.getState().setFileHandle(handle);
            useProjectStore.getState().clearDirty();
            return handle;
        } catch (e: any) {
            if (e.name !== 'AbortError') throw e;
            return null;
        }
    } else {
        // Fallback for Firefox
        downloadStringAsFile(json, fileName);
        localStorage.setItem(LAST_SAVE_KEY, Date.now().toString());
        useProjectStore.getState().clearDirty();
        return null; // File System Access API not used
    }
}

async function writeToHandle(project: MgexFile, handle: FileSystemFileHandle) {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(project, null, 2));
    await writable.close();
}

export function loadProject(): Promise<MgexFile | null> {
    return new Promise((resolve, reject) => {
        if ('showOpenFilePicker' in window) {
            (window as any).showOpenFilePicker({
                types: [{
                    description: 'Glix Project',
                    accept: { 'application/json': ['.glix'] },
                }],
            }).then(async ([handle]: any[]) => {
                try {
                    const file = await handle.getFile();
                    const result = await openProjectFile(file, handle as FileSystemFileHandle);
                    resolve(result.project);
                } catch (e) {
                    reject(e);
                }
            }).catch((e: any) => {
                if (e.name !== 'AbortError') reject(e);
                else resolve(null);
            });
        } else {
            // Fallback for Firefox
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.glix';
            input.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve(null);
                    return;
                }
                try {
                    const result = await openProjectFile(file, null);
                    resolve(result.project);
                } catch (err) {
                    reject(err);
                }
            };
            input.click();
        }
    });
}

export interface DownloadV2Result {
    fileName: string;
    assetsExtracted: number;
    assetsSkipped: Array<{ id: string; reason: string }>;
    warnings: string[];
    /** Font ids from an opened v2 file that this download could not carry. */
    fontsDropped: string[];
}

/**
 * Download the current project as a v2 `.glix` zip. This is the ONLY
 * place `packProject` runs: Save / Save As keep writing v1 JSON.
 * Migrates the current in-memory project fresh, so edits since opening
 * are included. Throws a plain-language error; downloads nothing partial.
 */
export async function downloadProjectV2(): Promise<DownloadV2Result | null> {
    const project = useProjectStore.getState().project;
    if (!project) return null;
    const bundle = await migrateV1ToV2(project, {
        // Granted permissions travel with the entry (PluginEntrySchema,
        // 2026-11-12): dropping them here would silently un-grant every
        // extension on download.
        plugins: attachedPluginEntries.map((p) => ({
            id: p.id, version: p.version, enabled: p.enabled,
            grantedPermissions: [...(p.grantedPermissions ?? [])],
        })),
    });
    const fileName = `${project.meta.name || 'project'}.glix`;
    const warnings = [...bundle.report.warnings];
    const fontsDropped = getOpenV2FontIds();
    if (fontsDropped.length > 0) {
        warnings.push(
            `Font assets from the opened v2 file were not included in this download (the editor cannot hold them yet): ${fontsDropped.join(', ')}.`,
        );
    }
    const zip = await packProject(bundle);
    currentV2Bundle = bundle;
    const blob = new Blob([zip as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return {
        fileName,
        assetsExtracted: bundle.report.assetsExtracted,
        assetsSkipped: bundle.report.assetsSkipped,
        warnings,
        fontsDropped,
    };
}

function downloadStringAsFile(content: string, filename: string) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function getLastSaveTime(): number {
    const val = localStorage.getItem(LAST_SAVE_KEY);
    return val ? parseInt(val, 10) : 0;
}
