import { World } from './World';
import { AutoloadManager } from './AutoloadManager';
import { AnimationPlayer } from '../animation/AnimationPlayer';
import { RenderSystem } from '../systems/RenderSystem';
import { AnimationSystem } from '../systems/AnimationSystem';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { ScriptSystem } from '../systems/ScriptSystem';
import { TilemapSystem } from '../systems/TilemapSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { LightingSystem } from '../systems/LightingSystem';
import { UISystem } from '../ui/UISystem';
import { UIRenderer } from '../ui/UIRenderer';
import { InputManager } from '../input/InputManager';
import { InputMap, InputMapConfig } from '../input/InputMap';
import { EventBus } from './EventBus';
import { Raycaster } from '../physics/Raycaster';
import { AssetPreloader } from '../assets/AssetPreloader';
import { AudioManager } from '../assets/AudioManager';
import { ResourceManager } from '../assets/ResourceManager';
import { SceneManager } from '../scene/SceneManager';
import { PluginAPI } from '../plugins/PluginAPI';
import { createWorldView, type SystemDefinition } from '../plugins/PluginContext';
import { Mat4 } from '../math';
import { computeViewport, type ComputedViewport } from './Viewport';
import { resolveViewportMode } from '@glix/shared';

export interface EngineConfig {
    gl: WebGL2RenderingContext;
    targetFPS?: number;
    inputConfig?: InputMapConfig;
}

export class Engine {
    private gl: WebGL2RenderingContext;
    private world: World;
    private autoloadManager: AutoloadManager;
    private animationPlayer: AnimationPlayer;
    private renderSystem: RenderSystem;
    private animationSystem: AnimationSystem;
    private physicsSystem: PhysicsSystem;
    private scriptSystem: ScriptSystem;
    private tilemapSystem: TilemapSystem;
    private particleSystem: ParticleSystem;
    private lightingSystem: LightingSystem;
    private uiSystem: UISystem;
    private uiRenderer: UIRenderer;
    private inputManager: InputManager;
    private inputMap: InputMap;
    private eventBus: EventBus;
    private raycaster: Raycaster;
    private audioManager: AudioManager;
    private assetPreloader: AssetPreloader;
    private resourceManager: ResourceManager;
    private sceneManager: SceneManager;
    private pluginAPI: PluginAPI;
    /** Systems registered by loaded extensions, run each fixed step after
     * the script system (fixed-phase) or in the render pass (render-phase).
     * `components` is the owning extension's live registered-component list,
     * read when a WorldView is built so systems may write component types
     * the extension registered after the system itself. */
    private pluginSystems: Array<{
        def: SystemDefinition;
        extId: string;
        components: string[];
        totalMs: number;
        samples: number;
    }> = [];
    private lastTime = 0;
    private accumulator = 0;
    private timestep: number;
    private isRunning = false;
    private profilerEnabled = false;
    private frameCount = 0;
    private lastLoopError: { message: string; stack?: string; at: number } | null = null;
    private errorListeners: Array<(err: { message: string; stack?: string }) => void> = [];
    private profilerData = {
        render: 0,
        physics: 0,
        script: 0,
        ui: 0,
        animation: 0,
        entities: 0,
        physicsBodies: 0,
        fixedStepsDropped: 0
    };

    public cameraPosition: [number, number] = [0, 0];
    public cameraZoom = 1;

    /**
     * Viewport computed by the last render() call (Viewport, 2026-11-12).
     * The editor reads it for its gizmo projection and screen-to-world
     * conversion so overlays always line up with the rendered scene.
     */
    private lastViewport: ComputedViewport | null = null;

    /** Viewport from the most recent render (null before the first frame). */
    getViewport(): ComputedViewport | null {
        return this.lastViewport;
    }

