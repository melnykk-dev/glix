/**
 * Manifest format for a `.glixext` extension package — PLUGIN_SPEC.md §2.
 *
 * A package is a ZIP archive (`.glixext`) containing at least:
 *   - `glixext.json` — validated by {@link parseManifest}
 *   - the runtime entrypoint named in `main` (ES module, single default export)
 *
 * The manifest is the extension's contract with the engine: it declares
 * what the extension is and what it is allowed to do. Anything not listed
 * in `permissions` is not available to the extension at runtime.
 *
 * This replaces the v1 prototype manifest (`manifest.json` with flat
 * `name`/`version`/`entrypoint`/`permissions`); a v1-style manifest is
 * rejected with a plain-language error.
 */

/** The engine version this runtime reports. Extensions whose
 * `engineVersion` range does not include it are refused before any of
 * their code runs (PLUGIN_SPEC.md §2). Matches the v2 engine line in
 * PROJECT_FORMAT_v2.md. */
export const ENGINE_VERSION = '2.0.0';

/** The only manifest format version the loader accepts. */
export const GLIXEXT_FORMAT_VERSION = '1.0.0';

export type ExtensionPermission =
    | 'systems.register'
    | 'components.register'
    | 'assets.read'
    | 'assets.write'
    | 'storage.local'
    | 'network.fetch'
    | 'ui.panels'
    | 'ui.menus'
    | 'events.emit'
    | 'events.listen'
    | 'input.read'
    | 'scripts.register';

/** Every permission Glix recognises (PLUGIN_SPEC.md §3). A manifest asking
 * for anything else — including the v1 flat names (`components`,
 * `systems`, `storage`, `network`, `editorPanels`) — is rejected. */
export const ALLOWED_PERMISSIONS: readonly ExtensionPermission[] = [
    'systems.register',
    'components.register',
    'assets.read',
    'assets.write',
    'storage.local',
    'network.fetch',
    'ui.panels',
    'ui.menus',
    'events.emit',
    'events.listen',
    'input.read',
    'scripts.register',
];

/** Plain-language description of each permission, shown on the install
 * grant screen (PLUGIN_SPEC.md §3, §6). */
export const PERMISSION_DESCRIPTIONS: Record<ExtensionPermission, string> = {
    'systems.register': 'Add game systems that run every fixed step.',
    'components.register': 'Add new component types to the project.',
    'assets.read': 'Read the project\u2019s assets (read-only).',
    'assets.write': 'Import new assets into the project.',
    'storage.local': 'Store small settings of its own (up to 1 MB).',
    'network.fetch': 'Fetch data from the web addresses listed in the manifest.',
    'ui.panels': 'Add a dockable panel to the editor.',
    'ui.menus': 'Add items to the editor menus.',
    'events.emit': 'Send events other extensions can listen to.',
    'events.listen': 'Listen to engine, scene and input events.',
    'input.read': 'Read player input (actions and axes, read-only).',
    'scripts.register': 'Add script behaviours the ScriptSystem can run.',
};

import type { SystemPhase } from './PluginContext';

export interface ContributedSystem {
    id: string;
    phase: SystemPhase;
}

export interface ContributedComponent {
    type: string;
    /** JSON Schema describing the component's data. */
    schema: unknown;
}

export interface ContributedPanel {
    id: string;
    title: string;
}

export interface GlixExtManifest {
    formatVersion: '1.0.0';
    /** Reverse-DNS, unique, immutable — changing it makes a different extension. */
    id: string;
    name: string;
    /** Semver. The editor refuses downgrades unless the user confirms. */
    version: string;
    /** Semver range the extension supports, e.g. "^2.0.0". */
    engineVersion: string;
    author?: string;
    description?: string;
    license?: string;
    homepage?: string;
    /** Runtime entrypoint (required), relative to the package root. */
    main: string;
    /** Editor entrypoint (optional), relative to the package root. */
    editor?: string;
    /** Requested capabilities (PLUGIN_SPEC.md §3). The user grants these
     * at install time; only granted permissions are usable. */
    permissions: ExtensionPermission[];
    /** Required iff `network.fetch` is requested. */
    network?: { allowlist: string[] };
    /** Declared contributions — the loader cross-checks these against what
     * the code actually registers. Undeclared registration is rejected;
     * declared-but-missing contributions warn. */
    contributes: {
        systems: ContributedSystem[];
        components: ContributedComponent[];
        panels: ContributedPanel[];
    };
    dependencies?: Array<{ id: string; version: string }>;
}

