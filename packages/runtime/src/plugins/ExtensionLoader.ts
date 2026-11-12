import { ComponentRegistry } from '@glix/shared/src/ComponentRegistry';
import {
    ExtensionLoadError,
    PERMISSION_DESCRIPTIONS,
    checkEngineVersion,
    compareSemver,
    parseManifest,
    parseManifestJson,
    type ExtensionPermission,
    type GlixExtManifest,
} from './ExtensionManifest';
import {
    createWorldView,
    type AssetRef,
    type BehaviourFn,
    type MenuItemDefinition,
    type PanelDefinition,
    type PluginContext,
    type SystemDefinition,
    type WorldLike,
} from './PluginContext';
import {
    WorkerSandbox,
    type ComponentPatch,
    type InputSnapshot,
    type SandboxMode,
    type WorldSnapshot,
} from './WorkerSandbox';
import { packGlixExt, packageTextFile, unpackGlixExt } from './GlixExtPackage';

export type { SandboxMode };
export { packGlixExt, unpackGlixExt };

/**
 * Loads `.glixext` extensions per PLUGIN_SPEC.md: validates the
 * `glixext.json` manifest, checks the `engineVersion` range, requires an
 * explicit permission grant, runs the entrypoint hooks
 * (`install` / `activate` / `deactivate` / `uninstall`) and tracks
 * everything the extension registered so enable/disable/uninstall can
 * clean it up again. Enable/disable state persists in the attached
 * project's `plugins[]` (PROJECT_FORMAT_v2.md §2).
 *
 * Lifecycle (spec §6): `install` records the extension DISABLED by
 * default; `enable` runs `activate` and registers its declared
 * systems/components/panels; `disable` runs `deactivate` and unregisters
 * them (entity data using the extension's components is kept — the
 * components become inert and are restorable on reinstall); `uninstall`
 * disables first, runs the `uninstall` hook, deletes namespaced storage
 * and removes the entry from `project.json → plugins[]`.
 *
 * Sandbox (PLUGIN_SPEC.md §4): the entrypoint runs in a dedicated
 * `Worker` per extension (`WorkerSandbox`), with no `document`, no
 * `window`, no `localStorage` by construction, and every `ctx` call
 * crosses a `postMessage` bridge validated host-side. The loader
 * additionally statically rejects code containing `eval(` or
 * `new Function(` at install (defence in depth). When no Worker runtime
 * exists at all, the loader falls back to the in-process `new Function`
 * path — clearly marked PROTOTYPE-GRADE (it stops accidents, not a
 * determined hostile extension) and recorded on the extension record.
 * System `update()` calls cross the bridge asynchronously, so the host
 * runs worker systems with a one-frame pipeline: each frame it sends a
 * world snapshot and applies the patches from the previous round-trip
 * (see `flushSystemUpdates()` for the awaited, testable form).
 */

export type ExtensionStatus = 'installed' | 'enabled' | 'disabled';

/** One entry of `project.json → plugins[]` (PROJECT_FORMAT_v2.md §2),
 * extended with the granted permission list the spec stores with the
 * grant (PLUGIN_SPEC.md §3). */
export interface ProjectPluginEntry {
    id: string;
    version: string;
    enabled: boolean;
    grantedPermissions?: ExtensionPermission[];
}

export interface InstalledExtension {
    id: string;
    name: string;
    version: string;
    status: ExtensionStatus;
    /** Permissions the user actually granted at install time. */
    permissions: ExtensionPermission[];
    /** Permissions the manifest requested. */
    requestedPermissions: ExtensionPermission[];
    components: string[];
    systems: string[];
    panels: string[];
    warnings: string[];
}

/** Minimal host surface the loader needs. `Engine` satisfies this
 * interface structurally, so the loader can be tested without a WebGL
 * context. */
export interface ExtensionHost {
    registerPluginSystem(
        system: SystemDefinition,
        owner: { extId: string; components: string[] },
    ): void;
    unregisterPluginSystem(id: string): void;
    getWorld(): WorldLike;
    getAction?(name: string): boolean;
    getAxis?(name: string): number;
}

/** The extension definition object: the single default export of
 * `main.js` (PLUGIN_SPEC.md §1, §6). All hooks are optional except
 * `activate` when the extension contributes systems. */
export interface ExtensionDefinition {
    install?(ctx: PluginContext): void | Promise<void>;
    activate?(ctx: PluginContext): void | Promise<void>;
    deactivate?(ctx: PluginContext): void | Promise<void>;
    uninstall?(ctx: PluginContext): void | Promise<void>;
}

export interface InstallOptions {
    /** Permissions the user granted on the grant screen. Install refuses
     * without an explicit grant — there is no silent default. */
    grantedPermissions?: ExtensionPermission[];
    /** Engine version to check the manifest range against. */
    engineVersion?: string;
    /** Allow installing an older version over a newer one (user confirmed). */
    allowDowngrade?: boolean;
    /** Replace an installed version of the same id with this one (update). */
    update?: boolean;
}

/** How extension code is sandboxed. `'auto'` (default) uses a real Worker
 * when one exists and falls back to the in-process sandbox otherwise;
 * `'worker'` refuses to install when no Worker exists; `'in-process'`
 * forces the prototype-grade fallback (tests, very old browsers). */
export type SandboxOption = 'auto' | 'worker' | 'in-process';

export interface LoaderOptions {
    sandbox?: SandboxOption;
}

/** Package file contents: text for code/manifest, raw bytes for assets.
 * The in-memory `install()` API historically took strings only; zip
 * installs pass bytes through unchanged. */
export type PackageFileValue = string | Uint8Array;

export interface RestoreResult {
    restored: string[];
    /** Installed in the project but no package was supplied — the project
     * still opens; data is kept, systems stay inactive. */
    missing: string[];
    errors: Array<{ id: string; message: string }>;
}

const HOOK_TIMEOUT_MS = 5000;
const STORAGE_QUOTA_BYTES = 1024 * 1024; // 1 MB per extension (spec §3)
const NETWORK_TIMEOUT_MS = 10000;
const NETWORK_MAX_BYTES = 5 * 1024 * 1024;

type HookPhase = 'install' | 'activate' | 'deactivate' | 'uninstall';

interface LoadedExtensionRecord {
    manifest: GlixExtManifest;
    status: ExtensionStatus;
    grantedPermissions: ExtensionPermission[];
    /** Entrypoint source, kept so the extension can be re-enabled later. */
    code: string;
    /** Package files (`filename -> source`), for `assets.read`. */
    files: Record<string, PackageFileValue>;
    components: string[];
    systems: string[];
    panels: string[];
    menuItems: string[];
    behaviours: Map<string, BehaviourFn>;
    storage: Map<string, unknown>;
    importedAssets: Map<string, string>;
    listeners: Array<{ pattern: string; cb: (payload: unknown) => void }>;
    warnings: string[];
    hookLog: HookPhase[];
    /** Live Worker sandbox, if this extension runs in one. */
    sandbox: WorkerSandbox | null;
    /** Which sandbox actually runs this extension's code. */
    sandboxMode: SandboxMode;
    /** Hook currently executing (worker bridge dispatches `ctx` calls
     * against this phase, so phase gating works across the bridge). */
    activePhase: HookPhase | null;
    /** Consecutive missed system-update round-trips, per system. */
    systemMisses: Map<string, number>;
    /** Event-forwarder callbacks (pattern -> cb), for `events.off`. */
    eventForwarders: Map<string, (payload: unknown) => void>;
    /** Input actions/axes the worker has asked about (for snapshots). */
    queriedInputs: { actions: Set<string>; axes: Set<string> };
}

