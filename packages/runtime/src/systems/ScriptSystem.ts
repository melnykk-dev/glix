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

    /** Clear all script errors - useful when resuming play to prevent stale errors. */
    clearErrors(): void {
        this.errors.clear();
    }

    /** Get the number of active script instances. */
    getActiveScriptCount(): number {
        return this.handles.size;
    }

    /** Get script instance for debugging purposes. */
    getScriptInstance(entityId: Entity): any {
        const handle = this.handles.get(entityId);
        return handle ? handle.instance : null;
    }

    /** Force reload all scripts - useful for debugging. */
    forceReloadAll(world: World): void {
        console.log('[ScriptSystem] Force reloading all scripts');

        // Destroy all current instances
        for (const entity of this.handles.keys()) {
            this.destroyScript(entity);
        }
        this.handles.clear();
        this.errors.clear();

        // Reinitialize all scripts
        const entities = world.getEntitiesWithComponents('script');
        for (const entity of entities) {
            this.startScript(entity, world);
        }

        console.log(`[ScriptSystem] Force reloaded ${entities.length} scripts`);
    }

    /** Get detailed debugging information about scripts. */
    getDebugInfo(): any {
        const debug = {
            activeScripts: this.handles.size,
            errors: this.errors.size,
            collisionListeners: this.collisionUnsubscribers.length,
            scriptDetails: [] as any[]
        };

        for (const [entityId, handle] of this.handles) {
            debug.scriptDetails.push({
                entityId,
                hasOnStart: typeof handle.instance.onStart === 'function',
                hasOnUpdate: typeof handle.instance.onUpdate === 'function',
                hasOnDestroy: typeof handle.instance.onDestroy === 'function',
                hasOnCollision: typeof handle.instance.onCollision === 'function',
                hasOnCollisionExit: typeof handle.instance.onCollisionExit === 'function',
                compiledJsLength: handle.compiledJs.length
            });
        }

        return debug;
    }

    /** Execute a custom script method on all entities. */
    broadcastMethod(methodName: string, ...args: any[]): void {
        for (const [entityId, handle] of this.handles) {
            try {
                const inst = handle.instance as any;
                if (typeof inst[methodName] === 'function') {
                    inst[methodName](...args);
                }
            } catch (error) {
                console.error(`[ScriptSystem] Error broadcasting ${methodName} to ${entityId}:`, error);
                this.errors.set(entityId, {
                    entityId,
                    message: `Broadcast error in ${methodName}: ${error}`,
                    stack: (error as Error).stack
                });
            }
        }
    }

    /** Add a global script variable that will be injected into all script contexts. */
    setGlobalVariable(_name: string, _value: any): void {
        // This would require modifying the ScriptSandbox to accept globals
        console.warn('[ScriptSystem] setGlobalVariable not yet implemented');
    }

    /** Remove a global script variable. */
    removeGlobalVariable(_name: string): void {
        console.warn('[ScriptSystem] removeGlobalVariable not yet implemented');
    }

    /** Get all entities that have scripts. */
    getScriptedEntities(): Entity[] {
        return Array.from(this.handles.keys());
    }

    /** Check if an entity has an active script. */
    hasActiveScript(entityId: Entity): boolean {
        return this.handles.has(entityId);
    }

    /** Pause script execution for a specific entity. */
    pauseScript(entityId: Entity): void {
        const handle = this.handles.get(entityId);
        if (handle) {
            (handle as any).paused = true;
        }
    }

    /** Resume script execution for a specific entity. */
    resumeScript(entityId: Entity): void {
        const handle = this.handles.get(entityId);
        if (handle) {
            (handle as any).paused = false;
        }
    }

    /** Check if a script is paused. */
    isScriptPaused(entityId: Entity): boolean {
        const handle = this.handles.get(entityId);
        return handle ? (handle as any).paused === true : false;
    }

    /** Add a script event listener that scripts can subscribe to. */
    addScriptEvent(_eventName: string, _callback: Function): void {
        // This would integrate with the event bus
        console.warn('[ScriptSystem] addScriptEvent not yet implemented');
    }

    /** Remove a script event listener. */
    removeScriptEvent(_eventName: string, _callback: Function): void {
        console.warn('[ScriptSystem] removeScriptEvent not yet implemented');
    }

    /** Emit a custom event to all scripts. */
    emitScriptEvent(eventName: string, data?: any): void {
        this.broadcastMethod('onCustomEvent', eventName, data);
    }

    /** Get script execution statistics. */
    getExecutionStats(): any {
        return {
            totalScripts: this.handles.size,
            erroredScripts: this.errors.size,
            pausedScripts: Array.from(this.handles.values()).filter(h => (h as any).paused).length,
            averageScriptLength: this.handles.size > 0
                ? Array.from(this.handles.values()).reduce((sum, h) => sum + h.compiledJs.length, 0) / this.handles.size
                : 0
        };
    }

    /** Validate script syntax before compilation. */
    validateScriptSyntax(src: string): { valid: boolean, errors: string[] } {
        try {
            // Basic syntax check - this is simplistic, real validation would use TypeScript compiler API
            new Function(src);
            return { valid: true, errors: [] };
        } catch (error) {
            return { valid: false, errors: [(error as Error).message] };
        }
    }

    /** Get the source code for a script (if available). */
    getScriptSource(entityId: Entity, world: World): string | null {
        const scriptComp = world.getComponent(entityId, 'script');
        return scriptComp ? scriptComp.src : null;
    }

    /** Replace a script's source and recompile it. */
    async replaceScript(entityId: Entity, newSrc: string, compiledJs: string, world: World): Promise<boolean> {
        const scriptComp = world.getComponent(entityId, 'script');
        if (!scriptComp) return false;

        try {
            // Update the component
            scriptComp.src = newSrc;
            scriptComp.compiledJs = compiledJs;

            // Force reload the script instance
            this.destroyScript(entityId);
            this.startScript(entityId, world);

            console.log(`[ScriptSystem] Successfully replaced script for ${entityId}`);
            return true;

        } catch (error) {
            console.error(`[ScriptSystem] Failed to replace script for ${entityId}:`, error);
            this.errors.set(entityId, {
                entityId,
                message: `Script replacement failed: ${error}`,
                stack: (error as Error).stack
            });
            return false;
        }
    }

    /** Create a backup of all current script states. */
    createScriptBackup(): Map<Entity, any> {
        const backup = new Map<Entity, any>();

        for (const [entityId, handle] of this.handles) {
            backup.set(entityId, {
                compiledJs: handle.compiledJs,
                // Note: We can't serialize the actual instance, but we can store its state
                customData: {} // Scripts could implement a getState method
            });
        }

        return backup;
    }

    /** Restore scripts from a backup. */
    restoreScriptBackup(backup: Map<Entity, any>, world: World): void {
        console.log(`[ScriptSystem] Restoring script backup for ${backup.size} entities`);

        // Clear current scripts
        for (const entity of this.handles.keys()) {
            this.destroyScript(entity);
        }
        this.handles.clear();

        // Restore from backup
        for (const [entityId, backupData] of backup) {
            const scriptComp = world.getComponent(entityId, 'script');
            if (scriptComp) {
                scriptComp.compiledJs = backupData.compiledJs;
                this.startScript(entityId, world);
            }
        }

        console.log('[ScriptSystem] Script backup restored');
    }

    /** Get memory usage information for scripts. */
    getMemoryUsage(): any {
        // This is approximate - in a real implementation you'd use performance.memory
        return {
            scriptInstances: this.handles.size,
            errorCacheSize: this.errors.size,
            estimatedMemoryMB: (this.handles.size * 0.1) + (this.errors.size * 0.01) // Rough estimate
        };
    }

    /** Optimize script execution by batching updates. */
    enableBatchedUpdates(_enabled: boolean): void {
        // This would require restructuring the update loop
        console.warn('[ScriptSystem] enableBatchedUpdates not yet implemented');
    }

    /** Set the maximum execution time for scripts before they're considered hung. */
    setScriptTimeout(_timeoutMs: number): void {
        // This would require wrapping script calls in timeouts
        console.warn('[ScriptSystem] setScriptTimeout not yet implemented');
    }

    /** Profile script execution performance. */
    startProfiling(): void {
        // This would integrate with the profiler system
        console.warn('[ScriptSystem] startProfiling not yet implemented');
    }

    /** Stop profiling and get results. */
    stopProfiling(): any {
        console.warn('[ScriptSystem] stopProfiling not yet implemented');
        return {};
    }

    /** Get a list of all available script methods for a given entity. */
    getAvailableMethods(entityId: Entity): string[] {
        const instance = this.getScriptInstance(entityId);
        if (!instance) return [];

        return Object.getOwnPropertyNames(Object.getPrototypeOf(instance))
            .filter(name => typeof instance[name] === 'function' && name.startsWith('on'));
    }

    /** Call a specific method on a script instance. */
    callScriptMethod(entityId: Entity, methodName: string, ...args: any[]): any {
        const instance = this.getScriptInstance(entityId);
        if (!instance || typeof instance[methodName] !== 'function') {
            throw new Error(`Method ${methodName} not found on script for entity ${entityId}`);
        }

        try {
            return instance[methodName](...args);
        } catch (error) {
            console.error(`[ScriptSystem] Error calling ${methodName} on ${entityId}:`, error);
            this.errors.set(entityId, {
                entityId,
                message: `Method call error in ${methodName}: ${error}`,
                stack: (error as Error).stack
            });
            throw error;
        }
    }

    private startScript(entity: Entity, world: World): void {
        const scriptComp = world.getComponent(entity, 'script');
        if (!scriptComp || !scriptComp.compiledJs) return;

        try {
            const instance = ScriptSandbox.instantiate(scriptComp.compiledJs);

            // Inject context via formal init method for reliability
            if ((instance as any).__init) {
                (instance as any).__init(
                    entity,
                    world,
                    this.inputManager,
                    this.physicsSystem,
                    this.audioManager,
                    this.eventBus,
                    this.sceneManager
                );
            } else {
                // Fallback for older script instances or direct property access
                instance.entity = entity;
                instance.world = world;
                instance.input = this.inputManager;
                instance.physics = this.physicsSystem;
                instance.audio = this.audioManager;
                instance.eventBus = this.eventBus;
                instance.sceneManager = this.sceneManager;
            }

            // Add engine reference for isPlaying(), isPaused() methods
            (instance as any).engine = {
                isPlaying: () => true, // This should be passed from the Engine
                isPaused: () => false,
                getFPS: () => 60,
                getPlayDuration: () => 0
            };

            if (typeof instance.onStart === 'function') {
                instance.onStart();
            }

            this.handles.set(entity, {
                instance,
                compiledJs: scriptComp.compiledJs,
                paused: false
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
