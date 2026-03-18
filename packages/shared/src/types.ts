export type Entity = string;

export interface TransformComponent {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  parent?: Entity;
}

export interface SpriteComponent {
  textureId: string;
  /** Optional CSS colour used when no texture is set (e.g. '#6366F1'). */
  tintColor?: string;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  region?: string; // UV region name from SpriteAtlas
}

export interface FrameAnimationComponent {
  atlasId: string;
  frames: string[];
  fps: number;
  loop: boolean;
  currentFrame: number;
  elapsed: number;
  isPlaying: boolean;
}

export interface RigidBodyComponent {
  type: 'dynamic' | 'static' | 'kinematic';
  gravityScale: number;
  linearDamping: number;
  angularDamping: number;
  fixedRotation: boolean;
}

export interface BoxColliderComponent {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  isSensor: boolean;
  restitution: number;
  friction: number;
}

export interface CircleColliderComponent {
  radius: number;
  offsetX: number;
  offsetY: number;
  isSensor: boolean;
  restitution: number;
  friction: number;
}

export interface ScriptComponent {
  src: string;        // TypeScript source
  compiledJs: string; // Compiled JS, stored in .glix
}

export interface TilemapLayer {
  name: string;
  tiles: number[][]; // 2D array of tile indices, -1 = empty
  visible: boolean;
  opacity: number;
}

export interface TilemapComponent {
  tilesetId: string;
  layers: TilemapLayer[];
  tileWidth: number;
  tileHeight: number;
}

export interface SortingLayerComponent {
  layer: number;
  orderInLayer: number;
}

export interface ShaderMaterialComponent {
  vertSrc: string;
  fragSrc: string;
  uniforms: Record<string, any>;
}

export interface ParticleEmitterComponent {
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

export interface UICanvasComponent { }

export interface UITransformComponent {
  anchorX: number;
  anchorY: number;
  pivotX: number;
  pivotY: number;
  offsetX: number;
  offsetY: number;
}

export interface UILabelComponent {
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
}

export interface UIImageComponent {
  textureId: string;
  width: number;
  height: number;
}

export interface UIButtonComponent {
  normalColor: string;
  hoverColor: string;
  pressColor: string;
  onClick: string;
}

export interface UIProgressBarComponent {
  value: number;
  max: number;
  fillColor: string;
  bgColor: string;
  width: number;
  height: number;
}

export interface UIPanelComponent {
  width: number;
  height: number;
  color: string;
  borderRadius: number;
}

export interface PersistentComponent { }

export interface SceneTransitionComponent {
  type: 'fade' | 'slide';
  duration: number;
  color: string;
}

export interface StateMachineComponent {
  states: Record<string, string>;
  currentState: string;
}

export type ComponentMap = {
  transform: TransformComponent;
  sprite: SpriteComponent;
  frameAnimation: FrameAnimationComponent;
  rigidBody: RigidBodyComponent;
  boxCollider: BoxColliderComponent;
  circleCollider: CircleColliderComponent;
  script: ScriptComponent;
  tilemap: TilemapComponent;
  sortingLayer: SortingLayerComponent;
  shaderMaterial: ShaderMaterialComponent;
  particleEmitter: ParticleEmitterComponent;
  uiCanvas: UICanvasComponent;
  uiTransform: UITransformComponent;
  uiLabel: UILabelComponent;
  uiImage: UIImageComponent;
  uiButton: UIButtonComponent;
  uiProgressBar: UIProgressBarComponent;
  uiPanel: UIPanelComponent;
  persistent: PersistentComponent;
  sceneTransition: SceneTransitionComponent;
  stateMachine: StateMachineComponent;
};

export type ComponentType = keyof ComponentMap;
