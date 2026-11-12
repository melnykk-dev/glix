/**
 * What extension code actually receives — PLUGIN_SPEC.md §5.
 *
 * Extensions NEVER receive the raw `Engine` or the raw `World`. They get a
 * capability-scoped `PluginContext`, and their systems get a `WorldView`:
 * read access to components, plus mutation only for component types the
 * extension itself registered or that are whitelisted below. There is no
 * `createEntity` / `removeEntity` on a WorldView.
 */
import type { GlixExtManifest } from './ExtensionManifest';

export type SystemPhase = 'fixed' | 'render';

/**
 * A system contributed by an extension (PLUGIN_SPEC.md §5). `phase`
 * defaults to `'fixed'` at registration time if the manifest entry omits
 * it; fixed-phase systems run in the fixed step, render-phase systems run
 * in the render pass.
 */
export interface SystemDefinition {
    id: string;
    phase: SystemPhase;
    update(world: WorldView, dt: number): void;
    destroy?(): void;
}

export interface PanelDefinition {
    id: string;
    title: string;
}

export interface MenuItemDefinition {
    id: string;
    label: string;
}

export interface AssetRef {
    id: string;
    name: string;
}

export type BehaviourFn = (world: WorldView, dt: number) => void;

/**
 * The narrow world surface an extension system may touch. `getComponent`
 * returns a copy, so a system cannot mutate a component it is not allowed
 * to write by holding a reference; writes go through `setComponent`, which
 * enforces the ownership / whitelist rule.
 */
export interface WorldView {
    getEntitiesWithComponents(...types: string[]): string[];
    getComponent(entity: string, type: string): unknown;
    /**
     * Merges `patch` into the entity's component. Allowed only for
     * component types the extension registered itself, or whitelisted
     * types below; anything else throws.
     */
    setComponent(entity: string, type: string, patch: Record<string, unknown>): void;
    findEntityByName(name: string): string | undefined;
    getName(entity: string): string | undefined;
}

/** Minimal world surface the view wraps. The real `World` satisfies this
 * structurally (`addComponent` is its write path); test doubles may
 * provide `setComponent` instead. */
export interface WorldLike {
    getEntitiesWithComponents(...types: string[]): string[];
    getComponent(entity: string, type: string): unknown;
    addComponent?(entity: string, type: string, component: unknown): void;
    setComponent?(entity: string, type: string, patch: Record<string, unknown>): void;
    findEntityByName?(name: string): string | undefined;
    getName?(entity: string): string | undefined;
}

/**
 * Component types any extension system may write, even without registering
 * them (PLUGIN_SPEC.md §5). Everything else is writable only if the
 * extension registered that component type itself.
 */
export const WORLDVIEW_WRITABLE_COMPONENTS: readonly string[] = [
    'transform',
    'sprite',
    'sortingLayer',
    'frameAnimation',
];

export function isWorldViewWritable(type: string, ownComponentTypes: readonly string[]): boolean {
    return ownComponentTypes.includes(type) || WORLDVIEW_WRITABLE_COMPONENTS.includes(type);
}

/** Builds the read-mostly view over a real world for one extension. */
export function createWorldView(world: WorldLike, ownComponentTypes: readonly string[]): WorldView {
    return {
        getEntitiesWithComponents: (...types: string[]) => world.getEntitiesWithComponents(...types),
        getComponent: (entity: string, type: string) => {
            const value = world.getComponent(entity, type);
            return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
        },
        setComponent: (entity: string, type: string, patch: Record<string, unknown>) => {
            if (!isWorldViewWritable(type, ownComponentTypes)) {
                throw new Error(
                    `Extension systems may only change components they registered themselves ` +
                    `or whitelisted ones (${WORLDVIEW_WRITABLE_COMPONENTS.join(', ')}); ` +
                    `"${type}" is neither.`,
                );
            }
            if (typeof world.setComponent === 'function') {
                world.setComponent(entity, type, patch);
                return;
            }
            if (typeof world.addComponent === 'function') {
                const current = world.getComponent(entity, type);
                const base = current !== undefined && typeof current === 'object' && !Array.isArray(current)
                    ? (current as Record<string, unknown>)
                    : {};
                world.addComponent(entity, type, { ...base, ...patch });
                return;
            }
            throw new Error(`This world does not support writing component "${type}".`);
        },
        findEntityByName: (name: string) => world.findEntityByName?.(name),
        getName: (entity: string) => world.getName?.(entity),
    };
}

export interface PluginContext {
    readonly extId: string;
    readonly manifest: GlixExtManifest;
    systems: { register(def: SystemDefinition): void };
    components: {
        /**
         * Registers a new component type. `defaults` is the default value
         * object stored in the shared `ComponentRegistry`; a JSON-Schema-shaped
         * object (`{ type: 'object', properties: { ... } }`) is also accepted
         * and its per-property `default`s are used instead.
         */
        register(type: string, defaults: Record<string, unknown>): void;
    };
    assets: {
        get(id: string): Promise<Blob>;
        list(): AssetRef[];
        import(blob: Blob, name: string): Promise<string>;
    };
    storage: { get(key: string): unknown; set(key: string, value: unknown): void };
    network: { fetch(url: string, opts?: RequestInit): Promise<Response> };
    events: {
        on(pattern: string, cb: (payload: unknown) => void): () => void;
        emit(event: string, payload: unknown): void;
    };
    input: { getAction(name: string): boolean; getAxis(name: string): number };
    scripts: { registerBehaviour(name: string, fn: BehaviourFn): void };
    ui: { registerPanel(def: PanelDefinition): void; addMenuItem(def: MenuItemDefinition): void };
    log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
}
