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

declare interface CameraComponent {
  followTarget?: Entity;
  zoom: number;
  smooth: number;
  offsetX: number;
  offsetY: number;
}

declare interface UILabelComponent {
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
}

declare type ComponentType =
  | 'transform' | 'sprite' | 'frameAnimation'
  | 'rigidBody' | 'boxCollider' | 'circleCollider'
  | 'script' | 'tilemap' | 'sortingLayer'
  | 'shaderMaterial' | 'particleEmitter'
  | 'uiCanvas' | 'uiTransform' | 'uiLabel'
  | 'uiImage' | 'uiButton' | 'uiProgressBar'
  | 'uiPanel' | 'persistent' | 'sceneTransition'
  | 'stateMachine' | 'camera';

// ── World ─────────────────────────────────────────────────────────────────────

declare interface World {
  getComponent<T = any>(entity: Entity, type: ComponentType): T | undefined;
  getEntitiesWithComponents(...types: ComponentType[]): Entity[];
  getName(entity: Entity): string | undefined;
  setName(entity: Entity, name: string): void;
  createEntity(id?: string): Entity;
  removeEntity(entity: Entity): void;
  addComponent(entity: Entity, type: ComponentType, data: any): void;
  removeComponent(entity: Entity, type: ComponentType): void;
  findEntityByName(name: string): Entity | undefined;
  findEntitiesWithName(name: string): Entity[];
  findEntitiesWithTag(tag: string): Entity[];
  hasTag(entity: Entity, tag: string): boolean;
  addTag(entity: Entity, tag: string): void;
  hasEntity(entity: Entity): boolean;
}

// ── InputManager ──────────────────────────────────────────────────────────────

declare interface InputManager {
  /** Is key held? Use KeyboardEvent.code: 'ArrowLeft', 'KeyA', 'Space', 'Enter' */
  isKeyDown(code: string): boolean;
  /** Was key just pressed this frame? */
  isJustPressed(code: string): boolean;
  /** Was key just released this frame? */
  isJustReleased(code: string): boolean;
  /** Is mouse button held? 0=left, 1=middle, 2=right */
  isMouseButtonDown(button: number): boolean;
  isMouseDown(button: number): boolean;
  /** Was mouse button just pressed this frame? */
  isMouseButtonJustPressed(button: number): boolean;
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
  applyImpulse(entity: Entity, x: number, y: number): void;
  teleport(entity: Entity, x: number, y: number): void;
  isGrounded(entity: Entity): boolean;
  setGravity(x: number, y: number): void;
  setBodyType(entity: Entity, type: 'dynamic' | 'static' | 'kinematic'): void;
  setAngularVelocity(entity: Entity, omega: number): void;
}

// ── AudioManager ─────────────────────────────────────────────────────────────

declare interface AudioManager {
  /** Play a loaded sound by its asset ID */
  playSound(id: string, volume?: number, loop?: boolean): void;
  /** Alias for playSound */
  play(id: string, options?: { volume?: number; loop?: boolean }): void;
  /** Stop a playing sound */
  stopSound(id: string): void;
  stop(id: string): void;
  /** Check if a sound is loaded */
  hasSound(id: string): boolean;
  /** Check if a sound is currently playing */
  isPlaying(id: string): boolean;
  /** Set master volume 0–1 */
  setVolume(volume: number): void;
  /** Set volume for a specific sound 0–1 */
  setSoundVolume(id: string, volume: number): void;
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
  readonly entity: Entity;
  readonly world: World;
  readonly input: InputManager;
  readonly physics: PhysicsSystem;
  readonly audio: AudioManager;
  readonly eventBus: EventBus;
  readonly sceneManager: SceneManager;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  onStart(): void;
  onUpdate(dt: number): void;
  onCollision(other: Entity): void;
  onCollisionExit(other: Entity): void;
  onDestroy(): void;

  // ── Physics helpers ────────────────────────────────────────────────────────
  setVelocity(x: number, y: number): void;
  applyForce(x: number, y: number): void;
  applyImpulse(x: number, y: number): void;
  getVelocity(): { x: number; y: number };
  isGrounded(): boolean;

  // ── Transform helpers ──────────────────────────────────────────────────────
  getPosition(): { x: number; y: number };
  setPosition(x: number, y: number): void;
  getRotation(): number;
  setRotation(radians: number): void;
  readonly transform: TransformComponent | undefined;
  readonly name: string;

  // ── Camera helpers ─────────────────────────────────────────────────────────
  /** Get current camera world position */
  getCameraPosition(): { x: number; y: number };
  /** Move the camera to a world position */
  setCameraPosition(x: number, y: number): void;
  /** Set camera zoom level */
  setCameraZoom(zoom: number): void;
  getCameraZoom(): number;
  /** Brief camera shake effect */
  shakeCameraOnce(intensity?: number, duration?: number): void;

  // ── Entity spawning ────────────────────────────────────────────────────────
  /**
   * Spawn a new entity with the given components.
   * @param name   - The name assigned to the new entity
   * @param components - Map of component type → component data
   * @returns The new entity ID
   * @example
   *   const id = this.spawn('Bullet', {
   *     transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
   *     sprite: { textureId: '', tintColor: '#ff0', width: 0.3, height: 0.3, pivotX: 0.5, pivotY: 0.5 },
   *     rigidBody: { type: 'dynamic', gravityScale: 0, linearDamping: 0, angularDamping: 0, fixedRotation: true },
   *   });
   */
  spawn(name: string, components: Record<string, any>): Entity;

  // ── Entity search ──────────────────────────────────────────────────────────
  findEntityByName(name: string): Entity | undefined;
  findEntitiesWithName(name: string): Entity[];
  findEntitiesWithTag(tag: string): Entity[];
  addTag(entityId: Entity, tag: string): void;
  removeTag(entityId: Entity, tag: string): void;
  hasTag(entityId: Entity, tag: string): boolean;
  getEntitiesWithComponents(...types: string[]): Entity[];

  // ── Destruction ────────────────────────────────────────────────────────────
  destroy(): void;
  destroyEntity(entityId: Entity): void;
  destroyByName(name: string): void;

  // ── Component access ───────────────────────────────────────────────────────
  getComponent<T = any>(entityId: Entity, type: string): T | undefined;
  addComponent(entityId: Entity, type: string, data: any): void;
  removeComponent(entityId: Entity, type: string): void;
  hasComponent(entityId: Entity, type: string): boolean;

  // ── Scene ──────────────────────────────────────────────────────────────────
  reloadScene(): void;
  loadScene(sceneId: string): void;

  // ── Timing ────────────────────────────────────────────────────────────────
  /** Run a callback after N seconds */
  after(seconds: number, callback: () => void): void;
}
`;

export const ENGINE_TYPES_FILENAME = 'glix-engine.d.ts';
