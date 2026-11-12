import { MgexSchema, resolveMobileController, resolveViewportMode } from '../scene/MgexSchema';
import type { MgexFile, EntityDef } from '../scene/MgexSchema';
import { assetBlobPath, fileExtension, SUPPORTED_ASSET_TYPES } from '../assets/AssetRecord';
import type { AssetRef } from '../assets/AssetRecord';
import {
    GlixProjectV2Schema, defaultInputMap,
} from './ProjectV2';
import type { GlixProjectV2, SceneDefV2, PluginEntry } from './ProjectV2';

/**
 * v1 → v2 migration (PROJECT_FORMAT_v2.md §6, binding).
 *
 * Never mutates the v1 file: the input is read-only and the output is a
 * fresh in-memory bundle. The editor offers "Save as v2" on top of this.
 *
 * Hashing is async on purpose: SHA-256 goes through WebCrypto, which is
 * async in both the browser and Node.
 */

export interface MigrationReport {
    assetsExtracted: number;
    assetsSkipped: { id: string; reason: string }[];
    scenesSplit: number;
    prefabsSplit: number;
    droppedSettings: string[];
    warnings: string[];
    startSceneDefaulted: boolean;
}

export interface GlixProjectV2Bundle {
    project: GlixProjectV2;
    /** `scenes/<id>.json` contents, keyed by file path inside the zip. */
    scenes: Record<string, SceneDefV2>;
    /** `prefabs/<id>.json` contents, keyed by file path inside the zip. */
    prefabs: Record<string, EntityDef>;
    /** Asset blobs, keyed by content-addressed path `assets/<sha256>.<ext>`. */
    blobs: Record<string, Uint8Array>;
    report: MigrationReport;
}