export class ExtensionLoader {
    private loaded = new Map<string, LoadedExtensionRecord>();
    private project: { plugins?: ProjectPluginEntry[] } | null = null;
    /** Ids uninstalled in this session — dropped from `plugins[]` on sync. */
    private removedIds = new Set<string>();
    private sandboxOption: SandboxOption;

    constructor(
        private host: ExtensionHost,
        private engineVersion?: string,
        options: LoaderOptions = {},
    ) {
        this.sandboxOption = options.sandbox ?? 'auto';
    }

    // ------------------------------------------------------------------
    // Permission grant (spec §3, §6 — stub UI, real persisted state)
    // ------------------------------------------------------------------

    /**
     * The permission grant screen, as data. The editor renders this
     * (ExtensionsPanel) before install; the grant itself is the explicit
     * `grantedPermissions` list passed to `install()`.
     */
    requestGrant(manifestInput: unknown): {
        id: string;
        name: string;
        version: string;
        requested: Array<{ permission: ExtensionPermission; description: string }>;
    } {
        const manifest = parseManifest(manifestInput);
        return {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            requested: manifest.permissions.map((permission) => ({
                permission,
                description: PERMISSION_DESCRIPTIONS[permission],
            })),
        };
    }

    /** Plain-text rendering of the grant screen (stub UI for headless use). */
    renderGrantScreen(manifestInput: unknown): string {
        const grant = this.requestGrant(manifestInput);
        const lines = [
            `Install "${grant.name}" (${grant.id} v${grant.version})?`,
            'It asks for these permissions:',
        ];
        if (grant.requested.length === 0) lines.push('  (none — it asks for no permissions)');
        for (const r of grant.requested) lines.push(`  - ${r.permission}: ${r.description}`);
        lines.push('Grant only the permissions you trust. You can change them later in project settings.');
        return lines.join('\n');
    }

    // ------------------------------------------------------------------
    // Lifecycle: install / enable / disable / uninstall (spec §6)
    // ------------------------------------------------------------------