    constructor(config: EngineConfig) {
        this.gl = config.gl;
        this.world = new World();
        this.autoloadManager = new AutoloadManager();
        this.animationPlayer = new AnimationPlayer();
        this.eventBus = new EventBus();
        this.renderSystem = new RenderSystem(this.gl);
        this.lightingSystem = new LightingSystem(this.gl);
        this.renderSystem.setLightingSystem(this.lightingSystem);
        this.uiRenderer = new UIRenderer(this.gl);
        this.uiSystem = new UISystem(this.eventBus);
        this.tilemapSystem = new TilemapSystem(this.gl);
        this.particleSystem = new ParticleSystem(this.gl);
        this.animationSystem = new AnimationSystem();
        this.physicsSystem = new PhysicsSystem(this.eventBus);
        this.inputManager = new InputManager(this.gl.canvas as HTMLCanvasElement);
        this.inputMap = new InputMap(this.inputManager, config.inputConfig);
        this.raycaster = new Raycaster(this.physicsSystem.getPlanckWorld());
        this.audioManager = new AudioManager();
        this.assetPreloader = new AssetPreloader(this.gl, this.audioManager);
        this.resourceManager = new ResourceManager(this.assetPreloader);
        this.sceneManager = new SceneManager(this.world, this);
        this.pluginAPI = new PluginAPI();
        this.scriptSystem = new ScriptSystem(
            this.inputManager,
            this.physicsSystem,
            this.audioManager,
            this.eventBus,
            this.sceneManager
        );
        this.scriptSystem.setEngine(this);
        this.timestep = 1000 / (config.targetFPS || 60);
    }

    getWorld(): World {
        return this.world;
    }

    /** Godot-style AnimationPlayer (GODOT_PARITY item 25). Hooked into the
     * fixed step in tick(); the editor AnimationPlayer panel uses this. */
    getAnimationPlayer(): AnimationPlayer {
        return this.animationPlayer;
    }

    /** Autoloads / singletons (GODOT_PARITY item 46). */
    getAutoloadManager(): AutoloadManager {
        return this.autoloadManager;
    }

    getAssetPreloader(): AssetPreloader {
        return this.assetPreloader;
    }

    getAudioManager(): AudioManager {
        return this.audioManager;
    }

    setProject(project: any): void {
        this.resourceManager.setProject(project);

        const gravity = project?.settings?.physics?.gravity;
        if (gravity) {
            this.physicsSystem.setGravity(gravity.x, gravity.y);
        }

        const bgColor = project?.settings?.backgroundColor;
        if (bgColor) {
            this.setBackgroundColor(bgColor);
        }
    }

    private bgColor: [number, number, number] = [0.06, 0.07, 0.09];

    setBackgroundColor(hex: string): void {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        this.bgColor = [r, g, b];
    }

    getEventBus(): EventBus {
        return this.eventBus;
    }

    getInputMap(): InputMap {
        return this.inputMap;
    }

    /** Public accessor for the unified input state (VirtualGamepad feeds it directly). */
    getInputManager(): InputManager {
        return this.inputManager;
    }

    getRaycaster(): Raycaster {
        return this.raycaster;
    }

    getScriptSystem(): ScriptSystem {
        return this.scriptSystem;
    }

    getResourceManager(): ResourceManager {
        return this.resourceManager;
    }

    /** Public accessor for the renderer (ARCHITECTURE.md §1.5). Replaces
     * the old untyped engine reach-in used by SceneManager. */
    getRenderer(): RenderSystem {
        return this.renderSystem;
    }

    getLightingSystem(): LightingSystem {
        return this.lightingSystem;
    }

    getSceneManager(): SceneManager {
        return this.sceneManager;
    }

    getPluginAPI(): PluginAPI {
        return this.pluginAPI;
    }