const MIME_TO_EXT: Readonly<Record<string, string>> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'font/ttf': 'ttf',
    'font/otf': 'otf',
    'application/json': 'json',
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function decodeBase64(b64: string): Uint8Array {
    const bin = globalThis.atob(b64.replace(/\s/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * Decode a v1 asset `data` field. Returns bytes + the MIME type that was
 * declared (or inferred). v1 `spriteatlas` / `tileset` entries sometimes
 * carry plain JSON text instead of a data URL — that is handled, not an error.
 */
export function decodeV1AssetData(data: string, assetId: string): { bytes: Uint8Array; mimeType: string } {
    const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(data);
    if (match) {
        const mimeType = match[1];
        if (match[2]) return { bytes: decodeBase64(match[3]), mimeType };
        // data URL without ;base64 — percent-encoded text.
        return { bytes: new TextEncoder().encode(decodeURIComponent(match[3])), mimeType };
    }
    if (data.trim().startsWith('{')) {
        // Plain JSON text (spriteatlas / tileset payloads in some v1 files).
        return { bytes: new TextEncoder().encode(data), mimeType: 'application/json' };
    }
    if (data.length === 0) {
        throw new Error(`Asset "${assetId}" has no data.`);
    }
    // Bare base64 with no data: URL wrapper.
    return { bytes: decodeBase64(data), mimeType: 'application/octet-stream' };
}

export function extForAsset(mimeType: string, name: string, type: string): string {
    if (MIME_TO_EXT[mimeType]) return MIME_TO_EXT[mimeType];
    const byName = fileExtension(name);
    if (byName) return byName;
    if (type === 'spriteatlas' || type === 'tileset') return 'json';
    return 'bin';
}

export interface MigrateOptions {
    /** Engine version stamped into meta.engineVersion. Defaults to '2.0.0'. */
    engineVersion?: string;
    /** Plugins to carry into the v2 project (v1 has no plugin list). */
    plugins?: PluginEntry[];
}

/**
 * Migrate a parsed v1 file to a v2 bundle. Validates the v1 input with
 * MgexSchema first (v1 is read-only after this point).
 */
export async function migrateV1ToV2(input: unknown, opts: MigrateOptions = {}): Promise<GlixProjectV2Bundle> {
    const v1: MgexFile = MgexSchema.parse(input);
    const engineVersion = opts.engineVersion ?? '2.0.0';
    const now = new Date().toISOString();
    const report: MigrationReport = {
        assetsExtracted: 0,
        assetsSkipped: [],
        scenesSplit: 0,
        prefabsSplit: 0,
        droppedSettings: [],
        warnings: [],
        startSceneDefaulted: false,
    };

    // --- assets: base64 -> content-addressed blobs ---
    const assets: Record<string, AssetRef> = {};
    const blobs: Record<string, Uint8Array> = {};
    for (const [recordKey, def] of Object.entries(v1.assets)) {
        // The AssetDef's own id is canonical; the record key is not trusted
        // (some v1 files have keys that differ from def.id).
        const id = def.id;
        if (recordKey !== id) {
            report.warnings.push(`Asset record key "${recordKey}" does not match the asset id "${id}"; using the id.`);
        }
        try {
            const { bytes, mimeType } = decodeV1AssetData(def.data, id);
            const declaredMime = def.mimeType ?? mimeType;
            const ext = extForAsset(declaredMime, def.name, def.type);
            const hash = await sha256Hex(bytes);
            const path = assetBlobPath(hash, ext);
            if (!blobs[path]) blobs[path] = bytes;
            const kind = SUPPORTED_ASSET_TYPES[ext]?.kind;
            assets[id] = {
                id,
                type: def.type,
                name: def.name,
                mimeType: declaredMime,
                file: path,
                sha256: hash,
                size: bytes.length,
            };
            if (kind && kind !== def.type && def.type !== 'spriteatlas' && def.type !== 'tileset') {
                report.warnings.push(
                    `Asset "${id}": file extension suggests "${kind}" but the v1 type is "${def.type}"; kept "${def.type}".`,
                );
            }
            report.assetsExtracted += 1;
        } catch (e) {
            const reason = e instanceof Error ? e.message : 'Could not decode the asset data.';
            report.assetsSkipped.push({ id, reason });
            report.warnings.push(`Asset "${id}" was skipped: ${reason}`);
        }
    }

    // --- scenes: one file per scene, pick the start scene ---
    const sceneIds = Object.keys(v1.scenes).sort();
    let startScene = v1.settings.startScene;
    if (!startScene || !v1.scenes[startScene]) {
        startScene = sceneIds[0];
        report.startSceneDefaulted = true;
        if (sceneIds.length > 0) {
            report.warnings.push(
                `No valid start scene in the v1 file; "${startScene}" (first scene alphabetically) is the start scene now.`,
            );
        }
    }
    const scenes: Record<string, SceneDefV2> = {};
    const sceneIndex = sceneIds.map((id) => {
        const scene = v1.scenes[id];
        scenes[`scenes/${id}.json`] = { id: scene.id, name: scene.name, entities: scene.entities };
        return { id: scene.id, name: scene.name, file: `scenes/${id}.json`, isStartScene: id === startScene };
    });
    report.scenesSplit = sceneIds.length;

    // --- prefabs: one file per prefab ---
    const prefabs: Record<string, EntityDef> = {};
    const prefabIndex = Object.entries(v1.prefabs)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, entity]) => {
            prefabs[`prefabs/${id}.json`] = entity;
            return { id, name: entity.name ?? id, file: `prefabs/${id}.json` };
        });
    report.prefabsSplit = prefabIndex.length;

    // --- input: v1 keyboard codes -> v2 bindings ---
    const inputMap = defaultInputMap();
    for (const [action, codes] of Object.entries(v1.settings.input ?? {})) {
        inputMap.actions[action] = {
            bindings: codes.map((code) => ({ device: 'keyboard' as const, code })),
        };
    }

    // --- anything v1 settings carried that v2 drops ---
    const knownSettings = ['startScene', 'physics', 'postProcess', 'input', 'touchControls', 'mobileController', 'backgroundColor', 'viewportMode'];
    for (const key of Object.keys(v1.settings as Record<string, unknown>)) {
        if (!knownSettings.includes(key)) report.droppedSettings.push(key);
    }

    const project = GlixProjectV2Schema.parse({
        formatVersion: '2.0.0',
        meta: {
            name: v1.meta.name,
            id: globalThis.crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            engineVersion,
            resolution: v1.meta.resolution,
        },
        settings: {
            startScene,
            physics: v1.settings.physics,
            postProcess: v1.settings.postProcess,
            touchControls: v1.settings.touchControls,
            // Resolve (not pass through): a v1 project without the section
            // must inherit its legacy touchControls visibility, not v2 defaults.
            mobileController: resolveMobileController(v1.settings as any),
            renderer: 'auto',
            backgroundColor: (v1.settings as Record<string, unknown>).backgroundColor as string | undefined,
            viewportMode: resolveViewportMode(v1.settings as any),
        },
        input: inputMap,
        scenes: sceneIndex,
        prefabs: prefabIndex,
        assets,
        plugins: opts.plugins ?? [],
        workspace: { activeWorkspace: '2d', dockedPanels: [] },
    });

    return { project, scenes, prefabs, blobs, report };
}
