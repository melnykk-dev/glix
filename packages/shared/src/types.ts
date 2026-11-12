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
  tintColor?: string;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  region?: string;
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
  src: string;
  compiledJs: string;
}

export interface TilemapLayer {
  name: string;
  tiles: number[][];
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
  /**
   * Y-sort: when true, entities on the same layer are drawn back-to-front
   * by their bottom edge (feet) instead of by orderInLayer. In Glix Y
   * grows upward, so a larger bottom edge (further north on screen) draws
   * FIRST. Only meaningful for top-down scenes; side-view scenes should
   * leave it false and use orderInLayer.
   */
  ySort?: boolean;
}

/**
 * Named sorting-layer presets (Godot-style canvas layers). Numbers are
 * fixed — do not renumber: existing projects use raw numbers (the Space
 * Shooter template's background already sits on Background = -1).
 * Draw order is ascending layer; UI is drawn by the UI system, not the
 * sprite renderer, so the UI preset is for sprites that must sit above
 * gameplay (e.g. a floating damage number).
 */
export const SORTING_LAYERS = {
  Background: -1,
  Ground: 0,
  Objects: 1,
  Foreground: 2,
  UI: 10,
} as const;

export type SortingLayerName = keyof typeof SORTING_LAYERS;

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
  /** Entity id of the uiScrollView this element scrolls inside, if any.
   * The renderer offsets it by the container's scrollOffset and clips it
   * to the container rect (UIScrollView, GODOT_PARITY item 40). */
  scrollParent?: Entity;
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

/** Ported from the legacy UI system: drag-to-set value, emits `onChange`. */
export interface UISliderComponent {
  value: number;
  min: number;
  max: number;
  trackColor: string;
  fillColor: string;
  knobColor: string;
  width: number;
  height: number;
  onChange: string;
}

/** Ported from the legacy UI system: click to toggle, emits `onToggle`. */
export interface UICheckboxComponent {
  checked: boolean;
  boxColor: string;
  checkColor: string;
  size: number;
  onToggle: string;
}

/**
 * Text input (GODOT_PARITY item 40). Click to focus, type to edit;
 * `focused` and `cursor` are runtime state the UISystem maintains.
 * Emits `onChange` (entity + text) on every edit and `onSubmit` on Enter.
 * v1 limits: no mouse click-to-place caret (arrow keys move it), no IME
 * composition handling — plain keyboard input only.
 */
export interface UITextboxComponent {
  text: string;
  placeholder: string;
  maxLength: number;
  focused: boolean;
  cursor: number;
  bgColor: string;
  borderColor: string;
  focusColor: string;
  textColor: string;
  fontSize: number;
  width: number;
  height: number;
  password: boolean;
  onChange: string;
  onSubmit: string;
}

/**
 * Scroll container (GODOT_PARITY item 40). Children are entities whose
 * uiTransform.scrollParent is this entity's id; the UISystem scrolls them
 * with the mouse wheel / scrollbar drag and the renderer clips them to
 * this rect. `contentHeight` is computed from the children each frame
 * (0 = auto); `scrollOffset` is runtime state, 0 = top.
 * v1 limit: children must use anchor 0,0 + offset positioning.
 */
export interface UIScrollViewComponent {
  width: number;
  height: number;
  contentHeight: number;
  scrollOffset: number;
  bgColor: string;
  showScrollbar: boolean;
  scrollbarColor: string;
  onScroll: string;
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

export interface CameraComponent {
  followTarget?: Entity;
  zoom: number;
  smooth: number;
  offsetX: number;
  offsetY: number;
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
  uiSlider: UISliderComponent;
  uiCheckbox: UICheckboxComponent;
  uiTextbox: UITextboxComponent;
  uiScrollView: UIScrollViewComponent;
  persistent: PersistentComponent;
  sceneTransition: SceneTransitionComponent;
  stateMachine: StateMachineComponent;
  camera: CameraComponent;
};

export type ComponentType = keyof ComponentMap;
