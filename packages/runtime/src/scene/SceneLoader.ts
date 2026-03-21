import { World } from '../core/World';
import { MgexFile, SceneDef } from '@glix/shared';
import { ComponentType } from '@glix/shared';

export class SceneLoader {
    constructor(private world: World) { }

    loadScene(file: MgexFile, sceneId?: string): void {
        const targetSceneId = sceneId || file.settings.startScene;
        if (!targetSceneId) {
            throw new Error(`No scene specified and no start scene defined in project settings.`);
        }
        const scene = file.scenes[targetSceneId];

        if (!scene) {
            throw new Error(`Scene not found: ${targetSceneId}`);
        }

        this.loadSceneDef(scene);
    }

    loadSceneDef(scene: SceneDef): void {
        this.clearWorld();

        for (const entityDef of scene.entities) {
            // Use the stored entity ID so references stay stable across save/load
            const entity = this.world.createEntity(entityDef.id);

            // Restore display name
            if (entityDef.name) {
                this.world.setName(entity, entityDef.name);
            }

            for (const [type, data] of Object.entries(entityDef.components)) {
                this.world.addComponent(entity, type as ComponentType, data as any);
            }
        }
    }

    private clearWorld(): void {
        const allEntities = this.world.getEntitiesWithComponents();
        for (const entity of allEntities) {
            this.world.removeEntity(entity);
        }
    }
}
