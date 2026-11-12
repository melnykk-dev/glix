/**
 * Autoloads / singletons, Godot-style (GODOT_PARITY.md item 46, was MISSING).
 *
 * A named autoload loads before the first scene and survives scene changes:
 *   - plain data autoload: `register('GameState', { data: { score: 0 } })`
 *     — any script reads it with `engine.getAutoloadManager().get('GameState')`.
 *   - script autoload: `registerScript('Music', src)` — a persistent entity
 *     (`autoload:Music`, `persistent` + `script` components) that
 *     SceneManager.unloadScene() keeps on every scene change, and
 *     ScriptSystem picks up on the next fixed step (it scans 'script'
 *     entities every update, and on Engine.start()/resume() via init).
 *   - behaviour autoload: `register('Timer', { update(dt, ctx) { ... } })`
 *     — update() runs every fixed step, before the script system.
 *
 * Engine wiring: constructed in the Engine constructor, `init(world)` runs
 * in start()/resume() BEFORE scriptSystem.init() (so autoload script
 * entities exist before scripts compile), `update(world, dt)` runs in the
 * fixed step before the script system. One bad autoload update is logged,
 * never fatal to the game loop (same guard as plugin systems).
 */
import type { World } from './World';
import type { Entity } from '@glix/shared';

export interface AutoloadContext {
    world: World;
    /** The autoload's own data object (or undefined for script-only autoloads). */
    get: (name: string) => Record<string, unknown> | undefined;
    list: () => string[];
}

export interface AutoloadDef {
    /** Shared mutable state other scripts read via get(name). */
    data?: Record<string, unknown>;
    /** Source of a script to run on the autoload's persistent entity. */
    scriptSrc?: string;
    /** Called once, the first time init() runs after registration. */
    onReady?: (ctx: AutoloadContext) => void;
    /** Called every fixed step, before the script system. */
    update?: (dt: number, ctx: AutoloadContext) => void;
}

interface AutoloadEntry {
    name: string;
    def: AutoloadDef;
    entity: Entity | null;
    ready: boolean;
}

export class AutoloadManager {
    private entries = new Map<string, AutoloadEntry>();
    private world: World | null = null;

    private validateName(name: string): void {
        if (!name || typeof name !== 'string' || name.trim() === '') {
            throw new Error('Autoload needs a non-empty name.');
        }
    }

    /**
     * Register a named autoload. Throws a plain-language error on a duplicate
     * name or an empty definition (no data, script, or callbacks).
     */
    register(name: string, def: AutoloadDef): void {
        this.validateName(name);
        if (this.entries.has(name)) {
            throw new Error(`Autoload "${name}" is already registered. Use a different name or unregister it first.`);
        }
        if (!def || (!def.data && !def.scriptSrc && !def.onReady && !def.update)) {
            throw new Error(`Autoload "${name}" has nothing in it — give it data, a script, onReady, or update.`);
        }
        this.entries.set(name, { name, def, entity: null, ready: false });
        // If the engine is already running, materialise immediately so the
        // autoload is usable without waiting for the next start().
        if (this.world) this.materialise(this.entries.get(name)!, this.world);
    }

    /** Shorthand: register a script autoload (persistent entity + script). */
    registerScript(name: string, scriptSrc: string, data?: Record<string, unknown>): void {
        if (!scriptSrc || typeof scriptSrc !== 'string' || scriptSrc.trim() === '') {
            throw new Error(`Autoload "${name}" needs non-empty script source.`);
        }
        this.register(name, { data, scriptSrc });
    }

    /** The autoload's data object, or undefined when unknown / data-less. */
    get(name: string): Record<string, unknown> | undefined {
        return this.entries.get(name)?.def.data;
    }

    /** The persistent entity id for a script autoload, or null. */
    getEntity(name: string): Entity | null {
        return this.entries.get(name)?.entity ?? null;
    }

    has(name: string): boolean {
        return this.entries.has(name);
    }

    list(): string[] {
        return [...this.entries.keys()];
    }

    /**
     * Remove an autoload. Its persistent entity (if any) is removed from
     * the world, so it stops running and does not survive the next scene.
     */
    unregister(name: string): boolean {
        const entry = this.entries.get(name);
        if (!entry) return false;
        if (entry.entity && this.world?.hasEntity(entry.entity)) {
            this.world.removeEntity(entry.entity);
        }
        this.entries.delete(name);
        return true;
    }

    /**
     * Materialise all registered autoloads into the world. Idempotent:
     * entries already ready are skipped. Called by Engine.start()/resume()
     * before scriptSystem.init(), so autoload scripts exist before any
     * scene script compiles.
     */
    init(world: World): void {
        this.world = world;
        for (const entry of this.entries.values()) {
            this.materialise(entry, world);
        }
    }

    /** Run every behaviour autoload's update(dt, ctx). Guarded per autoload. */
    update(world: World, dt: number): void {
        this.world = world;
        for (const entry of this.entries.values()) {
            if (!entry.def.update) continue;
            try {
                entry.def.update(dt, this.context(world));
            } catch (err) {
                console.error(`[Glix] Autoload "${entry.name}" update() failed:`, err);
            }
        }
    }

    private materialise(entry: AutoloadEntry, world: World): void {
        if (entry.ready) return;
        if (entry.def.scriptSrc) {
            const entity = world.createEntity();
            world.setName(entity, `autoload:${entry.name}`);
            // `persistent` is what SceneManager.unloadScene() checks: this
            // entity survives every scene change.
            world.addComponent(entity, 'persistent', {});
            world.addComponent(entity, 'script', { src: entry.def.scriptSrc, compiledJs: '' });
            entry.entity = entity;
        }
        entry.ready = true;
        if (entry.def.onReady) {
            try {
                entry.def.onReady(this.context(world));
            } catch (err) {
                console.error(`[Glix] Autoload "${entry.name}" onReady() failed:`, err);
            }
        }
    }

    private context(world: World): AutoloadContext {
        return {
            world,
            get: (name: string) => this.get(name),
            list: () => this.list(),
        };
    }
}
