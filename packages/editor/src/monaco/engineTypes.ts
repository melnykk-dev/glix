/**
 * Runtime type declarations surfaced in Monaco IntelliSense.
 * These are automatically available inside Glix scripts — no imports needed.
 */

export const ENGINE_TYPES_DTS = /* ts */ `
// ─── Glix Engine Type Declarations ────────────────────────────────────────────

declare type Entity = string;

// ── Components ────────────────────────────────────────────────────────────────

declare interface TransformComponent {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  parent?: Entity;
}

declare interface SpriteComponent {
  textureId: string;
  tintColor?: string;
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

declare interface ScriptComponent {
  src: string;
  compiledJs: string;
}

declare interface TilemapLayer {
  name: string;
  tiles: number[][];
  visible: boolean;
  opacity: number;
}

declare interface TilemapComponent {
  tilesetId: string;
  layers: TilemapLayer[];
  tileWidth: number;
  tileHeight: number;
}

declare interface SortingLayerComponent {
  layer: number;
  orderInLayer: number;
}

declare interface ParticleEmitterComponent {
  maxParticles: number;
  emissionRate: number;
  lifetime: number;
  startSize: number;
  endSize: number;
  startColor: [number, number, number, number];
  endColor: [number, number, number, number];
  speed: number;
  spread: number;
  texture: string;
}

declare type ComponentType =
  | 'transform' | 'sprite' | 'frameAnimation'
  | 'rigidBody' | 'boxCollider' | 'circleCollider'
  | 'script' | 'tilemap' | 'sortingLayer'
  | 'shaderMaterial' | 'particleEmitter'
  | 'uiCanvas' | 'uiTransform' | 'uiLabel'
  | 'uiImage' | 'uiButton' | 'uiProgressBar'
  | 'uiPanel' | 'persistent' | 'sceneTransition'
  | 'stateMachine';

// ── World ─────────────────────────────────────────────────────────────────────

declare interface World {
  getComponent<T = any>(entity: Entity, type: ComponentType): T | undefined;
  getEntitiesWithComponents(...types: ComponentType[]): Entity[];
  getName(entity: Entity): string | undefined;
  setName(entity: Entity, name: string): void;
  createEntity(id?: string): Entity;
  removeEntity(entity: Entity): void;
  addComponent(entity: Entity, type: ComponentType, data: any): void;
}

// ── InputManager ──────────────────────────────────────────────────────────────

declare interface InputManager {
  /** Is the key currently held down? Pass KeyboardEvent.code, e.g. 'ArrowLeft', 'KeyA', 'Space' */
  isKeyDown(code: string): boolean;
  /** Was the key pressed this frame? */
  isJustPressed(code: string): boolean;
  /** Was the key released this frame? */
  isJustReleased(code: string): boolean;
  /** Is the mouse button currently held? 0=left, 1=middle, 2=right */
  isMouseButtonDown(button: number): boolean;
  isMouseDown(button: number): boolean;
  /** Was the mouse button just pressed this frame? */
  isMouseButtonJustPressed(button: number): boolean;
  /** Alias for isMouseButtonJustPressed */
  isMousePressed(button: number): boolean;
  /** Mouse position in canvas pixels */
  getMousePosition(): { x: number; y: number };
  /** Mouse position in world space */
  getMouseWorldPosition(): { x: number; y: number };
}

// ── PhysicsSystem ─────────────────────────────────────────────────────────────

declare interface PhysicsSystem {
  setVelocity(entity: Entity, x: number, y: number): void;
  getVelocity(entity: Entity): { x: number; y: number };
  applyForce(entity: Entity, x: number, y: number): void;
  teleport(entity: Entity, x: number, y: number): void;
  isGrounded(entity: Entity): boolean;
  setGravity(x: number, y: number): void;
}

// ── AudioManager ─────────────────────────────────────────────────────────────

declare interface AudioManager {
  playSound(id: string, volume?: number, loop?: boolean): void;
  stopSound(id: string): void;
  setVolume(id: string, volume: number): void;
}

// ── EventBus ─────────────────────────────────────────────────────────────────

declare interface EventBus {
  on(event: string, handler: (data: any) => void): () => void;
  off(event: string, handler: (data: any) => void): void;
  emit(event: string, data?: any): void;
}

// ── SceneManager ─────────────────────────────────────────────────────────────

declare interface SceneManager {
  loadScene(sceneId: string): void;
  getCurrentSceneId(): string;
}

// ── ScriptComponent base class ────────────────────────────────────────────────

declare abstract class ScriptComponent {
  /** This entity's ID */
  readonly entity: Entity;
  /** The ECS world */
  readonly world: World;
  /** Input manager */
  readonly input: InputManager;
  /** Physics system */
  readonly physics: PhysicsSystem;
  /** Audio manager */
  readonly audio: AudioManager;
  /** Global event bus */
  readonly eventBus: EventBus;
  /** Scene manager */
  readonly sceneManager: SceneManager;

  // Lifecycle
  onStart(): void;
  onUpdate(dt: number): void;
  onCollision(other: Entity): void;
  onCollisionExit(other: Entity): void;
  onDestroy(): void;

  // Physics helpers
  setVelocity(x: number, y: number): void;
  applyForce(x: number, y: number): void;
  /** Get current velocity */
  getVelocity(): { x: number; y: number };
  /** True when standing on something */
  isGrounded(): boolean;

  // Transform helpers
  getPosition(): { x: number; y: number };
  setPosition(x: number, y: number): void;
  getRotation(): number;
  setRotation(radians: number): void;

  // World helpers
  destroyEntity(entityId: Entity): void;
  getComponent<T = any>(entityId: Entity, type: string): T | undefined;
}
`;

export const ENGINE_TYPES_FILENAME = 'glix-engine.d.ts';