    /**
     * Installs an extension from a parsed manifest value plus a map of
     * `filename -> source` for the package contents. Validates the
     * manifest, checks the engine version, requires an explicit
     * permission grant, runs the `install()` hook (storage setup only —
     * no systems are registered yet) and records the extension DISABLED
     * by default. Throws {@link ExtensionLoadError} with a plain-language
     * message when anything is wrong; a failed install never installs
     * partially.
     */
    async install(
        manifestInput: unknown,
        files: Record<string, PackageFileValue>,
        options: InstallOptions = {},
    ): Promise<InstalledExtension> {
        const manifest = parseManifest(manifestInput);
        checkEngineVersion(manifest, options.engineVersion ?? this.engineVersion);

        const existing = this.loaded.get(manifest.id);
        if (existing) {
            if (options.update && compareSemver(manifest.version, existing.manifest.version) > 0) {
                await this.uninstall(manifest.id);
            } else if (compareSemver(manifest.version, existing.manifest.version) < 0) {
                throw new ExtensionLoadError(
                    `The extension "${manifest.name}" version ${manifest.version} is older than the installed ` +
                    `version ${existing.manifest.version}. Downgrades need your confirmation — install again with confirmation.`,
                );
            } else {
                throw new ExtensionLoadError(
                    `The extension "${manifest.name}" (${manifest.id}) is already installed. ` +
                    'Uninstall it first, then install it again.',
                );
            }
        }

        if (manifest.dependencies) {
            for (const dep of manifest.dependencies) {
                if (dep.id === manifest.id) {
                    throw new ExtensionLoadError(
                        `The extension "${manifest.name}" cannot be installed: it depends on itself.`,
                    );
                }
                const depRecord = this.loaded.get(dep.id);
                if (depRecord?.manifest.dependencies?.some((d) => d.id === manifest.id)) {
                    throw new ExtensionLoadError(
                        `The extension "${manifest.name}" cannot be installed: it has a circular dependency ` +
                        `with "${depRecord.manifest.name}".`,
                    );
                }
            }
        }

        const main = fileAsText(files, manifest.main, manifest.name);
        if (main === null) {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" could not be loaded: its entry file "${manifest.main}" ` +
                'was not found in the extension package.',
            );
        }
        if (manifest.editor !== undefined && fileAsText(files, manifest.editor, manifest.name) === null) {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" could not be loaded: its editor file "${manifest.editor}" ` +
                'was not found in the extension package.',
            );
        }
        assertNoForbiddenCode(main, manifest.name);
        if (manifest.editor !== undefined) {
            assertNoForbiddenCode(fileAsText(files, manifest.editor, manifest.name)!, manifest.name);
        }
        // Extension code is bundled into main.js: top-level imports have
        // no base to resolve against in the Worker (data: URL import) or
        // the in-process loader, so they are rejected up front in both.
        assertNoImportStatement(main, manifest.name);

        if (options.grantedPermissions === undefined) {
            const wanted = manifest.permissions.length > 0
                ? manifest.permissions.join(', ')
                : '(none)';
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" needs your permission before it can be installed. ` +
                `It asks for: ${wanted}. Grant the permissions on the install screen and try again.`,
            );
        }
        for (const granted of options.grantedPermissions) {
            if (!manifest.permissions.includes(granted)) {
                throw new ExtensionLoadError(
                    `The extension "${manifest.name}" cannot be installed: permission "${granted}" was granted ` +
                    'but the extension never asked for it.',
                );
            }
        }
        const granted = [...options.grantedPermissions];

        this.removedIds.delete(manifest.id);

        const record: LoadedExtensionRecord = {
            manifest,
            status: 'disabled',
            grantedPermissions: granted,
            code: main,
            files,
            components: [],
            systems: [],
            panels: [],
            menuItems: [],
            behaviours: new Map(),
            storage: new Map(),
            importedAssets: new Map(),
            listeners: [],
            warnings: [],
            hookLog: [],
            sandbox: null,
            sandboxMode: 'in-process',
            activePhase: null,
            systemMisses: new Map(),
            eventForwarders: new Map(),
            queriedInputs: { actions: new Set(), axes: new Set() },
        };
        this.loaded.set(manifest.id, record);

        try {
            // Install runs its hook in an ephemeral sandbox (worker) or in
            // process (fallback); the sandbox only stays alive while the
            // extension is enabled — see enable()/disable().
            await this.runHookForRecord(record, 'install');
        } catch (err) {
            await this.terminateSandbox(record);
            this.loaded.delete(manifest.id);
            if (err instanceof ExtensionLoadError) throw err;
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" could not be installed: its install step failed (${(err as Error).message}).`,
            );
        }

        record.status = 'installed';
        this.syncProject();
        return this.view(record);
    }

    /** Enables an installed extension: loads the worker-equivalent (the
     * sandboxed module), runs `activate(ctx)`, registers its declared
     * systems/components/panels. On any error it rolls back all
     * registrations, stays disabled, and reports the error. */
    async enable(id: string): Promise<InstalledExtension> {
        const record = this.require(id);
        if (record.status === 'enabled') return this.view(record);

        if (record.manifest.dependencies) {
            for (const dep of record.manifest.dependencies) {
                const depRecord = this.loaded.get(dep.id);
                if (!depRecord) {
                    throw new ExtensionLoadError(
                        `The extension "${record.manifest.name}" cannot be enabled: it needs ` +
                        `"${dep.id}" (version ${dep.version}), which is not installed.`,
                    );
                }
                if (depRecord.status !== 'enabled') {
                    throw new ExtensionLoadError(
                        `The extension "${record.manifest.name}" cannot be enabled: it needs ` +
                        `"${depRecord.manifest.name}" to be enabled first.`,
                    );
                }
            }
        }

        record.components = [];
        record.systems = [];
        record.panels = [];
        record.menuItems = [];
        record.behaviours = new Map();
        try {
            // The sandbox stays alive for as long as the extension is
            // enabled (its systems run in it); disable() terminates it.
            await this.ensureSandbox(record);
            if (record.sandboxMode === 'worker') {
                if (
                    record.manifest.contributes.systems.length > 0 &&
                    !(record.sandbox?.hooks.includes('activate') ?? false)
                ) {
                    throw new ExtensionLoadError(
                        `The extension "${record.manifest.name}" declares systems but has no activate() hook. ` +
                        'Add an activate() hook that registers them.',
                    );
                }
            } else {
                const definition = this.evaluateModule(record, 'activate');
                if (record.manifest.contributes.systems.length > 0 && typeof definition.activate !== 'function') {
                    throw new ExtensionLoadError(
                        `The extension "${record.manifest.name}" declares systems but has no activate() hook. ` +
                        'Add an activate() hook that registers them.',
                    );
                }
            }
            await this.runHookForRecord(record, 'activate');
            // Declared-but-missing contributions warn (spec §2).
            for (const declared of record.manifest.contributes.systems) {
                if (!record.systems.includes(declared.id)) {
                    this.warn(record, `It declares system "${declared.id}" but never registered it.`);
                }
            }
            for (const declared of record.manifest.contributes.components) {
                if (!record.components.includes(declared.type)) {
                    this.warn(record, `It declares component "${declared.type}" but never registered it.`);
                }
            }
            for (const declared of record.manifest.contributes.panels) {
                if (!record.panels.includes(declared.id)) {
                    this.warn(record, `It declares panel "${declared.id}" but never registered it.`);
                }
            }
        } catch (err) {
            await this.terminateSandbox(record);
            this.teardown(record);
            if (err instanceof ExtensionLoadError) throw err;
            throw new ExtensionLoadError(
                `The extension "${record.manifest.name}" could not be enabled: its activate step failed (${(err as Error).message}).`,
            );
        }

        record.status = 'enabled';
        this.syncProject();
        return this.view(record);
    }

    /** Disables an enabled extension: runs `deactivate(ctx)`, unregisters
     * its systems/components, and leaves entity data intact (inert). */
    async disable(id: string): Promise<InstalledExtension> {
        const record = this.require(id);
        if (record.status !== 'enabled') {
            record.status = 'disabled';
            this.syncProject();
            return this.view(record);
        }
        try {
            await this.runHookForRecord(record, 'deactivate');
        } catch (err) {
            this.warn(record, `Its deactivate step failed (${(err as Error).message}); it was still disabled.`);
        }
        // Flush the bridge (storage writes, log lines) before killing the
        // worker — a pong is queued behind every earlier message.
        if (record.sandbox) {
            try {
                await record.sandbox.sync();
            } catch {
                // Worker already dead — nothing to flush.
            }
        }
        await this.terminateSandbox(record);
        this.teardown(record);
        record.status = 'disabled';
        this.syncProject();
        return this.view(record);
    }

    /** Uninstalls an extension (disables it first if needed), runs the
     * `uninstall(ctx)` hook, deletes its namespaced storage, and removes
     * it from `project.json → plugins[]`. Project data referencing the
     * extension stays (inert, restorable on reinstall). */
    async uninstall(id: string): Promise<void> {
        const record = this.require(id);
        if (record.status === 'enabled') {
            await this.disable(id);
        }
        try {
            // Uninstall runs in an ephemeral sandbox (worker) or in
            // process (fallback); no sandbox stays alive afterwards.
            await this.runHookForRecord(record, 'uninstall');
        } catch (err) {
            this.warn(record, `Its uninstall step failed (${(err as Error).message}); it was still removed.`);
        }
        record.storage.clear();
        record.importedAssets.clear();
        this.loaded.delete(id);
        this.removedIds.add(id);
        this.syncProject();
    }

    get(id: string): InstalledExtension | undefined {
        const record = this.loaded.get(id);
        return record ? this.view(record) : undefined;
    }

    list(): InstalledExtension[] {
        return Array.from(this.loaded.values(), (r) => this.view(r));
    }

    /** Hook call order for a loaded extension, for tests and diagnostics. */
    hookLog(id: string): HookPhase[] {
        return [...this.require(id).hookLog];
    }

    /** Dispatches an engine/scene/input event to listening extensions.
     * Worker extensions receive it over the bridge (their forwarder
     * callbacks post it into the worker); in-process extensions get the
     * direct call, as before. */
    emitEngineEvent(pattern: string, payload: unknown): void {
        for (const record of this.loaded.values()) {
            if (record.status !== 'enabled') continue;
            for (const listener of record.listeners) {
                if (patternMatches(listener.pattern, pattern)) {
                    try {
                        listener.cb(payload);
                    } catch (err) {
                        console.warn(`[ext:${record.manifest.id}] Event listener failed:`, err);
                    }
                }
            }
        }
    }

    /** Which sandbox actually runs an extension's code
     * (`'worker'` or `'in-process'`), for diagnostics and tests. */
    sandboxMode(id: string): SandboxMode {
        return this.require(id).sandboxMode;
    }

    /** Pushes current input state into enabled workers, so their
     * `ctx.input` mirror stays fresh. The engine calls this each frame
     * (or when input changes); without it, worker input reads stay at
     * their initial (empty) snapshot. */
    pushInputState(input: InputSnapshot): void {
        for (const record of this.loaded.values()) {
            if (record.status === 'enabled') record.sandbox?.sendInputState(input);
        }
    }

    /**
     * Awaited system round-trip for every enabled worker system: sends a
     * fresh world snapshot to each worker system and applies the patches
     * it returns. The frame loop uses the fire-and-forget stub instead
     * (one-frame pipeline); tests and the editor use this when they need
     * the world updated *now*.
     */
    async flushSystemUpdates(): Promise<void> {
        for (const record of this.loaded.values()) {
            if (record.status !== 'enabled' || !record.sandbox) continue;
            for (const systemId of [...record.systems]) {
                const snapshot = this.buildWorldSnapshot();
                const input = this.readInputSnapshot(record);
                try {
                    const patches = await record.sandbox.requestSystemUpdate(systemId, snapshot, 0.016, input);
                    this.applySystemPatches(record, patches);
                    record.systemMisses.set(systemId, 0);
                } catch (err) {
                    this.warn(record, `System "${systemId}" did not answer its update (${(err as Error).message}).`);
                }
            }
        }
    }

    /** Flush barrier for events: awaits a ping round-trip to every enabled
     * worker, guaranteeing all earlier event messages were processed. */
    async flushEvents(): Promise<void> {
        for (const record of this.loaded.values()) {
            if (record.status === 'enabled' && record.sandbox) {
                await record.sandbox.ping();
            }
        }
    }

    // ------------------------------------------------------------------
    // Persistence — project.json → plugins[] (PROJECT_FORMAT_v2.md §2)
    // ------------------------------------------------------------------

    /** Attaches the project object whose `plugins[]` this loader keeps in sync. */
    attachProject(project: { plugins?: ProjectPluginEntry[] }): void {
        this.project = project;
        this.syncProject();
    }

    /** Writes the loader's current state into the attached project, if any.
     * Entries for extensions the loader has never seen (e.g. a missing
     * `.glixext` whose data must be kept) are preserved untouched; only
     * explicitly uninstalled ids are dropped. */
    syncProject(): void {
        if (!this.project) return;
        const kept = (this.project.plugins ?? []).filter(
            (entry) => !this.loaded.has(entry.id) && !this.removedIds.has(entry.id),
        );
        const current = Array.from(this.loaded.values(), (r) => ({
            id: r.manifest.id,
            version: r.manifest.version,
            enabled: r.status === 'enabled',
            grantedPermissions: [...r.grantedPermissions],
        }));
        this.project.plugins = [...kept, ...current];
    }

    /** Serialises the loader's state as a `plugins[]` array (no project attached). */
    toProjectPlugins(): ProjectPluginEntry[] {
        return Array.from(this.loaded.values(), (r) => ({
            id: r.manifest.id,
            version: r.manifest.version,
            enabled: r.status === 'enabled',
            grantedPermissions: [...r.grantedPermissions],
        }));
    }

    /**
     * Installs an extension from a `.glixext` zip (bytes). Unpacks the
     * zip, validates `glixext.json`, then installs exactly as `install()`
     * does. Bad zips are rejected with a plain-language error and install
     * nothing.
     */
    async installFromZip(
        bytes: Uint8Array,
        options: InstallOptions = {},
    ): Promise<InstalledExtension> {
        const files = await unpackGlixExt(bytes);
        const manifestText = packageTextFile(files, 'glixext.json');
        const manifest = parseManifestJson(manifestText);
        const record: Record<string, PackageFileValue> = {};
        for (const [name, data] of files) {
            record[name] = name.endsWith('.json') || name.endsWith('.js') || name.endsWith('.mjs')
                ? new TextDecoder('utf-8').decode(data)
                : data;
        }
        return this.install(manifest, record, options);
    }

    /**
     * Restores extensions recorded in a project's `plugins[]`.
     * `resolveFiles(id)` returns the package files for an installed
     * extension, or `null` when its `.glixext` is missing. A missing
     * extension never blocks opening the project — it is reported in
     * `missing` and its data stays inert.
     */
    async restoreFromProject(
        project: { plugins?: ProjectPluginEntry[] },
        resolveFiles: (id: string) => Record<string, PackageFileValue> | null,
        manifests: (id: string) => unknown,
    ): Promise<RestoreResult> {
        const result: RestoreResult = { restored: [], missing: [], errors: [] };
        this.attachProject(project);
        for (const entry of project.plugins ?? []) {
            if (this.loaded.has(entry.id)) continue;
            const files = resolveFiles(entry.id);
            if (files === null) {
                result.missing.push(entry.id);
                continue;
            }
            try {
                const manifest = parseManifest(manifests(entry.id));
                if (manifest.version !== entry.version) {
                    result.errors.push({
                        id: entry.id,
                        message: `Project lists version ${entry.version} but the package is ${manifest.version}; the package version was installed.`,
                    });
                }
                await this.install(manifest, files, {
                    grantedPermissions: entry.grantedPermissions ?? [],
                    engineVersion: this.engineVersion,
                });
                if (entry.enabled) await this.enable(entry.id);
                result.restored.push(entry.id);
            } catch (err) {
                result.errors.push({ id: entry.id, message: (err as Error).message });
            }
        }
        return result;
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private require(id: string): LoadedExtensionRecord {
        const record = this.loaded.get(id);
        if (!record) {
            throw new ExtensionLoadError(
                `There is no installed extension called "${id}".`,
            );
        }
        return record;
    }

    private view(record: LoadedExtensionRecord): InstalledExtension {
        return {
            id: record.manifest.id,
            name: record.manifest.name,
            version: record.manifest.version,
            status: record.status,
            permissions: [...record.grantedPermissions],
            requestedPermissions: [...record.manifest.permissions],
            components: [...record.components],
            systems: [...record.systems],
            panels: [...record.panels],
            warnings: [...record.warnings],
        };
    }

    private warnedMessages = new WeakMap<LoadedExtensionRecord, Set<string>>();

    private warn(record: LoadedExtensionRecord, message: string): void {
        // Identical warnings log ONCE per extension (a throwing system
        // fails every frame until its 3-miss auto-disable lands; without
        // this the console floods with the same line). The miss counter
        // that drives the auto-disable is untouched — only the logging
        // and the panel's warning list are deduped.
        let seen = this.warnedMessages.get(record);
        if (!seen) {
            seen = new Set();
            this.warnedMessages.set(record, seen);
        }
        if (seen.has(message)) return;
        seen.add(message);
        const full = `The extension "${record.manifest.name}" has a problem: ${message}`;
        record.warnings.push(full);
        console.warn(`[ext:${record.manifest.id}] ${message}`);
    }

    /** Evaluates the entrypoint module and returns its default export. */
    private evaluateModule(record: LoadedExtensionRecord, phase: HookPhase): ExtensionDefinition {
        const definition = runExtensionModule(record.code, this.createContext(record, phase));
        if (definition === null || typeof definition !== 'object') {
            throw new ExtensionLoadError(
                `The extension "${record.manifest.name}" could not be loaded: its "${record.manifest.main}" ` +
                'must have a single default export — the extension definition object ' +
                'with install/activate/deactivate/uninstall hooks.',
            );
        }
        return definition as ExtensionDefinition;
    }

    private async runHook(
        record: LoadedExtensionRecord,
        definition: ExtensionDefinition,
        phase: HookPhase,
    ): Promise<void> {
        const hook = definition[phase];
        if (typeof hook !== 'function') return;
        record.hookLog.push(phase);
        const ctx = this.createContext(record, phase);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`timed out after ${HOOK_TIMEOUT_MS / 1000} seconds`)),
                HOOK_TIMEOUT_MS,
            );
        });
        try {
            await Promise.race([Promise.resolve().then(() => hook(ctx)), timeout]);
        } finally {
            if (timer !== undefined) clearTimeout(timer);
        }
    }

    // ------------------------------------------------------------------
    // Worker sandbox — PLUGIN_SPEC.md §4 (see WorkerSandbox.ts)
    // ------------------------------------------------------------------

    /**
     * Runs one lifecycle hook for a record, in the Worker when one is
     * available (or forced), otherwise in process. When a live sandbox
     * already exists (the extension is being enabled) it is reused;
     * install/uninstall run in an ephemeral sandbox that is terminated
     * afterwards. A hung hook times out after 5 s and never freezes the
     * engine — the worker is terminated on timeout.
     */
    private async runHookForRecord(record: LoadedExtensionRecord, phase: HookPhase): Promise<void> {
        if (record.sandbox) {
            record.activePhase = phase;
            try {
                await record.sandbox.callHook(phase);
                record.hookLog.push(phase);
            } catch (err) {
                // Plain Error on purpose: install()/enable() wrap hook
                // failures into ExtensionLoadError with the "... step
                // failed" wording the harness and users read.
                throw new Error(
                    `The extension "${record.manifest.name}" could not run its ${phase} step: ${stripTrailingPeriod((err as Error).message)}.`,
                );
            } finally {
                record.activePhase = null;
            }
            return;
        }
        if (this.sandboxOption === 'in-process') {
            const definition = this.evaluateModule(record, phase);
            await this.runHook(record, definition, phase);
            return;
        }
        const sandbox = await this.createSandbox(record);
        if (!sandbox) {
            // No Worker runtime — prototype-grade fallback (auto mode).
            record.sandboxMode = 'in-process';
            const definition = this.evaluateModule(record, phase);
            await this.runHook(record, definition, phase);
            return;
        }
        record.sandbox = sandbox;
        record.activePhase = phase;
        try {
            await sandbox.callHook(phase);
            record.hookLog.push(phase);
        } catch (err) {
            // Plain Error on purpose — see the live-sandbox path above.
            throw new Error(
                `The extension "${record.manifest.name}" could not run its ${phase} step: ${stripTrailingPeriod((err as Error).message)}.`,
            );
        } finally {
            record.activePhase = null;
            record.sandbox = null;
            await sandbox.terminate();
        }
    }

    /**
     * Starts (and keeps) the Worker sandbox for an extension being
     * enabled. Returns without a sandbox when the fallback applies.
     * Throws a plain-language error when the caller asked for Worker-only
     * and no Worker runtime exists.
     */
    private async ensureSandbox(record: LoadedExtensionRecord): Promise<void> {
        if (record.sandbox) return;
        if (this.sandboxOption === 'in-process') {
            record.sandboxMode = 'in-process';
            return;
        }
        const sandbox = await this.createSandbox(record);
        if (!sandbox) {
            record.sandboxMode = 'in-process';
            return;
        }
        record.sandbox = sandbox;
        record.sandboxMode = 'worker';
    }

    private async createSandbox(record: LoadedExtensionRecord): Promise<WorkerSandbox | null> {
        const sandbox = new WorkerSandbox(
            {
                code: record.code,
                extId: record.manifest.id,
                manifest: Object.freeze({ ...record.manifest }),
                storage: Object.fromEntries(
                    Array.from(record.storage.entries()).map(([k, v]) => [
                        k.replace(`ext:${record.manifest.id}:`, ''),
                        v,
                    ]),
                ),
                assetIds: Object.keys(record.files)
                    .filter((p) => p.startsWith('assets/'))
                    .map((p) => p.slice('assets/'.length)),
                granted: [...record.grantedPermissions],
                input: this.readInputSnapshot(record),
            },
            {
                onCtxCall: (method, args) => this.handleWorkerCtxCall(record, method, args),
                onSystemResult: (systemId, patches) => {
                    this.applySystemPatches(record, patches);
                    record.systemMisses.set(systemId, 0);
                },
                onSystemError: (systemId, error) => {
                    const misses = (record.systemMisses.get(systemId) ?? 0) + 1;
                    record.systemMisses.set(systemId, misses);
                    this.warn(record, `System "${systemId}" failed in its worker (${error}).`);
                    if (misses >= 3 && record.status === 'enabled') {
                        void this.disable(record.manifest.id).catch(() => undefined);
                    }
                },
                onLog: (level, message) => {
                    if (level === 'info') console.log(`[ext:${record.manifest.id}]`, message);
                    else if (level === 'warn') console.warn(`[ext:${record.manifest.id}]`, message);
                    else console.error(`[ext:${record.manifest.id}]`, message);
                },
            },
        );
        try {
            await sandbox.start();
            return sandbox;
        } catch (err) {
            await sandbox.terminate().catch(() => undefined);
            if (this.sandboxOption === 'worker') {
                throw new ExtensionLoadError(
                    `The extension "${record.manifest.name}" needs a real Worker sandbox, but this environment has none (${(err as Error).message}).`,
                );
            }
            this.warn(
                record,
                `No Worker is available (${(err as Error).message}); running in the prototype-grade in-process sandbox instead.`,
            );
            return null;
        }
    }

    private async terminateSandbox(record: LoadedExtensionRecord): Promise<void> {
        const sandbox = record.sandbox;
        record.sandbox = null;
        if (sandbox) await sandbox.terminate();
    }

    /**
     * Dispatches one `ctx` call from the worker. The call runs through
     * the same capability-scoped context the in-process loader builds, so
     * permissions, declared contributions and allowlists are enforced
     * identically in both modes. `phase` is the hook currently running
     * (tracked on the record), so phase gating works across the bridge.
     */
    private async handleWorkerCtxCall(
        record: LoadedExtensionRecord,
        method: string,
        args: unknown[],
    ): Promise<unknown> {
        const phase = record.activePhase ?? 'activate';
        const ctx = this.createContext(record, phase);
        switch (method) {
            case 'components.register': {
                const [type, defaults] = args as [string, Record<string, unknown>];
                ctx.components.register(type, defaults);
                return undefined;
            }
            case 'systems.register': {
                const [meta] = args as [{ id: string; phase: 'fixed' | 'render' }];
                this.validateSystemRegistration(record, meta, phase);
                this.registerSystemOnHost(record, this.workerSystemStub(record, meta));
                return undefined;
            }
            case 'storage.set': {
                const [key, value] = args as [string, unknown];
                ctx.storage.set(key, value);
                return undefined;
            }
            case 'assets.get': {
                const [id] = args as [string];
                const blob = await ctx.assets.get(id);
                const buffer = new Uint8Array(await blob.arrayBuffer());
                return { dataBase64: bytesToBase64(buffer), mimeType: blob.type };
            }
            case 'assets.list':
                return ctx.assets.list();
            case 'assets.import': {
                const [name, text] = args as [string, string];
                return ctx.assets.import(new Blob([text]), name);
            }
            case 'network.fetch': {
                const [url, opts] = args as [string, RequestInit | null];
                const response = await ctx.network.fetch(url, opts ?? undefined);
                const text = await response.text();
                return { ok: response.ok, status: response.status, statusText: response.statusText, text };
            }
            case 'events.on': {
                const [pattern] = args as [string];
                const forward = (payload: unknown): void => {
                    record.sandbox?.sendEvent(pattern, payload);
                };
                record.eventForwarders.set(pattern, forward);
                ctx.events.on(pattern, forward);
                return undefined;
            }
            case 'events.off': {
                const [pattern] = args as [string];
                const forward = record.eventForwarders.get(pattern);
                if (forward) {
                    record.listeners = record.listeners.filter((l) => l.cb !== forward);
                    record.eventForwarders.delete(pattern);
                }
                return undefined;
            }
            case 'events.emit': {
                const [event, payload] = args as [string, unknown];
                ctx.events.emit(event, payload);
                return undefined;
            }
            case 'scripts.register': {
                const [name] = args as [string];
                // Recorded only (same as Phase 2): the behaviour function
                // lives in the worker; wiring behaviours into ScriptSystem
                // is a separate item. The stub warns if ever invoked.
                ctx.scripts.registerBehaviour(name, () => {
                    console.warn(`[ext:${record.manifest.id}] Behaviour "${name}" is recorded but not wired into ScriptSystem yet.`);
                });
                return undefined;
            }
            case 'ui.registerPanel': {
                const [def] = args as [PanelDefinition];
                ctx.ui.registerPanel(def);
                return undefined;
            }
            case 'ui.addMenuItem': {
                const [def] = args as [MenuItemDefinition];
                ctx.ui.addMenuItem(def);
                return undefined;
            }
            case 'input.query': {
                const [kind, name] = args as ['action' | 'axis', string];
                if (kind === 'action') record.queriedInputs.actions.add(name);
                else record.queriedInputs.axes.add(name);
                return undefined;
            }
            case 'log': {
                const [level, message] = args as ['info' | 'warn' | 'error', string];
                if (level === 'info') console.log(`[ext:${record.manifest.id}]`, message);
                else if (level === 'warn') console.warn(`[ext:${record.manifest.id}]`, message);
                else console.error(`[ext:${record.manifest.id}]`, message);
                return undefined;
            }
            default:
                throw new ExtensionLoadError(
                    `The extension "${record.manifest.name}" called an unknown bridge method "${method}".`,
                );
        }
    }

    /** Shared system-registration validation (in-process + worker paths). */
    private validateSystemRegistration(
        record: LoadedExtensionRecord,
        system: { id?: string; phase?: string },
        phase: HookPhase,
    ): void {
        const { manifest } = record;
        if (phase !== 'activate') {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" tried to add a system outside its activate() hook. ` +
                'Systems can only be registered while the extension is being enabled.',
            );
        }
        if (!record.grantedPermissions.includes('systems.register')) {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" tried to add a system, but that permission was not granted. ` +
                `Granted permissions are: ${record.grantedPermissions.join(', ') || '(none)'}. ` +
                'Ask for "systems.register" in glixext.json and grant it at install time.',
            );
        }
        if (!system || typeof system.id !== 'string' || system.id.trim() === '') {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" tried to add a system without an id.`,
            );
        }
        if (!manifest.contributes.systems.some((s) => s.id === system.id)) {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" tried to add a system called "${system.id}" that it never declared. ` +
                'Declare it in "contributes.systems" in glixext.json first.',
            );
        }
        if (system.phase !== 'fixed' && system.phase !== 'render') {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" tried to add a system called "${system.id}" ` +
                'with a phase that is not "fixed" or "render".',
            );
        }
        const declared = manifest.contributes.systems.find((s) => s.id === system.id)!;
        if (system.phase !== declared.phase) {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" registered system "${system.id}" as phase "${system.phase}" ` +
                `but declared it as "${declared.phase}" in glixext.json.`,
            );
        }
        if (record.systems.includes(system.id)) {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" tried to add the system "${system.id}" twice.`,
            );
        }
    }

    /** Registers a system definition with the host and records it. */
    private registerSystemOnHost(record: LoadedExtensionRecord, system: SystemDefinition): void {
        try {
            // The live components array is shared with the host, so a
            // WorldView built later sees components registered after
            // this system.
            this.host.registerPluginSystem(system, { extId: record.manifest.id, components: record.components });
        } catch (err) {
            throw new ExtensionLoadError(
                `The extension "${record.manifest.name}" could not add the system "${system.id}": ${(err as Error).message}`,
            );
        }
        record.systems.push(system.id);
    }

    /**
     * Host-side stub for a worker system. The real `update()` lives in
     * the worker; this stub sends a world snapshot and applies the
     * patches from the previous round-trip — a one-frame pipeline, so a
     * slow or hung worker can never block the frame loop. Use
     * `flushSystemUpdates()` when the world must be updated *now*.
     */
    private workerSystemStub(
        record: LoadedExtensionRecord,
        meta: { id: string; phase: 'fixed' | 'render' },
    ): SystemDefinition {
        return {
            id: meta.id,
            phase: meta.phase,
            update: (_world: unknown, dt: number) => {
                const sandbox = record.sandbox;
                if (!sandbox) return;
                sandbox.sendSystemUpdate(meta.id, this.buildWorldSnapshot(), dt, this.readInputSnapshot(record));
            },
        };
    }

    /** Applies worker-produced patches through a WorldView (which
     * re-checks the ownership/whitelist rule host-side). */
    private applySystemPatches(
        record: LoadedExtensionRecord,
        patches: ComponentPatch[],
    ): void {
        if (patches.length === 0) return;
        const target = this.host.getWorld();
        const view = createWorldView(target, record.components);
        for (const patch of patches) {
            try {
                view.setComponent(patch.entity, patch.type, patch.patch);
            } catch (err) {
                this.warn(record, `A system patch for "${patch.type}" was refused (${(err as Error).message}).`);
            }
        }
    }

    /** Serialises the whole world (all entities, all registered component
     * types) into the JSON snapshot worker systems read. */
    private buildWorldSnapshot(): WorldSnapshot {
        const world = this.host.getWorld();
        const types = Object.keys(ComponentRegistry as unknown as Record<string, unknown>);
        const entities = world.getEntitiesWithComponents().map((id) => {
            const components: Record<string, unknown> = {};
            for (const type of types) {
                const value = world.getComponent(id, type);
                if (value !== undefined) {
                    components[type] = JSON.parse(JSON.stringify(value));
                }
            }
            return { id, name: world.getName?.(id), components };
        });
        return { entities };
    }

    /** Input state for worker snapshots: only actions/axes the worker has
     * asked about (tracked via `input.query`), read from the host. */
    private readInputSnapshot(record: LoadedExtensionRecord): InputSnapshot {
        const actions: Record<string, boolean> = {};
        const axes: Record<string, number> = {};
        for (const name of record.queriedInputs.actions) {
            actions[name] = this.host.getAction?.(name) ?? false;
        }
        for (const name of record.queriedInputs.axes) {
            axes[name] = this.host.getAxis?.(name) ?? 0;
        }
        return { actions, axes };
    }

    /** Builds the capability-scoped context for one hook call. */
    private createContext(record: LoadedExtensionRecord, phase: HookPhase): PluginContext {
        const { manifest } = record;
        const extId = manifest.id;
        const has = (permission: ExtensionPermission): boolean =>
            record.grantedPermissions.includes(permission);
        const deny = (permission: ExtensionPermission, what: string): never => {
            throw new ExtensionLoadError(
                `The extension "${manifest.name}" tried to ${what}, but that permission was not granted. ` +
                `Granted permissions are: ${record.grantedPermissions.join(', ') || '(none)'}. ` +
                `Ask for "${permission}" in glixext.json and grant it at install time.`,
            );
        };

        const registerComponent = (type: string, defaults: Record<string, unknown>): void => {
            if (phase !== 'activate') {
                throw new ExtensionLoadError(
                    `The extension "${manifest.name}" tried to add a component outside its activate() hook. ` +
                    'Components can only be registered while the extension is being enabled.',
                );
            }
            if (!has('components.register')) deny('components.register', 'add a component');
            if (!manifest.contributes.components.some((c) => c.type === type)) {
                throw new ExtensionLoadError(
                    `The extension "${manifest.name}" tried to add a component called "${type}" that it never declared. ` +
                    'Declare it in "contributes.components" in glixext.json first.',
                );
            }
            this.registerComponent(record, type, defaults);
        };

        const registerSystem = (system: SystemDefinition): void => {
            if (phase !== 'activate') {
                throw new ExtensionLoadError(
                    `The extension "${manifest.name}" tried to add a system outside its activate() hook. ` +
                    'Systems can only be registered while the extension is being enabled.',
                );
            }
            if (!has('systems.register')) deny('systems.register', 'add a system');
            if (!system || typeof system.update !== 'function') {
                throw new ExtensionLoadError(
                    `The extension "${manifest.name}" tried to add a system called "${system?.id ?? ''}" without an update() function.`,
                );
            }
            this.validateSystemRegistration(record, system, phase);
            this.registerSystemOnHost(record, system);
        };

        const ctx: PluginContext = {
            extId,
            manifest: Object.freeze({ ...manifest }),
            systems: { register: registerSystem },
            components: { register: registerComponent },
            assets: {
                get: async (id: string) => {
                    if (!has('assets.read')) deny('assets.read', 'read an asset');
                    return this.getExtensionAsset(record, id);
                },
                list: () => {
                    if (!has('assets.read')) deny('assets.read', 'list assets');
                    return this.listExtensionAssets(record);
                },
                import: async (blob: Blob, name: string) => {
                    if (!has('assets.write')) deny('assets.write', 'import an asset');
                    const text = await blob.text();
                    const hash = hashString(text);
                    const id = `ext://${extId}/imported/${hash}-${name}`;
                    record.importedAssets.set(id, text);
                    return id;
                },
            },
            storage: {
                get: (key: string) => {
                    if (!has('storage.local')) deny('storage.local', 'use its own storage');
                    return record.storage.get(`ext:${extId}:${key}`);
                },
                set: (key: string, value: unknown) => {
                    if (!has('storage.local')) deny('storage.local', 'use its own storage');
                    let serialized: string;
                    try {
                        serialized = JSON.stringify(value);
                    } catch {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to store a value that is not JSON. ` +
                            'Storage only holds JSON values.',
                        );
                    }
                    if (serialized === undefined) {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to store an undefined value. ` +
                            'Storage only holds JSON values.',
                        );
                    }
                    const used = Array.from(record.storage.values()).reduce(
                        (sum: number, v: unknown) => sum + (JSON.stringify(v) ?? '').length,
                        0,
                    );
                    if (used + serialized.length > STORAGE_QUOTA_BYTES) {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" ran out of storage (1 MB limit).`,
                        );
                    }
                    record.storage.set(`ext:${extId}:${key}`, JSON.parse(serialized));
                },
            },
            network: {
                fetch: async (url: string, opts?: RequestInit) => {
                    if (!has('network.fetch')) deny('network.fetch', 'fetch from the network');
                    const allowlist = manifest.network?.allowlist ?? [];
                    if (!allowlist.some((pattern) => globMatches(pattern, url))) {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to fetch "${url}", which is not in its ` +
                            `network allowlist (${allowlist.join(', ') || 'none'}).`,
                        );
                    }
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
                    try {
                        const response = await fetch(url, { ...opts, signal: controller.signal });
                        const length = Number(response.headers.get('content-length') ?? 0);
                        if (length > NETWORK_MAX_BYTES) {
                            throw new ExtensionLoadError(
                                `The extension "${manifest.name}" tried to fetch a file larger than 5 MB.`,
                            );
                        }
                        return response;
                    } catch (err) {
                        if (err instanceof ExtensionLoadError) throw err;
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" could not fetch "${url}" (${(err as Error).message}).`,
                        );
                    } finally {
                        clearTimeout(timer);
                    }
                },
            },
            events: {
                on: (pattern: string, cb: (payload: unknown) => void) => {
                    if (!has('events.listen')) deny('events.listen', 'listen to engine events');
                    if (!/^(engine|scene|input):/.test(pattern)) {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to listen to "${pattern}". ` +
                            'Extensions may only listen to "engine:*", "scene:*" and "input:*" events.',
                        );
                    }
                    if (typeof cb !== 'function') {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" called events.on() without a function.`,
                        );
                    }
                    const listener = { pattern, cb };
                    record.listeners.push(listener);
                    return () => {
                        const i = record.listeners.indexOf(listener);
                        if (i >= 0) record.listeners.splice(i, 1);
                    };
                },
                emit: (event: string, payload: unknown) => {
                    if (!has('events.emit')) deny('events.emit', 'send an event');
                    if (!event.startsWith(`plugin:${extId}:`)) {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to send event "${event}". ` +
                            `Extensions may only send events starting with "plugin:${extId}:".`,
                        );
                    }
                    for (const other of this.loaded.values()) {
                        if (other.status !== 'enabled') continue;
                        for (const listener of other.listeners) {
                            if (patternMatches(listener.pattern, event)) {
                                try {
                                    listener.cb(payload);
                                } catch (err) {
                                    console.warn(`[ext:${other.manifest.id}] Event listener failed:`, err);
                                }
                            }
                        }
                    }
                },
            },
            input: {
                getAction: (name: string) => {
                    if (!has('input.read')) deny('input.read', 'read player input');
                    return this.host.getAction?.(name) ?? false;
                },
                getAxis: (name: string) => {
                    if (!has('input.read')) deny('input.read', 'read player input');
                    return this.host.getAxis?.(name) ?? 0;
                },
            },
            scripts: {
                registerBehaviour: (name: string, fn: BehaviourFn) => {
                    if (!has('scripts.register')) deny('scripts.register', 'add a script behaviour');
                    if (typeof fn !== 'function') {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to add a script behaviour called "${name}" without a function.`,
                        );
                    }
                    record.behaviours.set(name, fn);
                },
            },
            ui: {
                registerPanel: (def: PanelDefinition) => {
                    if (phase !== 'activate') {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to add a panel outside its activate() hook.`,
                        );
                    }
                    if (!has('ui.panels')) deny('ui.panels', 'add an editor panel');
                    if (!manifest.contributes.panels.some((p) => p.id === def.id)) {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to add a panel called "${def.id}" that it never declared. ` +
                            'Declare it in "contributes.panels" in glixext.json first.',
                        );
                    }
                    if (record.panels.includes(def.id)) {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to add the panel "${def.id}" twice.`,
                        );
                    }
                    record.panels.push(def.id);
                },
                addMenuItem: (def: MenuItemDefinition) => {
                    if (!has('ui.menus')) deny('ui.menus', 'add a menu item');
                    if (record.menuItems.includes(def.id)) {
                        throw new ExtensionLoadError(
                            `The extension "${manifest.name}" tried to add the menu item "${def.id}" twice.`,
                        );
                    }
                    record.menuItems.push(def.id);
                },
            },
            log: {
                info: (msg: string) => console.log(`[ext:${extId}]`, msg),
                warn: (msg: string) => console.warn(`[ext:${extId}]`, msg),
                error: (msg: string) => console.error(`[ext:${extId}]`, msg),
            },
        };
        return ctx;
    }

    private registerComponent(
        record: LoadedExtensionRecord,
        type: string,
        defaults: Record<string, unknown>,
    ): void {
        if (typeof type !== 'string' || type.trim() === '') {
            throw new ExtensionLoadError(
                `The extension "${record.manifest.name}" tried to add a component without a name.`,
            );
        }
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(type)) {
            throw new ExtensionLoadError(
                `The extension "${record.manifest.name}" tried to add a component called "${type}". ` +
                'Component names must start with a letter and contain only letters, numbers and underscores.',
            );
        }
        const registry = ComponentRegistry as unknown as Record<string, unknown>;
        if (type in registry && !record.components.includes(type)) {
            throw new ExtensionLoadError(
                `The extension "${record.manifest.name}" could not add a component called "${type}" because that name is already taken.`,
            );
        }
        if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
            throw new ExtensionLoadError(
                `The extension "${record.manifest.name}" tried to add a component called "${type}" without default values.`,
            );
        }
        // A JSON-Schema-shaped object ({ type: 'object', properties: {…} })
        // contributes its per-property defaults instead.
        const resolved = resolveComponentDefaults(defaults);
        registry[type] = JSON.parse(JSON.stringify(resolved));
        if (!record.components.includes(type)) record.components.push(type);
    }

    private getExtensionAsset(record: LoadedExtensionRecord, id: string): Blob {
        const prefix = `ext://${record.manifest.id}/`;
        if (!id.startsWith(prefix)) {
            throw new ExtensionLoadError(
                `The extension "${record.manifest.name}" tried to read asset "${id}". ` +
                `An extension can only read its own assets (starting with "${prefix}").`,
            );
        }
        const path = `assets/${id.slice(prefix.length)}`;
        const content = record.files[path] ?? record.importedAssets.get(id);
        if (content === undefined) {
            throw new ExtensionLoadError(
                `The extension "${record.manifest.name}" tried to read asset "${id}", which does not exist in its package.`,
            );
        }
        // Zip installs keep asset bytes binary; in-memory installs pass text.
        return new Blob([content as unknown as BlobPart]);
    }

    private listExtensionAssets(record: LoadedExtensionRecord): AssetRef[] {
        const refs: AssetRef[] = [];
        for (const path of Object.keys(record.files)) {
            if (path.startsWith('assets/')) {
                const rel = path.slice('assets/'.length);
                refs.push({ id: `ext://${record.manifest.id}/${rel}`, name: rel });
            }
        }
        for (const id of record.importedAssets.keys()) {
            refs.push({ id, name: id.split('/').pop() ?? id });
        }
        return refs;
    }

    /** Removes everything a record registered. Entity component data is
     * deliberately NOT deleted — it stays inert and is restorable on
     * reinstall (spec §6). */
    private teardown(record: LoadedExtensionRecord): void {
        const registry = ComponentRegistry as unknown as Record<string, unknown>;
        for (const type of record.components) {
            delete registry[type];
        }
        record.components = [];
        record.eventForwarders.clear();

        for (const id of record.systems) {
            try {
                this.host.unregisterPluginSystem(id);
            } catch (err) {
                console.warn(`[ext:${record.manifest.id}] Could not unregister system "${id}":`, err);
            }
        }
        record.systems = [];
        record.panels = [];
        record.menuItems = [];
        record.behaviours.clear();
        record.listeners = [];
    }
}

