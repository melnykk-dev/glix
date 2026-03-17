import { World } from './World';
import { RenderSystem } from '../systems/RenderSystem';
import { AnimationSystem } from '../systems/AnimationSystem';
import { PhysicsSystem } from '../systems/PhysicsSystem';
import { ScriptSystem } from '../systems/ScriptSystem';
import { TilemapSystem } from '../systems/TilemapSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
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
import { Mat4 } from '../math';

export interface EngineConfig {
    gl: WebGL2RenderingContext;
    targetFPS?: number;
    inputConfig?: InputMapConfig;
}

/**
 * The core Engine class that manages the game loop, systems, and world.
 */
export class Engine {
    private gl: WebGL2RenderingContext;
    private world: World;
    private renderSystem: RenderSystem;
    private animationSystem: AnimationSystem;
    private physicsSystem: PhysicsSystem;
    private scriptSystem: ScriptSystem;
    private tilemapSystem: TilemapSystem;
    private particleSystem: ParticleSystem;
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
    private lastTime = 0;
    private accumulator = 0;
    private timestep: number;
    private isRunning = false;
    private profilerEnabled = false;
    private profilerData = {
        render: 0,
        physics: 0,
        script: 0,
        ui: 0,
        animation: 0,
        entities: 0,
        physicsBodies: 0
    };

    public cameraPosition = [0, 0];
    public cameraZoom = 1;

    constructor(config: EngineConfig) {
        this.gl = config.gl;
        this.world = new World();
        this.eventBus = new EventBus();
        this.renderSystem = new RenderSystem(this.gl);
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
        this.resourceManager = new ResourceManager(this.assetPreloader, this.audioManager);
        this.sceneManager = new SceneManager(this.world, this);
        this.pluginAPI = new PluginAPI(this);
        this.scriptSystem = new ScriptSystem(this.inputManager, this.physicsSystem, this.audioManager, this.eventBus, this.sceneManager);
        this.timestep = 1000 / (config.targetFPS || 60);
    }

    getWorld(): World {
        return this.world;
    }

    getAssetPreloader(): AssetPreloader {
        return this.assetPreloader;
    }

    getAudioManager(): AudioManager {
        return this.audioManager;
    }

    getEventBus(): EventBus {
        return this.eventBus;
    }

    getInputMap(): InputMap {
        return this.inputMap;
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

    getSceneManager(): SceneManager {
        return this.sceneManager;
    }

    getPluginAPI(): PluginAPI {
        return this.pluginAPI;
    }

    setProfilerEnabled(enabled: boolean): void {
        this.profilerEnabled = enabled;
    }

    getProfilerData() {
        return {
            ...this.profilerData,
            entities: this.world.getEntitiesWithComponents().length,
            physicsBodies: this.physicsSystem.getPlanckWorld().getBodyCount()
        };
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.scriptSystem.init(this.world);
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);
    }

    pause(): void {
        this.isRunning = false;
    }

    resume(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.scriptSystem.init(this.world);
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);
    }

    stop(): void {
        this.isRunning = false;
        this.scriptSystem.destroy();
        this.inputManager.destroy();
    }

    private loop = (currentTime: number): void => {
        if (!this.isRunning) return;

        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        this.accumulator += deltaTime;
        const dtSeconds = deltaTime / 1000;

        while (this.accumulator >= this.timestep) {
            const fixedDtSeconds = this.timestep / 1000;
            this.inputManager.update();

            const startAnim = performance.now();
            this.animationSystem.update(this.world, fixedDtSeconds);
            if (this.profilerEnabled) this.profilerData.animation = performance.now() - startAnim;

            const startPhysics = performance.now();
            this.physicsSystem.update(this.world, fixedDtSeconds);
            if (this.profilerEnabled) this.profilerData.physics = performance.now() - startPhysics;

            const startScript = performance.now();
            this.scriptSystem.update(this.world, fixedDtSeconds);
            if (this.profilerEnabled) this.profilerData.script = performance.now() - startScript;

            const startUI = performance.now();
            this.uiSystem.update(this.world, this.inputManager, this.gl.canvas.width, this.gl.canvas.height);
            if (this.profilerEnabled) this.profilerData.ui = performance.now() - startUI;

            this.accumulator -= this.timestep;
        }

        this.render(dtSeconds);
        requestAnimationFrame(this.loop);
    };

    private render(dtSeconds: number): void {
        const startRender = performance.now();
        this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        const aspect = this.gl.canvas.width / this.gl.canvas.height;
        const projection = Mat4.create();
        const size = 10 / this.cameraZoom;
        Mat4.ortho(projection, -size * aspect, size * aspect, -size, size, -1, 1);

        const view = Mat4.create();
        Mat4.translate(view, view, [-this.cameraPosition[0], -this.cameraPosition[1], 0]);

        this.renderSystem.update(
            this.world,
            dtSeconds,
            view,
            projection,
            this.assetPreloader.getAllTextures(),
            (this.assetPreloader as any).atlases,
            this.assetPreloader.tilesets,
            this.tilemapSystem,
            this.particleSystem
        );

        // UI pass
        this.uiRenderer.render(
            this.world,
            this.gl.canvas.width,
            this.gl.canvas.height,
            this.assetPreloader.getAllTextures()
        );

        if (this.profilerEnabled) this.profilerData.render = performance.now() - startRender;
    }
}
