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

    setEngine(engine: any): void {
        this.engine = engine;
    }

    init(world: World): void {
        this.errors.clear();
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
            const err = e as Error;
            this.errors.set(self, { entityId: self, message: err.message, stack: err.stack });
        }
    }

    update(world: World, dt: number): void {
        const entities = world.getEntitiesWithComponents('script');
        for (const entity of entities) {
            const scriptComp = world.getComponent(entity, 'script');
            if (!scriptComp) continue;

            const handle = this.handles.get(entity);
            if (!handle) {
                this.startScript(entity, world);
            } else if (handle.compiledJs !== scriptComp.compiledJs && scriptComp.compiledJs) {
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

    destroy(): void {
        for (const entity of this.handles.keys()) {
            this.destroyScript(entity);
        }
        this.handles.clear();
        this.errors.clear();

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
                paused: false
            });

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
