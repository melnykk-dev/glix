import { Entity } from '@glix/shared';
import { World } from '../core/World';
import { ScriptComponent } from '../scripting/ScriptComponent';
import { ScriptSandbox } from '../scripting/ScriptSandbox';
import { InputManager } from '../input/InputManager';
import { PhysicsSystem } from './PhysicsSystem';
import { AudioManager } from '../assets/AudioManager';
import { EventBus } from '../core/EventBus';
import { SceneManager } from '../scene/SceneManager';
import { attachSaveBridge } from '../storage/SaveBridge';

interface ScriptHandle {
    instance: ScriptComponent;
    compiledJs: string;
    /** Exact code that was instantiated (compiledJs || src) — used to
     * detect edits and to know a failed script must not be retried. */
    code: string;
    paused: boolean;
}

export interface ScriptError {
    entityId: Entity;
    message: string;
    stack?: string;
}

export class ScriptSystem {
    private handles: Map<Entity, ScriptHandle> = new Map();
    private inputManager: InputManager;
    private physicsSystem: PhysicsSystem;
    private audioManager: AudioManager;
    private eventBus: EventBus;
    private sceneManager: SceneManager;
    private engine: any = null;
    private collisionUnsubscribers: Array<() => void> = [];
    /** Current world, kept for entity names in failure messages. */
    private world: World | null = null;

    public errors: Map<Entity, ScriptError> = new Map();

    /**
     * Scripts that threw and were disabled, keyed by entity to the exact
     * code that failed. A failed script is never retried while its code
     * is unchanged — without this, a broken script is re-started every
     * frame and floods the console (hundreds of identical errors).
     * Editing the script changes the code, which clears the block.
     */
    private failedScripts: Map<Entity, string> = new Map();

    constructor(
        inputManager: InputManager,
        physicsSystem: PhysicsSystem,
        audioManager: AudioManager,
        eventBus: EventBus,
        sceneManager: SceneManager
    ) {
        this.inputManager = inputManager;
        this.physicsSystem = physicsSystem;
        this.audioManager = audioManager;
        this.eventBus = eventBus;
        this.sceneManager = sceneManager;
    }

    setEngine(engine: any): void {
        this.engine = engine;
    }

    init(world: World): void {
        this.world = world;
        this.errors.clear();
        // Game-save bridge (Harvest Valley, Gate item 5): attach BEFORE any
        // script's onStart runs, so a game can request its save
        // (hv:load-request) and persist it (hv:save) through real browser
        // storage. Both hosts (editor Play mode, exported page) start
        // scripts through here, so one attach covers both. Safe across
        // stop/start cycles (re-attach unsubscribes first) and a no-op
        // without IndexedDB.
        if (this.engine) attachSaveBridge(this.engine, this.eventBus);
        // A fresh scene load retries scripts once; within the scene a
        // failed script stays failed until its code changes.
        this.failedScripts.clear();
        const entities = world.getEntitiesWithComponents('script');
        for (const entity of entities) {
            this.startScript(entity, world);
        }

        const enterUnsub = this.eventBus.on('collisionEnter', (data: any) => {
            const { entityA, entityB } = data;
            this.dispatchCollision('onCollision', entityA, entityB);
            this.dispatchCollision('onCollision', entityB, entityA);
        });

        const exitUnsub = this.eventBus.on('collisionExit', (data: any) => {
            const { entityA, entityB } = data;
            this.dispatchCollision('onCollisionExit', entityA, entityB);
            this.dispatchCollision('onCollisionExit', entityB, entityA);
        });

        this.collisionUnsubscribers.push(enterUnsub, exitUnsub);
    }

    private dispatchCollision(method: 'onCollision' | 'onCollisionExit', self: Entity, other: Entity): void {
        const handle = this.handles.get(self);
        if (!handle) return;
        try {
            (handle.instance as any)[method]?.(other);
        } catch (e) {
            // A throwing collision handler is disabled, not retried on
            // every later collision with the same entity.
            this.failScript(self, handle, e as Error, method);
        }
    }

    /**
     * Disable a script after a failure: log ONE plain-language error,
     * record it for getErrors(), remove the handle so update() stops
     * calling it, and remember the code so it is not re-started until
     * the code changes. Returns nothing; the game keeps running.
     */
    private failScript(entity: Entity, handle: ScriptHandle, err: Error, where: string): void {
        const label = this.world ? (this.world.getName(entity) ?? entity) : entity;
        this.errors.set(entity, {
            entityId: entity,
            message: err.message,
            stack: err.stack,
        });
        this.failedScripts.set(entity, handle.code);
        this.destroyScript(entity);
        console.error(
            `[Glix] Script on "${label}" failed during ${where} and has been disabled: ${err.message}. ` +
            `Fix the script and it will run again.`
        );
    }