    /**
     * Registers a system contributed by an extension. Registering a second
     * system with an existing id throws (ARCHITECTURE.md §1.3) — the
     * loader turns this into a plain-language install error and rolls the
     * extension back. `owner.components` is the extension's live
     * registered-component list, used to build the system's WorldView.
     */
    registerPluginSystem(
        system: SystemDefinition,
        owner: { extId: string; components: string[] },
    ): void {
        if (!system || typeof system.id !== 'string' || system.id.trim() === '') {
            throw new Error('Extension system must have an id.');
        }
        if (system.phase !== 'fixed' && system.phase !== 'render') {
            throw new Error(`Extension system "${system.id}" has phase "${String(system.phase)}" — expected "fixed" or "render".`);
        }
        if (typeof system.update !== 'function') {
            throw new Error(`Extension system "${system.id}" has no update() function.`);
        }
        if (this.pluginSystems.some((s) => s.def.id === system.id)) {
            throw new Error(`A system with id "${system.id}" is already registered.`);
        }
        this.pluginSystems.push({ def: system, extId: owner.extId, components: owner.components, totalMs: 0, samples: 0 });
    }

    /** Unregisters an extension system by id (runs its destroy() hook). */
    unregisterPluginSystem(id: string): void {
        const entry = this.pluginSystems.find((s) => s.def.id === id);
        if (entry?.def.destroy) {
            try {
                entry.def.destroy();
            } catch (err) {
                console.warn(`[Glix] Plugin system "${id}" destroy() failed:`, err);
            }
        }
        this.pluginSystems = this.pluginSystems.filter((s) => s.def.id !== id);
    }

    getPluginSystems(): SystemDefinition[] {
        return this.pluginSystems.map((s) => s.def);
    }

    /**
     * Runs one extension system with a WorldView (never the raw World).
     * A system whose update() averages over 8 ms/frame across 60 frames
     * is disabled with a warning and the game keeps running
     * (PLUGIN_SPEC.md §4).
     */
    private runPluginSystem(entry: { def: SystemDefinition; components: string[]; totalMs: number; samples: number }, dtSeconds: number): void {
        const start = performance.now();
        try {
            entry.def.update(createWorldView(this.world, entry.components), dtSeconds);
        } catch (err) {
            console.error(`[Glix] Plugin system "${entry.def.id}" failed:`, err);
        }
        entry.totalMs += performance.now() - start;
        entry.samples++;
        if (entry.samples >= 60) {
            const avgMs = entry.totalMs / entry.samples;
            entry.totalMs = 0;
            entry.samples = 0;
            if (avgMs > 8) {
                console.warn(
                    `[Glix] Plugin system "${entry.def.id}" averaged ${avgMs.toFixed(1)} ms/frame ` +
                    'over 60 frames (budget 8 ms) and was disabled.',
                );
                this.unregisterPluginSystem(entry.def.id);
            }
        }
    }

    isPaused(): boolean {
        return !this.isRunning;
    }

    isPlaying(): boolean {
        return this.isRunning;
    }

    /** Number of game-loop frames executed since the last start(). */
    getFrameCount(): number {
        return this.frameCount;
    }

    /** The last error thrown inside the game loop, if any. */
    getLastLoopError(): { message: string; stack?: string; at: number } | null {
        return this.lastLoopError;
    }

    /** Subscribe to game-loop errors (a loop error stops the loop cleanly). */
    onLoopError(cb: (err: { message: string; stack?: string }) => void): () => void {
        this.errorListeners.push(cb);
        return () => {
            const i = this.errorListeners.indexOf(cb);
            if (i >= 0) this.errorListeners.splice(i, 1);
        };
    }

