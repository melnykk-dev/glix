import { Entity } from '@glix/shared';
import { World } from '../core/World';
import { ScriptComponent } from '../scripting/ScriptComponent';
import { ScriptSandbox } from '../scripting/ScriptSandbox';
import { InputManager } from '../input/InputManager';
import { PhysicsSystem } from './PhysicsSystem';
import { AudioManager } from '../assets/AudioManager';
import { EventBus } from '../core/EventBus';
import { SceneManager } from '../scene/SceneManager';

interface ScriptHandle {
    instance: ScriptComponent;
    compiledJs: string;
}

/** Error info emitted when a script throws. */
export interface ScriptError {
    entityId: Entity;
    message: string;
    stack?: string;
}

/**
 * Manages script instantiation, lifecycle calls, and hot reload.
 *
 * Flow:
 *  - init()     → instantiate all entity scripts, call onStart()
 *  - update()   → call onUpdate(dt) for each active script
 *  - destroy()  → call onDestroy() and discard instances
 *  - hot-reload → if compiledJs changed mid-play, reinitialise that entity
 */
export class ScriptSystem {
    private handles: Map<Entity, ScriptHandle> = new Map();
    private inputManager: InputManager;
    private physicsSystem: PhysicsSystem;
    private audioManager: AudioManager;
    private eventBus: EventBus;
    private sceneManager: SceneManager;
    private collisionUnsubscribers: Array<() => void> = [];

    /** Latest errors keyed by entity, consumed by the error overlay. */
    public errors: Map<Entity, ScriptError> = new Map();

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

    /**
     * Called when Play starts. Instantiates and starts all entity scripts.
     */
    init(world: World): void {
        this.errors.clear();
        const entities = world.getEntitiesWithComponents('script');
        for (const entity of entities) {
            this.startScript(entity, world);
        }

        // Wire collision events to onCollision / onCollisionExit
        const enterUnsub = this.eventBus.on('collisionEnter', (data: any) => {
            const { entityA, entityB, isSensor } = data;
            this.dispatchCollision('onCollision', entityA, entityB);
            this.dispatchCollision('onCollision', entityB, entityA);
            if (isSensor) {
                // sensors fire onTriggerEnter too (same as onCollision for now)
            }
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
            const err = e as Error;
            this.errors.set(self, { entityId: self, message: err.message, stack: err.stack });
        }
    }

    /**
     * Called every fixed-timestep tick.
     */
    update(world: World, dt: number): void {
        // Hot-reload: detect compiledJs changes for entities already running
        const entities = world.getEntitiesWithComponents('script');
        for (const entity of entities) {
            const scriptComp = world.getComponent(entity, 'script');
            if (!scriptComp) continue;

            const handle = this.handles.get(entity);
            if (!handle) {
                // New entity added after Play started
                this.startScript(entity, world);
            } else if (handle.compiledJs !== scriptComp.compiledJs && scriptComp.compiledJs) {
                // Hot reload
                this.destroyScript(entity);
                this.startScript(entity, world);
            }
        }

        // Call onUpdate for all active scripts
        for (const [entity, handle] of this.handles) {
            // Skip if entity no longer exists
            if (!world.getComponent(entity, 'script')) continue;

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
                const err = e as Error;
                this.errors.set(entity, {
                    entityId: entity,
                    message: err.message,
                    stack: err.stack,
                });
                console.error(`[ScriptSystem] onUpdate error on ${entity}:`, err);
            }
        }
    }

    /**
     * Called when Play stops. Destroys all script instances.
     */
    destroy(): void {
        for (const entity of this.handles.keys()) {
            this.destroyScript(entity);
        }
        this.handles.clear();
        this.errors.clear();

        // Unsubscribe from physics events
        for (const unsub of this.collisionUnsubscribers) unsub();
        this.collisionUnsubscribers = [];
    }

    /** Snapshot current errors for the error overlay. */
    getErrors(): ScriptError[] {
        return Array.from(this.errors.values());
    }

    private startScript(entity: Entity, world: World): void {
        const scriptComp = world.getComponent(entity, 'script');
        if (!scriptComp || !scriptComp.compiledJs) return;

        try {
            const instance = ScriptSandbox.instantiate(scriptComp.compiledJs);

            // Inject context
            instance.entity = entity;
            instance.world = world;
            instance.input = this.inputManager;
            instance.physics = this.physicsSystem;
            instance.audio = this.audioManager;
            instance.eventBus = this.eventBus;
            instance.sceneManager = this.sceneManager;

            instance.onStart();

            this.handles.set(entity, {
                instance,
                compiledJs: scriptComp.compiledJs,
            });

            // Clear previous errors for this entity on successful start
            this.errors.delete(entity);
        } catch (e) {
            const err = e as Error;
            this.errors.set(entity, {
                entityId: entity,
                message: err.message,
                stack: err.stack,
            });
            console.error(`[ScriptSystem] Error starting script on ${entity}:`, err);
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
