import { Engine, SceneSerializer, SceneLoader } from '@glix/runtime';
import { useSceneStore } from '../store/useSceneStore';
import { useEditorStore } from '../store/useEditorStore';
import { useProjectStore } from '../store/useProjectStore';

export class EditorBridge {
    private engine: Engine | null = null;
    private serializer: SceneSerializer | null = null;
    private loader: SceneLoader | null = null;
    private sceneSnapshot: any = null;

    setEngine(engine: Engine) {
        this.engine = engine;
        this.serializer = new SceneSerializer();
        this.loader = new SceneLoader(engine.getWorld());
    }

    getEngine(): Engine | null {
        return this.engine;
    }

    async play() {
        if (!this.engine || !this.serializer) return;

        const project = useProjectStore.getState().project;

        // Preload all project assets into the engine before starting
        if (project) {
            try {
                await this.engine.getAssetPreloader().preload(project.assets || {});
            } catch (e) {
                console.warn('[EditorBridge] Asset preload error (continuing):', e);
            }
        }

        // Compile all scripts that don't have compiled JS yet
        const world = this.engine.getWorld();
        const scripts = world.getEntitiesWithComponents('script');
        await Promise.all(scripts.map(async (entity) => {
            const comp = world.getComponent(entity, 'script');
            if (comp && comp.src && !comp.compiledJs) {
                try {
                    comp.compiledJs = await this.compile(comp.src);
                } catch (e) {
                    console.error(`[EditorBridge] Failed to compile script for ${entity}:`, e);
                }
            }
        }));

        // Snapshot current world state so we can restore on Stop
        const snapshot = this.serializer.serialize(
            this.engine.getWorld(),
            { name: 'Snapshot', resolution: { width: 800, height: 600 } },
            {}
        );
        this.sceneSnapshot = snapshot.scenes['default_scene'] || snapshot.scenes[Object.keys(snapshot.scenes)[0]];

        this.engine.resume();
        useSceneStore.getState().setPlayState('playing');
    }

    private worker: Worker | null = null;
    private compile(src: string): Promise<string> {
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
                if (evt.data.compiledJs) resolve(evt.data.compiledJs);
                else reject(new Error(evt.data.error || 'Compile error'));
            };
            this.worker.addEventListener('message', handler);
            this.worker.postMessage({ src, id });
        });
    }

    pause() {
        if (!this.engine) return;
        this.engine.pause();
        useSceneStore.getState().setPlayState('paused');
    }

    resume() {
        if (!this.engine) return;
        this.engine.resume();
        useSceneStore.getState().setPlayState('playing');
    }

    stop() {
        if (!this.engine || !this.loader) return;
        this.engine.stop();

        // Restore scene from pre-play snapshot
        if (this.sceneSnapshot) {
            this.loader.loadSceneDef(this.sceneSnapshot);
        } else {
            // Fallback: reload from project store
            const project = useProjectStore.getState().project;
            if (project) {
                new SceneLoader(this.engine.getWorld()).loadScene(project);
            }
        }

        // Re-apply project to restore asset state
        const project = useProjectStore.getState().project;
        if (project) this.engine.setProject(project);

        useSceneStore.getState().setPlayState('stopped');

        // Clear selected entities (they may no longer be valid)
        useEditorStore.getState().setSelectedEntityIds([]);

        // One render to show restored state
        this.engine.render(0);
    }

    selectEntity(id: string | null) {
        useEditorStore.getState().setSelectedEntityIds(id ? [id] : []);
    }

    updateTransform(entityId: string, transform: { x: number, y: number }) {
        if (!this.engine) return;
        const world = this.engine.getWorld();
        const comp = world.getComponent(entityId, 'transform');
        if (comp) {
            comp.x = transform.x;
            comp.y = transform.y;

            if (!this.engine.isPaused()) {
                const phys = (this.engine as any).physicsSystem;
                if (phys) phys.teleport(entityId, transform.x, transform.y);
            }
        }
    }

    raycast(worldX: number, worldY: number): string | null {
        if (!this.engine) return null;
        const world = this.engine.getWorld();
        const entities = world.getEntitiesWithComponents('transform', 'sprite');

        for (const entity of entities) {
            const transform = world.getComponent(entity, 'transform');
            const sprite = world.getComponent(entity, 'sprite');
            if (transform && sprite) {
                const halfW = (sprite.width * (transform.scaleX ?? 1)) / 2;
                const halfH = (sprite.height * (transform.scaleY ?? 1)) / 2;

                if (worldX >= transform.x - halfW && worldX <= transform.x + halfW &&
                    worldY >= transform.y - halfH && worldY <= transform.y + halfH) {
                    return entity;
                }
            }
        }
        return null;
    }
}

export const editorBridge = new EditorBridge();