    private reportLoopError(err: unknown): void {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        this.lastLoopError = { message, stack, at: Date.now() };
        console.error('[Glix] Game loop error — loop stopped:', err);
        for (const cb of this.errorListeners) {
            try { cb({ message, stack }); } catch (_) { /* listener must not break the engine */ }
        }
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.frameCount = 0;
        this.lastLoopError = null;
        // Autoloads materialise BEFORE scene scripts compile, so an autoload
        // script entity exists when ScriptSystem.init() scans for scripts.
        this.autoloadManager.init(this.world);
        this.scriptSystem.init(this.world);
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);
    }

    pause(): void {
        this.isRunning = false;
    }

    getProfilerData(): any {
        return { ...this.profilerData };
    }

    setProfilerEnabled(enabled: boolean): void {
        this.profilerEnabled = enabled;
    }

    resume(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastLoopError = null;
        this.scriptSystem.clearErrors();
        this.autoloadManager.init(this.world);
        this.scriptSystem.init(this.world);
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);
    }

    stop(): void {
        this.isRunning = false;
        this.scriptSystem.destroy();
        this.physicsSystem.reset();
        this.audioManager.stopAll();
        this.inputManager.reset();
        this.world.clear();
        this.accumulator = 0;
    }

    private updateCameraFromComponents(dtSeconds: number): void {
        const cameraEntities = this.world.getEntitiesWithComponents('camera');
        if (cameraEntities.length === 0) return;

        const camComp = this.world.getComponent(cameraEntities[0], 'camera')!;

        if (camComp.followTarget) {
            const targetTransform = this.world.getComponent(camComp.followTarget, 'transform');
            if (targetTransform) {
                const lerpSpeed = camComp.smooth ?? 5;
                const alpha = Math.min(lerpSpeed * dtSeconds, 1);
                const targetX = targetTransform.x + (camComp.offsetX ?? 0);
                const targetY = targetTransform.y + (camComp.offsetY ?? 0);
                this.cameraPosition[0] += (targetX - this.cameraPosition[0]) * alpha;
                this.cameraPosition[1] += (targetY - this.cameraPosition[1]) * alpha;
            }
        }

        if (camComp.zoom !== undefined && camComp.zoom > 0) {
            this.cameraZoom = camComp.zoom;
        }
    }

    private loop = (currentTime: number): void => {
        if (!this.isRunning) return;

        try {
            this.tick(currentTime);
        } catch (err) {
            // Never let one bad frame kill the game silently: report and stop cleanly.
            this.isRunning = false;
            this.reportLoopError(err);
            return;
        }
        requestAnimationFrame(this.loop);
    };

    private tick(currentTime: number): void {
        // ARCHITECTURE.md §3.1: clamp huge frame deltas (tab-switch guard)
        // and cap fixed steps per frame (spiral-of-death guard). Dropped
        // steps are counted in the profiler, never silently swallowed.
        const deltaTime = Math.min(currentTime - this.lastTime, 250);
        this.lastTime = currentTime;
        this.accumulator += deltaTime;
        const dtSeconds = deltaTime / 1000;

        this.inputManager.cameraPosition = this.cameraPosition;
        this.inputManager.cameraZoom = this.cameraZoom;

        let fixedSteps = 0;
        while (this.accumulator >= this.timestep && fixedSteps < 5) {
            const fixedDtSeconds = this.timestep / 1000;
            fixedSteps++;

            const startAnim = performance.now();
            this.animationSystem.update(this.world, fixedDtSeconds);
            this.animationPlayer.update(this.world, fixedDtSeconds);
            if (this.profilerEnabled) this.profilerData.animation = performance.now() - startAnim;

            const startPhysics = performance.now();
            this.physicsSystem.update(this.world, fixedDtSeconds);
            if (this.profilerEnabled) this.profilerData.physics = performance.now() - startPhysics;

            // Autoloads update before scene scripts, so scripts read fresh
            // singleton state each fixed step.
            this.autoloadManager.update(this.world, fixedDtSeconds);

            const startScript = performance.now();
            this.scriptSystem.update(this.world, fixedDtSeconds);
            if (this.profilerEnabled) this.profilerData.script = performance.now() - startScript;

            // Extension systems (fixed phase) run after the built-in ones.
            // Each gets a WorldView, never the raw World. One bad extension
            // must not kill the game loop, so each is guarded.
            for (const entry of [...this.pluginSystems]) {
                if (entry.def.phase === 'fixed') this.runPluginSystem(entry, fixedDtSeconds);
            }

            const startUI = performance.now();
            this.uiSystem.update(this.world, this.inputManager, this.gl.canvas.width, this.gl.canvas.height);
            if (this.profilerEnabled) this.profilerData.ui = performance.now() - startUI;

            // Camera follow runs inside the fixed step (ARCHITECTURE.md
            // §3.1): identical camera state at 30/60/144 fps.
            this.updateCameraFromComponents(fixedDtSeconds);

            this.accumulator -= this.timestep;
        }

        if (this.accumulator >= this.timestep) {
            this.profilerData.fixedStepsDropped++;
            this.accumulator = 0;
        }

        this.render(dtSeconds);
        this.frameCount++;
        // Input transient state (justPressed/justReleased, wheel delta) is
        // cleared HERE, at the end of the frame, after every system has
        // read it. Clearing at the start of tick (the old order) wiped
        // edge-triggered input before any system could see it, so buttons
        // never fired and textboxes never received keystrokes.
        this.inputManager.update();
    };

    public render(dtSeconds: number = 0): void {
        const startRender = performance.now();
        this.gl.clearColor(this.bgColor[0], this.bgColor[1], this.bgColor[2], 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.inputManager.cameraPosition = this.cameraPosition;
        this.inputManager.cameraZoom = this.cameraZoom;

        // Viewport framing (Viewport, 2026-11-12): the visible world
        // adapts to the canvas aspect per settings.viewportMode —
        // 'expand' (default, Godot-style) grows the visible world in the
        // direction the screen is longer, so tall phones see more of the
        // world vertically instead of black bars. The old code fixed the
        // world height at 20 units (size = 10/zoom) at every aspect.
        const canvas = this.gl.canvas as HTMLCanvasElement;
        const viewportMode = resolveViewportMode(
            this.resourceManager.getProject()?.settings as { viewportMode?: string } | undefined
        );
        const viewport = computeViewport(canvas.width, canvas.height, this.cameraZoom, viewportMode);
        this.lastViewport = viewport;
        // The scene FBO clears to the scene background colour (the old
        // black clear is what painted the bars wherever no tile covered
        // the world), and in 'fit' mode the scene renders into the
        // centred 16:9 sub-rect of the FBO.
        this.renderSystem.setClearColor(this.bgColor[0], this.bgColor[1], this.bgColor[2]);
        this.renderSystem.setOutputViewport(viewport.outX, viewport.outY, viewport.outWidth, viewport.outHeight);

        const projection = Mat4.create();
        Mat4.ortho(projection, -viewport.halfWidth, viewport.halfWidth, -viewport.halfHeight, viewport.halfHeight, -1, 1);

        const view = Mat4.create();
        Mat4.translate(view, view, [-this.cameraPosition[0], -this.cameraPosition[1], 0]);

        const ppConfig = this.resourceManager.getProject()?.settings.postProcess || { bloom: false };

        // Light animations + flicker are visual-only, so they tick here in
        // the render pass with variable dt, not in the fixed step.
        this.lightingSystem.updateAnimations(dtSeconds);
        this.lightingSystem.updateFlicker(dtSeconds);

        this.renderSystem.update(
            this.world,
            dtSeconds,
            view,
            projection,
            this.assetPreloader.getAllTextures(),
            this.assetPreloader.getAllAtlases(),
            this.assetPreloader.tilesets,
            this.tilemapSystem,
            this.particleSystem,
            ppConfig
        );

        this.uiRenderer.render(
            this.world,
            this.gl.canvas.width,
            this.gl.canvas.height,
            this.assetPreloader.getAllTextures()
        );

        // Extension systems (render phase) run after the built-in render,
        // with a WorldView — same 8 ms budget rule as the fixed step.
        for (const entry of [...this.pluginSystems]) {
            if (entry.def.phase === 'render') this.runPluginSystem(entry, dtSeconds);
        }

        if (this.profilerEnabled) this.profilerData.render = performance.now() - startRender;
    }
}
