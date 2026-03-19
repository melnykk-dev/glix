import { Entity } from '@glix/shared';
import { World } from '../core/World';
import { InputManager } from '../input/InputManager';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { AudioManager } from '../assets/AudioManager';
import { EventBus } from '../core/EventBus';
import { SceneManager } from '../scene/SceneManager';

/**
 * Base class that user scripts must extend.
 *
 * @example
 * class MyScript extends ScriptComponent {
 *   onStart() { console.log('start', this.entity); }
 *   onUpdate(dt: number) { }
 *   onDestroy() { }
 * }
 */
export abstract class ScriptComponent {
    /** The entity ID this script is attached to. */
    entity!: Entity;

    /** Read-only access to the ECS world. */
    world!: Readonly<World>;

    /** Keyboard / mouse / gamepad input. */
    input!: InputManager;

    /** Physics system handle (apply forces, query bodies, etc.). */
    physics!: PhysicsSystem;

    /** Web Audio API wrapper. */
    audio!: AudioManager;

    /** Engine event bus for global events. */
    eventBus!: EventBus;

    /** Scene manager for changing scenes. */
    sceneManager!: SceneManager;

    /** Called once, after the engine enters Play mode for this entity. */
    onStart(): void { }

    /** @internal - Injected by ScriptSystem */
    __init(entity: Entity, world: World, input: InputManager, physics: PhysicsSystem, audio: AudioManager, eventBus: EventBus, sceneManager: SceneManager): void {
        this.entity = entity;
        this.world = world;
        this.input = input;
        this.physics = physics;
        this.audio = audio;
        this.eventBus = eventBus;
        this.sceneManager = sceneManager;
    }

    /** Called every fixed-timestep tick while the engine is running. */
    onUpdate(_dt: number): void { }

    /** Called when this script's collider begins touching another entity. */
    onCollision(_other: Entity): void { }

    /** Called when this script's collider stops touching another entity. */
    onCollisionExit(_other: Entity): void { }

    /** Called when the script instance is about to be discarded. */
    onDestroy(): void { }

    // ── Physics helpers ───────────────────────────────────────────────────────

    setVelocity(x: number, y: number): void {
        this.physics.setVelocity(this.entity, x, y);
    }

    applyForce(x: number, y: number): void {
        this.physics.applyForce(this.entity, x, y);
    }

    /** Returns the current linear velocity of this entity's physics body. */
    getVelocity(): { x: number; y: number } {
        return this.physics.getVelocity(this.entity);
    }

    /**
     * Returns true if the entity has a physics body that is resting on
     * something below it (velocity.y ≈ 0 and a contact directly below).
     */
    isGrounded(): boolean {
        return this.physics.isGrounded(this.entity);
    }

    // ── Transform helpers ─────────────────────────────────────────────────────

    /** Returns the current world position of this entity. */
    getPosition(): { x: number; y: number } {
        const t = (this.world as World).getComponent(this.entity, 'transform');
        return t ? { x: t.x, y: t.y } : { x: 0, y: 0 };
    }

    /** Teleport entity to a world position (also moves the physics body). */
    setPosition(x: number, y: number): void {
        const t = (this.world as World).getComponent(this.entity, 'transform');
        if (t) {
            t.x = x;
            t.y = y;
        }
        this.physics.teleport(this.entity, x, y);
    }

    getRotation(): number {
        const t = (this.world as World).getComponent(this.entity, 'transform');
        return t ? t.rotation : 0;
    }

    setRotation(radians: number): void {
        const t = (this.world as World).getComponent(this.entity, 'transform');
        if (t) t.rotation = radians;
    }

    // ── World helpers ─────────────────────────────────────────────────────────

    /** Destroy this entity. */
    destroy(): void {
        (this.world as World).removeEntity(this.entity);
    }

    /** Destroy any entity by ID. */
    destroyEntity(entityId: Entity): void {
        (this.world as World).removeEntity(entityId);
    }

    /** Get a component from any entity. */
    getComponent<T = any>(entityId: Entity, type: string): T | undefined {
        return (this.world as World).getComponent(entityId, type as any) as T | undefined;
    }

    /** Add a component to any entity. */
    addComponent(entityId: Entity, type: string, data: any): void {
        (this.world as World).addComponent(entityId, type as any, data);
    }

    get transform(): any {
        return (this.world as World).getComponent(this.entity, 'transform');
    }

    get name(): string {
        return (this.world as World).getName(this.entity) || '';
    }
}