/** `eval(` / `new Function(` are statically rejected at install
 * (PLUGIN_SPEC.md §4, defence in depth — the Worker boundary is the
 * real enforcement). */
function assertNoForbiddenCode(code: string, extName: string): void {
    if (/\beval\s*\(/.test(code)) {
        throw new ExtensionLoadError(
            `The extension "${extName}" could not be loaded: its code uses eval(), which extensions are not allowed to use.`,
        );
    }
    if (/\bnew\s+Function\s*\(/.test(code)) {
        throw new ExtensionLoadError(
            `The extension "${extName}" could not be loaded: its code uses new Function(), which extensions are not allowed to use.`,
        );
    }
}

/** Extracts default values from a JSON-Schema-shaped object, or returns
 * a plain defaults object unchanged. */
function resolveComponentDefaults(defaults: Record<string, unknown>): Record<string, unknown> {
    const maybeSchema = defaults as { type?: unknown; properties?: unknown };
    if (
        maybeSchema.type === 'object' &&
        typeof maybeSchema.properties === 'object' &&
        maybeSchema.properties !== null
    ) {
        const out: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(maybeSchema.properties as Record<string, unknown>)) {
            if (typeof prop === 'object' && prop !== null && 'default' in (prop as Record<string, unknown>)) {
                out[key] = (prop as Record<string, unknown>).default;
            }
        }
        return out;
    }
    return defaults;
}

function hashString(text: string): string {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
}

/** Glob match for allowlist entries (`*` matches any run of characters). */
function globMatches(pattern: string, value: string): boolean {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(value);
}

/** `engine:*` / `scene:*` / `plugin:<id>:*` patterns. */
function patternMatches(pattern: string, event: string): boolean {
    return globMatches(pattern, event);
}

/**
 * Runs extension entrypoint code in the prototype sandbox and returns its
 * default export. The spec's entrypoint is an ES module with a single
 * default export; this in-process loader shims that by rewriting
 * `export default <expr>` to `return <expr>` (a real Worker-based loader
 * would use a genuine module import). Top-level `import` statements are
 * rejected — extension code must be bundled into `main.js`.
 */
/** Reads a text file from a package (string passthrough, UTF-8 decode
 * for zip bytes). Returns `null` when the file is absent. */
function fileAsText(
    files: Record<string, PackageFileValue>,
    name: string,
    _extName: string,
): string | null {
    const value = files[name];
    if (value === undefined) return null;
    return typeof value === 'string' ? value : new TextDecoder('utf-8').decode(value);
}

/** Top-level imports have no base to resolve against (Worker data: URL
 * import, in-process loader), so they are rejected up front in both. */
function assertNoImportStatement(code: string, extName: string): void {
    if (/^\s*import\s/m.test(code)) {
        throw new ExtensionLoadError(
            `The extension "${extName}" could not be loaded: its code uses an import statement. ` +
            'Bundle all of the extension\u2019s code into main.js — imports are not supported.',
        );
    }
}

/** Drops trailing periods so wrapped messages don't end in ".." (inner
 * messages already end with one; the wrapper adds its own). */
function stripTrailingPeriod(message: string): string {
    return message.replace(/\.+$/, '');
}

/** Chunked base64 encode (works in browsers and Node; no Buffer needed). */
function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

/**
 * Runs extension entrypoint code in the PROTOTYPE-GRADE in-process
 * sandbox (fallback only — see the file header). The Worker path is the
 * real sandbox; this stays for environments without Workers and for
 * tests that force it. It stops accidents, not hostile code.
 */
function runExtensionModule(code: string, ctx: PluginContext): unknown {
    if (/^\s*import\s/m.test(code)) {
        throw new ExtensionLoadError(
            'Extension code uses an import statement. Bundle all of the extension\u2019s code into main.js — imports are not supported.',
        );
    }
    const transformed = code.replace(/export\s+default\s+/, 'return ');
    // The wrapper runs sloppy on purpose: `eval` is shadowed as a
    // parameter, which strict mode forbids as a binding name. A leading
    // 'use strict' directive in the extension code would re-enable strict
    // mode for the whole wrapper and break that shadowing, so it is
    // stripped (the scan in assertNoForbiddenCode already rejects eval()
    // calls; the shadowing is defence in depth).
    const sandbox: Record<string, unknown> = {
        ctx,
        console,
        Math,
        JSON,
        Promise,
        Error,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        RegExp,
        Map,
        Set,
        Symbol,
        Blob,
        // Blocked globals — shadowed so extension code cannot reach them.
        window: undefined,
        document: undefined,
        fetch: undefined,
        XMLHttpRequest: undefined,
        WebSocket: undefined,
        localStorage: undefined,
        sessionStorage: undefined,
        globalThis: undefined,
        process: undefined,
        require: undefined,
        module: undefined,
        exports: undefined,
        eval: undefined,
        Function: undefined,
    };
    const keys = Object.keys(sandbox);
    const values = keys.map((k) => sandbox[k]);
    const body = transformed.replace(/^\s*(['"])use strict\1;?\s*/, '');
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, body);
    return fn(...values);
}