/** Error type for anything wrong with an extension package. Messages are written for the person installing the extension, not for a developer. */
export class ExtensionLoadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExtensionLoadError';
    }
}

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/** Compares two `x.y.z` versions. Returns <0, 0, or >0. */
export function compareSemver(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
}

function parseSemver(v: string): [number, number, number] | null {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Minimal semver-range check: `*`, `x`, exact `1.2.3`, `^1.2.3`, `~1.2.3`,
 * `>=1.2.3`, `>1.2.3`, `<=1.2.3`, `<1.2.3`, `=1.2.3`, space-separated AND
 * groups and `||` OR groups. Anything unparseable is treated as
 * "does not match" rather than crashing.
 */
export function satisfiesEngineVersion(range: string, version: string): boolean {
    const v = parseSemver(version);
    if (!v) return false;
    const trimmed = range.trim();
    if (trimmed === '*' || trimmed === 'x' || trimmed === 'X' || trimmed === '') return true;
    const orGroups = trimmed.split('||').map((g) => g.trim()).filter(Boolean);
    return orGroups.some((group) => {
        const parts = group.split(/\s+/).filter(Boolean);
        return parts.every((part) => satisfiesComparator(part, v));
    });
}

function satisfiesComparator(part: string, v: [number, number, number]): boolean {
    let op = '';
    let rest = part;
    for (const prefix of ['>=', '<=', '>', '<', '=', '^', '~']) {
        if (part.startsWith(prefix)) {
            op = prefix;
            rest = part.slice(prefix.length);
            break;
        }
    }
    if (rest === '*' || rest === 'x' || rest === 'X') return true;
    const target = parseSemver(rest);
    if (!target) return false;
    const cmp = compareSemver(
        `${v[0]}.${v[1]}.${v[2]}`,
        `${target[0]}.${target[1]}.${target[2]}`,
    );
    switch (op) {
        case '^':
            // ^1.2.3 := >=1.2.3 <2.0.0 ; ^0.2.3 := >=0.2.3 <0.3.0 ; ^0.0.3 := =0.0.3
            if (cmp < 0) return false;
            if (target[0] > 0) return v[0] === target[0];
            if (target[1] > 0) return v[0] === 0 && v[1] === target[1];
            return v[0] === 0 && v[1] === 0 && v[2] === target[2];
        case '~':
            // ~1.2.3 := >=1.2.3 <1.3.0
            return cmp >= 0 && v[0] === target[0] && v[1] === target[1];
        case '>=':
            return cmp >= 0;
        case '>':
            return cmp > 0;
        case '<=':
            return cmp <= 0;
        case '<':
            return cmp < 0;
        case '=':
        case '':
            return cmp === 0;
        default:
            return false;
    }
}

/** Throws a plain-language error if the range does not include the running engine version. */
export function checkEngineVersion(manifest: GlixExtManifest, engineVersion = ENGINE_VERSION): void {
    if (!satisfiesEngineVersion(manifest.engineVersion, engineVersion)) {
        throw new ExtensionLoadError(
            `The extension "${manifest.name}" needs engine version ${manifest.engineVersion}, ` +
            `but this engine is ${engineVersion}. Update Glix or install an older version of the extension.`,
        );
    }
}

/** A package-relative path must stay inside the package (zip-slip guard). */
export function assertPackagePath(value: string, field: string, extName: string): void {
    if (
        typeof value !== 'string' ||
        value.trim() === '' ||
        value.includes('..') ||
        value.startsWith('/') ||
        value.startsWith('\\') ||
        /^[a-zA-Z]:/.test(value)
    ) {
        throw new ExtensionLoadError(
            `The extension "${extName}" could not be loaded: its ${field} "${String(value)}" ` +
            'must be a file inside the extension package.',
        );
    }
}

function assertJsFile(value: string, field: string, extName: string): void {
    assertPackagePath(value, field, extName);
    if (!value.endsWith('.js') && !value.endsWith('.mjs')) {
        throw new ExtensionLoadError(
            `The extension "${extName}" could not be loaded: its ${field} "${value}" ` +
            'must be a JavaScript file ending in .js.',
        );
    }
}

export interface ParsedManifest {
    manifest: GlixExtManifest;
    /** Unknown fields were ignored (forward compat, PLUGIN_SPEC.md §1). */
    warnings: string[];
}

/**
 * Validates an unknown value as a `glixext.json` manifest.
 * @throws {ExtensionLoadError} with a plain-language message and the exact
 * field path on the first problem found. A bad manifest refuses install —
 * it never installs partially.
 */
export function parseManifestDetailed(value: unknown): ParsedManifest {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ExtensionLoadError(
            'This extension could not be loaded: its glixext.json is missing or is not a JSON object.',
        );
    }
    const m = value as Record<string, unknown>;
    const warnings: string[] = [];
    const known = new Set([
        'formatVersion', 'id', 'name', 'version', 'engineVersion', 'author',
        'description', 'license', 'homepage', 'main', 'editor', 'permissions',
        'network', 'contributes', 'dependencies',
    ]);
    for (const key of Object.keys(m)) {
        if (!known.has(key)) {
            warnings.push(`Unknown field "${key}" in glixext.json was ignored.`);
        }
    }

    const fail = (msg: string): ExtensionLoadError => new ExtensionLoadError(msg);

    if (m.formatVersion !== GLIXEXT_FORMAT_VERSION) {
        throw fail(
            'This extension could not be loaded: its glixext.json is missing a valid "formatVersion". ' +
            `It must be "${GLIXEXT_FORMAT_VERSION}".`,
        );
    }

    const id = m.id;
    if (typeof id !== 'string' || id.trim() === '') {
        throw fail(
            'This extension could not be loaded: its glixext.json is missing a valid "id". ' +
            'Use a reverse-DNS id, for example "com.example.tilemap-plus".',
        );
    }
    if (!ID_RE.test(id)) {
        throw fail(
            `This extension could not be loaded: the id "${id}" is not a reverse-DNS id. ` +
            'Use at least two dot-separated parts of lowercase letters, numbers and dashes, ' +
            'for example "com.example.tilemap-plus".',
        );
    }

    const name = m.name;
    if (typeof name !== 'string' || name.trim() === '') {
        throw fail(
            `The extension "${id}" could not be loaded: its glixext.json is missing a valid "name". ` +
            'Give the extension a short display name, for example "Tilemap Plus".',
        );
    }

    const version = m.version;
    if (typeof version !== 'string' || !SEMVER_RE.test(version)) {
        throw fail(
            `The extension "${name}" could not be loaded: its glixext.json is missing a valid "version". ` +
            'Use three numbers, for example "1.2.0".',
        );
    }

    const engineVersion = m.engineVersion;
    if (typeof engineVersion !== 'string' || engineVersion.trim() === '') {
        throw fail(
            `The extension "${name}" could not be loaded: its glixext.json is missing "engineVersion". ` +
            'Say which engine versions it supports, for example "^2.0.0".',
        );
    }

    const main = m.main;
    if (typeof main !== 'string' || main.trim() === '') {
        throw fail(
            `The extension "${name}" could not be loaded: its glixext.json is missing "main". ` +
            'This is the JavaScript file that runs when the extension loads, for example "main.js".',
        );
    }
    assertJsFile(main, '"main"', name);

    let editor: string | undefined;
    if (m.editor !== undefined) {
        if (typeof m.editor !== 'string' || m.editor.trim() === '') {
            throw fail(
                `The extension "${name}" could not be loaded: its glixext.json has an invalid "editor". ` +
                'It must be a JavaScript file inside the package, for example "editor.js".',
            );
        }
        assertJsFile(m.editor, '"editor"', name);
        editor = m.editor;
    }

    const permissions = m.permissions;
    if (!Array.isArray(permissions)) {
        throw fail(
            `The extension "${name}" could not be loaded: its glixext.json is missing "permissions". ` +
            'List what the extension is allowed to do, for example ["components.register"], ' +
            'or use an empty list [] if it needs nothing.',
        );
    }
    for (const permission of permissions) {
        if (typeof permission !== 'string' || !(ALLOWED_PERMISSIONS as readonly string[]).includes(permission)) {
            throw fail(
                `The extension "${name}" could not be loaded: it asks for permission "${String(permission)}", ` +
                `which Glix does not recognise. Allowed permissions are: ${ALLOWED_PERMISSIONS.join(', ')}.`,
            );
        }
    }
    const perms = [...(permissions as ExtensionPermission[])];

    let network: { allowlist: string[] } | undefined;
    if (perms.includes('network.fetch')) {
        const net = m.network;
        if (
            typeof net !== 'object' || net === null || Array.isArray(net) ||
            !Array.isArray((net as Record<string, unknown>).allowlist) ||
            ((net as Record<string, unknown>).allowlist as unknown[]).length === 0 ||
            !((net as Record<string, unknown>).allowlist as unknown[]).every((u) => typeof u === 'string' && u.length > 0)
        ) {
            throw fail(
                `The extension "${name}" could not be loaded: it asks for the "network.fetch" permission, ` +
                'so its glixext.json must list "network.allowlist" — the web addresses it may fetch, ' +
                'for example ["https://api.example.com/*"].',
            );
        }
        network = { allowlist: [...((net as Record<string, unknown>).allowlist as string[])] };
    } else if (m.network !== undefined) {
        warnings.push('"network" is listed in glixext.json but the extension does not request "network.fetch"; it was ignored.');
    }

    // contributes — a declaration, not a wish (PLUGIN_SPEC.md §2).
    const contributes = {
        systems: [] as ContributedSystem[],
        components: [] as ContributedComponent[],
        panels: [] as ContributedPanel[],
    };
    if (m.contributes !== undefined) {
        if (typeof m.contributes !== 'object' || m.contributes === null || Array.isArray(m.contributes)) {
            throw fail(
                `The extension "${name}" could not be loaded: "contributes" in glixext.json must be an object ` +
                'with "systems", "components" and "panels" lists.',
            );
        }
        const c = m.contributes as Record<string, unknown>;
        if (c.systems !== undefined) {
            if (!Array.isArray(c.systems)) throw fail(`The extension "${name}" could not be loaded: "contributes.systems" must be a list.`);
            c.systems.forEach((s, i) => {
                if (typeof s !== 'object' || s === null || Array.isArray(s)) {
                    throw fail(`The extension "${name}" could not be loaded: "contributes.systems[${i}]" must be an object with "id" and "phase".`);
                }
                const entry = s as Record<string, unknown>;
                if (typeof entry.id !== 'string' || entry.id.trim() === '') {
                    throw fail(`The extension "${name}" could not be loaded: "contributes.systems[${i}].id" is missing.`);
                }
                if (entry.phase !== 'fixed' && entry.phase !== 'render') {
                    throw fail(
                        `The extension "${name}" could not be loaded: "contributes.systems[${i}].phase" must be "fixed" or "render".`,
                    );
                }
                contributes.systems.push({ id: entry.id, phase: entry.phase });
            });
        }
        if (c.components !== undefined) {
            if (!Array.isArray(c.components)) throw fail(`The extension "${name}" could not be loaded: "contributes.components" must be a list.`);
            c.components.forEach((comp, i) => {
                if (typeof comp !== 'object' || comp === null || Array.isArray(comp)) {
                    throw fail(`The extension "${name}" could not be loaded: "contributes.components[${i}]" must be an object with "type" and "schema".`);
                }
                const entry = comp as Record<string, unknown>;
                if (typeof entry.type !== 'string' || entry.type.trim() === '') {
                    throw fail(`The extension "${name}" could not be loaded: "contributes.components[${i}].type" is missing.`);
                }
                contributes.components.push({ type: entry.type, schema: entry.schema });
            });
        }
        if (c.panels !== undefined) {
            if (!Array.isArray(c.panels)) throw fail(`The extension "${name}" could not be loaded: "contributes.panels" must be a list.`);
            c.panels.forEach((p, i) => {
                if (typeof p !== 'object' || p === null || Array.isArray(p)) {
                    throw fail(`The extension "${name}" could not be loaded: "contributes.panels[${i}]" must be an object with "id" and "title".`);
                }
                const entry = p as Record<string, unknown>;
                if (typeof entry.id !== 'string' || entry.id.trim() === '') {
                    throw fail(`The extension "${name}" could not be loaded: "contributes.panels[${i}].id" is missing.`);
                }
                if (typeof entry.title !== 'string' || entry.title.trim() === '') {
                    throw fail(`The extension "${name}" could not be loaded: "contributes.panels[${i}].title" is missing.`);
                }
                contributes.panels.push({ id: entry.id, title: entry.title });
            });
        }
    }

    let dependencies: Array<{ id: string; version: string }> | undefined;
    if (m.dependencies !== undefined) {
        if (!Array.isArray(m.dependencies)) {
            throw fail(`The extension "${name}" could not be loaded: "dependencies" in glixext.json must be a list.`);
        }
        dependencies = [];
        m.dependencies.forEach((d, i) => {
            if (typeof d !== 'object' || d === null || Array.isArray(d)) {
                throw fail(`The extension "${name}" could not be loaded: "dependencies[${i}]" must be an object with "id" and "version".`);
            }
            const entry = d as Record<string, unknown>;
            if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) {
                throw fail(`The extension "${name}" could not be loaded: "dependencies[${i}].id" must be a reverse-DNS id.`);
            }
            if (typeof entry.version !== 'string' || !SEMVER_RE.test(entry.version)) {
                throw fail(`The extension "${name}" could not be loaded: "dependencies[${i}].version" must be a version like "1.0.0".`);
            }
            dependencies!.push({ id: entry.id, version: entry.version });
        });
    }

    const manifest: GlixExtManifest = {
        formatVersion: GLIXEXT_FORMAT_VERSION,
        id,
        name,
        version,
        engineVersion,
        author: typeof m.author === 'string' ? m.author : undefined,
        description: typeof m.description === 'string' ? m.description : undefined,
        license: typeof m.license === 'string' ? m.license : undefined,
        homepage: typeof m.homepage === 'string' ? m.homepage : undefined,
        main,
        editor,
        permissions: perms,
        network,
        contributes,
        dependencies,
    };
    return { manifest, warnings };
}

/** Validates a manifest value, logging a warning for each unknown field. */
export function parseManifest(value: unknown): GlixExtManifest {
    const { manifest, warnings } = parseManifestDetailed(value);
    for (const w of warnings) console.warn(`[glixext] ${w}`);
    return manifest;
}

/** Parses manifest JSON text, turning a syntax error into a plain-language message. */
export function parseManifestJson(jsonText: string): GlixExtManifest {
    let value: unknown;
    try {
        value = JSON.parse(jsonText);
    } catch (err) {
        throw new ExtensionLoadError(
            `This extension could not be loaded: its glixext.json is not valid JSON (${(err as Error).message}).`,
        );
    }
    return parseManifest(value);
}
