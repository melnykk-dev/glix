/**
 * Runtime type declarations surfaced in Monaco IntelliSense.
 *
 * These are generated-friendly strings that mirror the public subset of
 * packages/runtime that is accessible inside user scripts.
 *
 * They are loaded into Monaco as extra libs so autocomplete works for
 * the engine API (entity, world, input, physics, audio, etc.).
 */

/** TypeScript declarations string injected as a Monaco extra lib. */
export const ENGINE_TYPES_DTS = /* ts */ `
// ─── Glix Engine Type Declarations ────────────────────────────────────────────
// These types are automatically available inside Glix scripts.
// Do not import anything – all symbols are global.

declare type Entity = string;

// ── World ─────────────────────────────────────────────────────────────────────

declare interface TransformComponent {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

declare interface SpriteComponent {
  textureId: string;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  region?: string;
}

declare interface FrameAnimationComponent {
  atlasId: string;
  frames: string[];
  fps: number;
  loop: boolean;
  currentFrame: number;
  elapsed: number;
  isPlaying: boolean;
}

declare interface RigidBodyComponent {
  type: 'dynamic' | 'static' | 'kinematic';
  gravityScale: number;
  linearDamping: number;
  angularDamping: number;
  fixedRotation: boolean;
}

declare interface BoxColliderComponent {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  isSensor: boolean;
  restitution: number;
  friction: number;
}

declare interface CircleColliderComponent {
  radius: number;
  offsetX: number;
  offsetY: number;
  isSensor: boolean;
  restitution: number;
  friction: number;
}

declare type ComponentType =
  | 'transform'
  | 'sprite'
  | 'frameAnimation'
  | 'rigidBody'
  | 'boxCollider'
  | 'circleCollider'
  | 'script';

declare interface World {
  getComponent(entity: Entity, type: 'transform'): TransformComponent | undefined;
  getComponent(entity: Entity, type: 'sprite'): SpriteComponent | undefined;
  getComponent(entity: Entity, type: 'frameAnimation'): FrameAnimationComponent | undefined;
  getComponent(entity: Entity, type: 'rigidBody'): RigidBodyComponent | undefined;
  getComponent(entity: Entity, type: 'boxCollider'): BoxColliderComponent | undefined;
  getComponent(entity: Entity, type: 'circleCollider'): CircleColliderComponent | undefined;
  getEntitiesWithComponents(...types: ComponentType[]): Entity[];
}

// ── InputManager ──────────────────────────────────────────────────────────────

declare interface InputManager {
  isKeyDown(code: string): boolean;
  isJustPressed(code: string): boolean;
  isJustReleased(code: string): boolean;
  isMouseButtonDown(button: number): boolean;
  isMouseButtonJustPressed(button: number): boolean;
  getMousePosition(): { x: number; y: number };
}

// ── PhysicsSystem ─────────────────────────────────────────────────────────────

declare interface PhysicsSystem {
  getPlanckWorld(): any;
}

// ── AudioManager ──────────────────────────────────────────────────────────────

declare interface AudioManager {
  play(audioId: string): void;
  stop(audioId: string): void;
}

// ── ScriptComponent base class ────────────────────────────────────────────────

/**
 * Base class for all Glix scripts.
 * Extend this class and override onStart / onUpdate / onDestroy.
 *
 * @example
 * class MyScript extends ScriptComponent {
 *   onStart() { console.log('Hello from', this.entity); }
 *   onUpdate(dt: number) { }
 *   onDestroy() { }
 * }
 * export default MyScript;
 */
declare class ScriptComponent {
  /** The entity ID this script is attached to. */
  readonly entity: Entity;

  /** Read-only ECS world access. */
  readonly world: World;

  /** Keyboard / mouse input state. */
  readonly input: InputManager;

  /** Physics system handle. */
  readonly physics: PhysicsSystem;

  /** Web Audio wrapper. */
  readonly audio: AudioManager;

  /** Called once when Play starts. */
  onStart(): void;

  /** Called every fixed-timestep frame. \`dt\` is in seconds. */
  onUpdate(dt: number): void;

  /** Called when the script is destroyed / game stops. */
  onDestroy(): void;
}
`;

/** Filename reported to Monaco for the extra lib. */
export const ENGINE_TYPES_FILENAME = 'ts:filename/glix-engine.d.ts';
