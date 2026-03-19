import { Engine, SceneSerializer, SceneLoader } from '@glix/runtime';
import { useSceneStore } from '../store/useSceneStore';
import { useEditorStore } from '../store/useEditorStore';
import { useProjectStore } from '../store/useProjectStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { CreateEntityCommand } from '../history/commands/CreateEntityCommand';
import { UpdateComponentCommand } from '../history/commands/UpdateComponentCommand';
import { DeleteEntityCommand } from '../history/commands/DeleteEntityCommand';
import { ScriptError } from '@glix/runtime';

/**
 * EditorBridge - Manages communication between the editor UI and the runtime engine.
 * Handles play/pause/stop operations, script compilation, asset management, and
 * bidirectional synchronization between editor state and runtime state.
 *
 * Key responsibilities:
 * - Start/stop/pause the engine
 * - Compile and hot-reload scripts
 * - Sync editor changes to runtime
 * - Handle asset preloading
 * - Manage scene snapshots for stop/restart
 * - Provide raycasting and selection utilities
 * - Handle drag-and-drop from asset browser
 */
export class EditorBridge {
    private engine: Engine | null = null;
    private serializer: SceneSerializer | null = null;
    private loader: SceneLoader | null = null;
    private sceneSnapshot: any = null;
    private playStartTime: number = 0;
    private isHotReloading: boolean = false;
    private pendingScriptUpdates: Map<string, string> = new Map();
    private assetLoadPromises: Map<string, Promise<void>> = new Map();
    private scriptCompilationPromises: Map<string, Promise<string>> = new Map();

    // Performance monitoring
    private frameCount: number = 0;
    private lastFPSUpdate: number = 0;
    private fps: number = 0;

    // Entity selection and manipulation
    private selectedEntityTransforms: Map<string, any> = new Map();
    private gizmoState: { mode: 'translate' | 'rotate' | 'scale', active: boolean } = {
        mode: 'translate',
        active: false
    };

    // Undo/redo system integration
    private commandHistory: any[] = [];
    private historyIndex: number = -1;

    // Event listeners for editor-runtime sync
    private eventListeners: Map<string, Function[]> = new Map();

    setEngine(engine: Engine) {
        this.engine = engine;
        this.serializer = new SceneSerializer();
        this.loader = new SceneLoader(engine.getWorld());
        this.setupEventListeners();
        this.initializePerformanceMonitoring();
    }

    private setupEventListeners() {
        if (!this.engine) return;

        // Listen for runtime events that affect editor state
        this.engine.getEventBus().on('entityCreated', (data: any) => {
            this.notifyEditor('entityCreated', data);
        });

        this.engine.getEventBus().on('entityDestroyed', (data: any) => {
            this.notifyEditor('entityDestroyed', data);
        });

        this.engine.getEventBus().on('componentAdded', (data: any) => {
            this.notifyEditor('componentAdded', data);
        });

        this.engine.getEventBus().on('componentUpdated', (data: any) => {
            this.notifyEditor('componentUpdated', data);
        });

        this.engine.getEventBus().on('collisionEnter', (data: any) => {
            this.notifyEditor('collisionEnter', data);
        });

        this.engine.getEventBus().on('collisionExit', (data: any) => {
            this.notifyEditor('collisionExit', data);
        });
    }

    private initializePerformanceMonitoring() {
        if (!this.engine) return;

        // Monitor FPS and performance
        const monitorLoop = () => {
            if (!this.engine?.isPlaying()) return;

            const now = performance.now();
            this.frameCount++;

            if (now - this.lastFPSUpdate >= 1000) {
                this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFPSUpdate));
                this.frameCount = 0;
                this.lastFPSUpdate = now;

                // Notify editor of performance metrics
                this.notifyEditor('performanceUpdate', {
                    fps: this.fps,
                    profilerData: this.engine.getProfilerData()
                });
            }

