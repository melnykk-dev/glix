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

    /** Called every fixed-timestep tick while the engine is running. */
    onUpdate(_dt: number): void { }

    /** Called when the script instance is about to be discarded. */
    onDestroy(): void { }
}