    update(world: World, dt: number): void {
        const entities = world.getEntitiesWithComponents('script');
        for (const entity of entities) {
            const scriptComp = world.getComponent(entity, 'script');
            if (!scriptComp) continue;

            const code = scriptComp.compiledJs || scriptComp.src;
            const handle = this.handles.get(entity);
            if (!handle) {
                this.startScript(entity, world);
            } else if (handle.code !== code) {
                // Script edited: the old (possibly failed) code is gone,
                // so a previously disabled script gets one fresh attempt.
                this.failedScripts.delete(entity);
                this.destroyScript(entity);
                this.startScript(entity, world);
            }
        }

        for (const [entity, handle] of this.handles) {
            if (!world.getComponent(entity, 'script')) continue;
            if ((handle as any).paused) continue;

            try {
                const sm = world.getComponent(entity, 'stateMachine');
                if (sm && sm.currentState) {
                    const handlerName = sm.states[sm.currentState];
                    if (handlerName && typeof (handle.instance as any)[handlerName] === 'function') {
                        (handle.instance as any)[handlerName](dt);
                    }
                }

                handle.instance.onUpdate(dt);
            } catch (e) {
                // One failure disables the script — it must never throw
                // again next frame and flood the console.
                this.failScript(entity, handle, e as Error, 'onUpdate');
            }
        }
    }

    destroy(): void {
        for (const entity of this.handles.keys()) {
            this.destroyScript(entity);
        }
        this.handles.clear();
        this.errors.clear();
        this.failedScripts.clear();
        this.world = null;

        for (const unsub of this.collisionUnsubscribers) unsub();
        this.collisionUnsubscribers = [];
    }

    getErrors(): ScriptError[] {
        return Array.from(this.errors.values());
    }

    clearErrors(): void {
        this.errors.clear();
    }

    getActiveScriptCount(): number {
        return this.handles.size;
    }

    getScriptInstance(entityId: Entity): any {
        return this.handles.get(entityId)?.instance ?? null;
    }

    forceReloadAll(world: World): void {
        for (const entity of this.handles.keys()) {
            this.destroyScript(entity);
        }
        this.handles.clear();
        this.errors.clear();
        // Explicit reload: previously failed scripts get one fresh attempt.
        this.failedScripts.clear();

        const entities = world.getEntitiesWithComponents('script');
        for (const entity of entities) {
            this.startScript(entity, world);
        }
    }

    getDebugInfo(): any {
        return {
            activeScripts: this.handles.size,
            errors: this.errors.size,
        };
    }

    broadcastMethod(methodName: string, ...args: any[]): void {
        for (const [entityId, handle] of this.handles) {
            try {
                const inst = handle.instance as any;
                if (typeof inst[methodName] === 'function') inst[methodName](...args);
            } catch (error) {
                console.error(`[ScriptSystem] Error broadcasting ${methodName} to ${entityId}:`, error);
            }
        }
    }

    getScriptedEntities(): Entity[] {
        return Array.from(this.handles.keys());
    }

    hasActiveScript(entityId: Entity): boolean {
        return this.handles.has(entityId);
    }

    pauseScript(entityId: Entity): void {
        const handle = this.handles.get(entityId);
        if (handle) (handle as any).paused = true;
    }

    resumeScript(entityId: Entity): void {
        const handle = this.handles.get(entityId);
        if (handle) (handle as any).paused = false;
    }

    private startScript(entity: Entity, world: World): void {
        const scriptComp = world.getComponent(entity, 'script');
        if (!scriptComp) return;
        const code = scriptComp.compiledJs || scriptComp.src;
        if (!code) return;
        // Already failed with this exact code: do not retry (the update
        // loop runs every frame — retrying here is the console flood).
        if (this.failedScripts.get(entity) === code) return;

        try {
            const instance = ScriptSandbox.instantiate(code);

            if ((instance as any).__init) {
                (instance as any).__init(
                    entity,
                    world,
                    this.inputManager,
                    this.physicsSystem,
                    this.audioManager,
                    this.eventBus,
                    this.sceneManager,
                    this.engine
                );
            } else {
                instance.entity = entity;
                instance.world = world;
                instance.input = this.inputManager;
                instance.physics = this.physicsSystem;
                instance.audio = this.audioManager;
                instance.eventBus = this.eventBus;
                instance.sceneManager = this.sceneManager;
            }

            if (typeof instance.onStart === 'function') {
                instance.onStart();
            }

            this.handles.set(entity, {
                instance,
                compiledJs: scriptComp.compiledJs,
                code,
                paused: false
            });

            this.errors.delete(entity);
            this.failedScripts.delete(entity);
        } catch (e) {
            const err = e as Error;
            const label = world.getName(entity) ?? entity;
            this.errors.set(entity, {
                entityId: entity,
                message: err.message,
                stack: err.stack,
            });
            // Fail once: remember the code so the next frame does not
            // try (and log) the same broken script again.
            this.failedScripts.set(entity, code);
            console.error(
                `[Glix] Script on "${label}" failed to start and has been disabled: ${err.message}. ` +
                `Fix the script and it will run again.`
            );
        }
    }

    private destroyScript(entity: Entity): void {
        const handle = this.handles.get(entity);
        if (!handle) return;

        try {
            handle.instance.onDestroy();
        } catch (e) {
            console.error(`[ScriptSystem] Error in onDestroy on ${entity}:`, e);
        }

        this.handles.delete(entity);
    }
}