            requestAnimationFrame(monitorLoop);
        };

        if (this.engine.isPlaying()) {
            requestAnimationFrame(monitorLoop);
        }
    }

    getEngine(): Engine | null {
        return this.engine;
    }

    getFPS(): number {
        return this.fps;
    }

    getPlayDuration(): number {
        if (!this.engine?.isPlaying() || this.playStartTime === 0) return 0;
        return performance.now() - this.playStartTime;
    }

    /**
     * Start the engine in play mode.
     * Preloads assets, compiles scripts, creates scene snapshot, and begins execution.
     */
    async play() {
        if (!this.engine || !this.serializer) {
            throw new Error('Engine not initialized');
        }

        const project = useProjectStore.getState().project;
        if (!project) {
            throw new Error('No project loaded');
        }

        try {
            console.log('[EditorBridge] Starting play mode...');

            // Step 1: Preload all project assets
            await this.preloadProjectAssets(project);

            // Step 2: Compile all scripts
            await this.compileAllScripts();

            // Step 3: Create scene snapshot for stop/restart
            this.createSceneSnapshot();

            // Step 4: Store current editor state for restoration
            this.storeEditorState();

            // Step 5: Start the engine
            this.engine.start();
            this.playStartTime = performance.now();
            useSceneStore.getState().setPlayState('playing');

            // Step 6: Begin performance monitoring
            this.initializePerformanceMonitoring();

            console.log('[EditorBridge] Play mode started successfully');

        } catch (error) {
            console.error('[EditorBridge] Failed to start play mode:', error);
            this.handlePlayError(error);
            throw error;
        }
    }

    public async preloadProjectAssets(project: any): Promise<void> {
        if (!this.engine) return;

        const assetPreloader = this.engine.getAssetPreloader();
        const assets: Record<string, any> = project.assets || {};

        const assetList = Object.entries(assets);
        console.log(`[EditorBridge] Preloading ${assetList.length} assets...`);

        for (const [id, asset] of assetList) {
            try {
                if (asset.type === 'texture') {
                    const promise = Promise.resolve(assetPreloader.loadTexture(id, asset.data));
                    this.assetLoadPromises.set(`texture_${id}`, promise);
                } else if (asset.type === 'tileset') {
                    const tilesetData = typeof asset.data === 'string' ? JSON.parse(asset.data) : asset.data;
                    const promise = Promise.resolve(assetPreloader.loadTileset(id, tilesetData));
                    this.assetLoadPromises.set(`tileset_${id}`, promise);
                } else if (asset.type === 'audio') {
                    const promise = this.engine.getAudioManager().loadSound(id, asset.data);
                    this.assetLoadPromises.set(`audio_${id}`, promise);
                }
            } catch (e) {
                console.warn(`[EditorBridge] Asset preload error for ${id} (${asset.type}):`, e);
            }
        }

        // Wait for all assets to load
        await Promise.all(this.assetLoadPromises.values());
        this.assetLoadPromises.clear();

        console.log('[EditorBridge] All assets preloaded successfully');
    }

    private async compileAllScripts(): Promise<void> {
        if (!this.engine) return;

        const world = this.engine.getWorld();
        const scriptEntities = world.getEntitiesWithComponents('script');

        console.log(`[EditorBridge] Compiling scripts for ${scriptEntities.length} entities`);

        const compilationPromises = scriptEntities.map(async (entity) => {
            const scriptComp = world.getComponent(entity, 'script');
            if (!scriptComp || !scriptComp.src) return;

            if (!scriptComp.compiledJs) {
                try {
                    console.log(`[EditorBridge] Compiling script for entity ${entity}`);
                    const compiledJs = await this.compileScript(scriptComp.src);
                    scriptComp.compiledJs = compiledJs;
                    console.log(`[EditorBridge] Script compiled successfully for ${entity}`);
                } catch (error) {
                    console.error(`[EditorBridge] Script compilation failed for ${entity}:`, error);
                    throw new Error(`Script compilation failed for entity ${entity}: ${error}`);
                }
            }
        });

        await Promise.all(compilationPromises);
        console.log('[EditorBridge] All scripts compiled successfully');
    }

    private createSceneSnapshot(): void {
        if (!this.engine || !this.serializer) return;

        console.log('[EditorBridge] Creating scene snapshot');

        const snapshot = this.serializer.serialize(
            this.engine.getWorld(),
            { name: 'Snapshot', resolution: { width: 800, height: 600 } },
            {}
        );

        this.sceneSnapshot = snapshot.scenes['default_scene'] ||
            snapshot.scenes[Object.keys(snapshot.scenes)[0]];

        console.log('[EditorBridge] Scene snapshot created');
    }

    private storeEditorState(): void {
        // Store current editor selection and gizmo state
        const editorState = useEditorStore.getState();
        this.selectedEntityTransforms.clear();

        const world = this.engine!.getWorld();
        for (const entityId of editorState.selectedEntityIds) {
            const transform = world.getComponent(entityId, 'transform');
            if (transform) {
                this.selectedEntityTransforms.set(entityId, { ...transform });
            }
        }

        this.gizmoState = {
            mode: editorState.gizmoMode,
            active: false
        };
    }

    private handlePlayError(error: any): void {
        // Clean up any partial state
        this.assetLoadPromises.clear();
        this.scriptCompilationPromises.clear();
        this.pendingScriptUpdates.clear();

        // Try to reset to stopped state
        try {
            useSceneStore.getState().setPlayState('stopped');
        } catch (e) {
            console.error('[EditorBridge] Failed to reset play state:', e);
        }
    }

    /**
     * Pause the engine execution.
     */
    pause() {
        if (!this.engine) return;

        console.log('[EditorBridge] Pausing engine');
        this.engine.pause();
        useSceneStore.getState().setPlayState('paused');
        this.notifyEditor('enginePaused', {});
    }

    /**
     * Resume engine execution from paused state.
     */
    resume() {
        if (!this.engine) return;

        console.log('[EditorBridge] Resuming engine');
        this.engine.resume();
        useSceneStore.getState().setPlayState('playing');
        this.initializePerformanceMonitoring();
        this.notifyEditor('engineResumed', {});
    }

    /**
     * Stop engine execution and restore editor state.
     */
    stop() {
        if (!this.engine || !this.loader) {
            console.warn('[EditorBridge] Cannot stop: engine or loader not initialized');
            return;
        }

        console.log('[EditorBridge] Stopping engine and restoring editor state');

        // Stop the engine
        this.engine.stop();
        this.playStartTime = 0;
        this.frameCount = 0;
        this.fps = 0;

        // Restore scene from snapshot
        if (this.sceneSnapshot) {
            console.log('[EditorBridge] Restoring scene from snapshot');
            this.loader.loadSceneDef(this.sceneSnapshot);
        } else {
            // Fallback: reload from project store
            const project = useProjectStore.getState().project;
            if (project) {
                console.log('[EditorBridge] Restoring scene from project');
                new SceneLoader(this.engine.getWorld()).loadScene(project);
            }
        }

        // Re-apply project to restore asset state
        const project = useProjectStore.getState().project;
        if (project) {
            this.engine.setProject(project);
        }

        // Restore editor state
        this.restoreEditorState();

        // Update store
        useSceneStore.getState().setPlayState('stopped');
        useEditorStore.getState().setSelectedEntityIds([]);

        // One render to show restored state
        this.engine.render(0);

        this.notifyEditor('engineStopped', {});
        console.log('[EditorBridge] Engine stopped and editor state restored');
    }

    private restoreEditorState(): void {
        // Restore selection if entities still exist
        const world = this.engine!.getWorld();
        const validSelections: string[] = [];

        for (const [entityId, originalTransform] of this.selectedEntityTransforms) {
            const currentTransform = world.getComponent(entityId, 'transform');
            if (currentTransform &&
                Math.abs(currentTransform.x - originalTransform.x) < 0.01 &&
                Math.abs(currentTransform.y - originalTransform.y) < 0.01) {
                validSelections.push(entityId);
            }
        }

        if (validSelections.length > 0) {
            useEditorStore.getState().setSelectedEntityIds(validSelections);
        }

        this.selectedEntityTransforms.clear();
    }

    private worker: Worker | null = null;

    private async compileScript(src: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                this.worker = new Worker(
                    new URL('../workers/compiler.worker.ts', import.meta.url),
                    { type: 'module' }
                );
            }

            const id = Math.random().toString(36).slice(2);
            const handler = (evt: MessageEvent) => {
                if (evt.data.id !== id) return;
                this.worker!.removeEventListener('message', handler);

                if (evt.data.compiledJs) {
                    resolve(evt.data.compiledJs);
                } else {
                    reject(new Error(evt.data.error || 'Script compilation failed'));
                }
            };

            this.worker.addEventListener('message', handler);
            this.worker.postMessage({ src, id });
        });
    }

    /**
     * Hot-reload a script for a specific entity during play mode.
     */
    async hotReloadScript(entityId: string, newSrc: string): Promise<void> {
        if (!this.engine || !this.engine.isPlaying()) {
            throw new Error('Cannot hot-reload: engine not playing');
        }

        console.log(`[EditorBridge] Hot-reloading script for ${entityId}`);

        try {
            this.isHotReloading = true;

            // Compile the new script
            const compiledJs = await this.compileScript(newSrc);

            // Update the component
            const world = this.engine.getWorld();
            const scriptComp = world.getComponent(entityId, 'script');
            if (scriptComp) {
                scriptComp.src = newSrc;
                scriptComp.compiledJs = compiledJs;
            }

            // The ScriptSystem will detect the change and reload automatically
            this.notifyEditor('scriptHotReloaded', { entityId, success: true });

        } catch (error) {
            console.error(`[EditorBridge] Hot-reload failed for ${entityId}:`, error);
            this.notifyEditor('scriptHotReloaded', { entityId, success: false, error });
            throw error;
        } finally {
            this.isHotReloading = false;
        }
    }

    /**
     * Get current script errors from the engine.
     */
    getScriptErrors(): ScriptError[] {
        if (!this.engine) return [];
        return this.engine.getScriptSystem().getErrors();
    }

    /**
     * Select an entity in the editor.
     */
    selectEntity(id: string | null) {
        const ids = id ? [id] : [];
        useEditorStore.getState().setSelectedEntityIds(ids);
        this.notifyEditor('entitySelected', { entityId: id });
    }

    /**
     * Update an entity's transform, handling both editor and runtime sync.
     */
    updateTransform(entityId: string, transform: { x: number, y: number, rotation?: number, scaleX?: number, scaleY?: number }) {
        if (!this.engine) return;

        const world = this.engine.getWorld();
        const comp = world.getComponent(entityId, 'transform');
        if (!comp) return;

        // Update the component
        Object.assign(comp, transform);

        // If playing, teleport physics body to prevent issues
        if (this.engine.isPlaying()) {
            const phys = (this.engine as any).physicsSystem;
            if (phys && phys.teleport) {
                phys.teleport(entityId, transform.x, transform.y);
            }
        }

        // Notify editor of the change
        this.notifyEditor('transformUpdated', { entityId, transform });
    }

    /**
     * Raycast to find entity under mouse position.
     */
    raycast(worldX: number, worldY: number): string | null {
        if (!this.engine) return null;

        const world = this.engine.getWorld();
        const entities = world.getEntitiesWithComponents('transform', 'sprite');

        // Find closest entity under cursor
        let closestEntity: string | null = null;
        let closestDistance = Infinity;

        for (const entity of entities) {
            const transform = world.getComponent(entity, 'transform');
            const sprite = world.getComponent(entity, 'sprite');
            if (!transform || !sprite) continue;

            const halfW = (sprite.width * (transform.scaleX ?? 1)) / 2;
            const halfH = (sprite.height * (transform.scaleY ?? 1)) / 2;

            if (worldX >= transform.x - halfW && worldX <= transform.x + halfW &&
                worldY >= transform.y - halfH && worldY <= transform.y + halfH) {

                // Calculate distance from center for selection priority
                const centerX = transform.x;
                const centerY = transform.y;
                const distance = Math.sqrt((worldX - centerX) ** 2 + (worldY - centerY) ** 2);

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestEntity = entity;
                }
            }
        }

        return closestEntity;
    }

    /**
     * Create a new entity at the specified world position.
     */
    createEntityAtPosition(worldX: number, worldY: number, components: any = {}): string {
        const defaultComponents = {
            transform: {
                x: worldX,
                y: worldY,
                rotation: 0,
                scaleX: 1,
                scaleY: 1
            },
            ...components
        };

        const command = new CreateEntityCommand(defaultComponents);
        useHistoryStore.getState().pushCommand(command);

        // Execute the command to create the entity and get its ID
        command.execute();
        const newEntityId = command.entityId!;

        this.notifyEditor('entityCreated', { entityId: newEntityId, components: defaultComponents });

        return newEntityId;
    }

    /**
     * Delete an entity.
     */
    deleteEntity(entityId: string): void {
        const command = new DeleteEntityCommand(entityId);
        useHistoryStore.getState().pushCommand(command);
        this.notifyEditor('entityDeleted', { entityId });
    }

    /**
     * Update a component on an entity.
     */
    updateComponent(entityId: string, componentType: string, componentData: any): void {
        const command = new UpdateComponentCommand(entityId, componentType, componentData);
        useHistoryStore.getState().pushCommand(command);
        this.notifyEditor('componentUpdated', { entityId, componentType, componentData });
    }

    /**
     * Add an event listener for editor-runtime communication.
     */
    addEventListener(eventType: string, callback: Function): void {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType)!.push(callback);
    }

    /**
     * Remove an event listener.
     */
    removeEventListener(eventType: string, callback: Function): void {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Notify editor of runtime events.
     */
    private notifyEditor(eventType: string, data: any): void {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[EditorBridge] Error in event listener for ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * Get current engine state for debugging.
     */
    getDebugInfo(): any {
        if (!this.engine) return null;

        const world = this.engine.getWorld();
        return {
            isPlaying: this.engine.isPlaying(),
            isPaused: this.engine.isPaused(),
            fps: this.fps,
            playDuration: this.getPlayDuration(),
            entityCount: world.getEntitiesWithComponents().length,
            scriptErrors: this.getScriptErrors(),
            selectedEntities: useEditorStore.getState().selectedEntityIds,
            profilerData: this.engine.getProfilerData()
        };
    }

    /**
     * Clean up resources.
     */
    dispose(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        this.eventListeners.clear();
        this.assetLoadPromises.clear();
        this.scriptCompilationPromises.clear();
        this.pendingScriptUpdates.clear();
        this.selectedEntityTransforms.clear();
        this.commandHistory.length = 0;

        console.log('[EditorBridge] Disposed');
    }
}

export const editorBridge = new EditorBridge();
