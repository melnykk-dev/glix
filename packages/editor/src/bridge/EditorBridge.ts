import { Engine, SceneSerializer, SceneLoader } from '@glix/runtime';
import { useSceneStore } from '../store/useSceneStore';
import { useEditorStore } from '../store/useEditorStore';

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

    play() {
        if (!this.engine || !this.serializer) return;

        // Take snapshot before playing
        // We need 'default_scene' because SceneSerializer wraps it
        const snapshot = this.serializer.serialize(
            this.engine.getWorld(),
            { name: 'Snapshot', resolution: { width: 800, height: 600 } },
            {}
        );
        this.sceneSnapshot = snapshot.scenes['default_scene'];

        this.engine.resume();
        useSceneStore.getState().setPlayState('playing');
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

        // Restore from snapshot
        if (this.sceneSnapshot) {
            this.loader.loadSceneDef(this.sceneSnapshot);
        }

        useSceneStore.getState().setPlayState('stopped');
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
        }
    }

    raycast(worldX: number, worldY: number): string | null {
        if (!this.engine) return null;
        const world = this.engine.getWorld();
        const entities = world.getEntitiesWithComponents('transform', 'sprite');

        // Simple 2D point-in-rect check
        for (const entity of entities) {
            const transform = world.getComponent(entity, 'transform');
            const sprite = world.getComponent(entity, 'sprite');
            if (transform && sprite) {
                const halfW = (sprite.width * transform.scaleX) / 2;
                const halfH = (sprite.height * transform.scaleY) / 2;

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
