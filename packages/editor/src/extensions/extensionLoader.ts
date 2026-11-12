import { ExtensionLoader } from '@glix/runtime';
import type { InstalledExtension } from '@glix/runtime';
import { unpackGlixExt, packageTextFile } from '@glix/runtime/src/plugins/GlixExtPackage';
import type { ExtensionPermission } from '@glix/runtime/src/plugins/ExtensionManifest';
import { editorBridge } from '../bridge/EditorBridge';
import { useProjectStore } from '../store/useProjectStore';
import { setAttachedPluginEntries } from '../storage/FileIO';

/**
 * Editor-side ExtensionLoader singleton (Phase 3).
 *
 * The loader itself lives in `packages/runtime/src/plugins/` (the sandbox
 * team's directory — this file only *uses* it). It is created lazily from
 * the editor engine, which satisfies the loader's `ExtensionHost`
 * interface structurally (`registerPluginSystem` /
 * `unregisterPluginSystem` / `getWorld`, plus input queries wired to the
 * engine's InputMap). Before the engine exists (welcome screen, no
 * project yet) there is no loader — the Extensions panel says so and
 * offers a refresh instead of crashing.
 *
 * After every lifecycle change the loader's list is mirrored into the
 * engine's PluginAPI (`sync`) and into FileIO's attached plugin entries,
 * so `downloadProjectV2` carries installed extensions into the .glix zip
 * and the project is marked dirty.
 */

let loader: ExtensionLoader | null = null;
let loaderEngine: unknown = null;

export function getExtensionLoader(): ExtensionLoader | null {
    const engine = editorBridge.getEngine();
    if (!engine) return loader;
    if (loader && loaderEngine === engine) return loader;
    // Build the host from the engine (structural ExtensionHost).
    const realHost = {
        registerPluginSystem: (system: any, owner: { extId: string; components: string[] }) =>
            (engine as any).registerPluginSystem(system, owner),
        unregisterPluginSystem: (id: string) => (engine as any).unregisterPluginSystem(id),
        getWorld: () => (engine as any).getWorld(),
        getAction: (name: string) => {
            try { return (engine as any).getInputMap().isActionDown(name) as boolean; } catch { return false; }
        },
        getAxis: (name: string) => {
            try { return (engine as any).getInputMap().axisValue(name) as number; } catch { return 0; }
        },
    };
    loader = new ExtensionLoader(realHost as never, '2.0.0');
    loaderEngine = engine;
    // The loader's project sync starts empty; FileIO's attached entries
    // (seeded from an opened v2 file's plugins[]) are the source of truth
    // for downloads, and syncExtensionState() overwrites them after the
    // first lifecycle change in this session.
    loader.attachProject({ plugins: [] });
    return loader;
}

/** Mirror the loader list into PluginAPI + FileIO and mark dirty. */
export function syncExtensionState(): void {
    if (!loader) return;
    const list = loader.list();
    const engine = editorBridge.getEngine();
    try { (engine as any)?.getPluginAPI?.()?.sync?.(list); } catch { /* panel still works without the mirror */ }
    setAttachedPluginEntries(
        // No `as string[]` cast here: the loader's ExtensionPermission[]
        // is the same 12-value union as ExtensionPermissionV2, and a cast
        // to string[] would no longer be assignable to AttachedPluginEntry.
        loader.toProjectPlugins().map((p) => ({
            id: p.id,
            version: p.version,
            enabled: p.enabled,
            grantedPermissions: [...(p.grantedPermissions ?? [])],
        })),
    );
    useProjectStore.getState().markDirty();
}

export interface PreparedInstall {
    manifest: unknown;
    files: Record<string, string | Uint8Array>;
    grant: {
        id: string;
        name: string;
        version: string;
        requested: Array<{ permission: ExtensionPermission; description: string }>;
    };
}

/** Read a .glixext file and return its grant screen (no install yet). */
export async function prepareExtensionInstall(file: File): Promise<PreparedInstall> {
    const loaderInstance = getExtensionLoader();
    if (!loaderInstance) {
        throw new Error('Extensions need the editor engine. Enter the editor first, then try again.');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const unpacked = await unpackGlixExt(bytes);
    const manifestText = packageTextFile(unpacked, 'glixext.json');
    let manifest: unknown;
    try {
        manifest = JSON.parse(manifestText);
    } catch {
        throw new Error('This extension package has a glixext.json that is not valid JSON.');
    }
    const files: Record<string, string | Uint8Array> = {};
    for (const [name, data] of unpacked) {
        files[name] = /\.(json|js|mjs|txt|css|md)$/i.test(name)
            ? new TextDecoder().decode(data)
            : data;
    }
    const grant = loaderInstance.requestGrant(manifest);
    return { manifest, files, grant };
}

/** Install a prepared package with the permissions the user granted. */
export async function confirmExtensionInstall(
    prepared: PreparedInstall,
    grantedPermissions: ExtensionPermission[],
): Promise<InstalledExtension> {
    const loaderInstance = getExtensionLoader();
    if (!loaderInstance) {
        throw new Error('Extensions need the editor engine. Enter the editor first, then try again.');
    }
    const installed = await loaderInstance.install(prepared.manifest, prepared.files, { grantedPermissions });
    syncExtensionState();
    return installed;
}

export async function enableExtension(id: string): Promise<InstalledExtension> {
    const loaderInstance = getExtensionLoader();
    if (!loaderInstance) throw new Error('Extensions need the editor engine.');
    const result = await loaderInstance.enable(id);
    syncExtensionState();
    return result;
}

export async function disableExtension(id: string): Promise<InstalledExtension> {
    const loaderInstance = getExtensionLoader();
    if (!loaderInstance) throw new Error('Extensions need the editor engine.');
    const result = await loaderInstance.disable(id);
    syncExtensionState();
    return result;
}

export async function uninstallExtension(id: string): Promise<void> {
    const loaderInstance = getExtensionLoader();
    if (!loaderInstance) throw new Error('Extensions need the editor engine.');
    await loaderInstance.uninstall(id);
    syncExtensionState();
}

export function listExtensions(): InstalledExtension[] {
    return getExtensionLoader()?.list() ?? [];
}
