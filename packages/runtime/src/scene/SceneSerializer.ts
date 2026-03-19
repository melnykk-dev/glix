import { World } from '../core/World';
import { MgexFile, SceneDef, EntityDef } from '@glix/shared';

export class SceneSerializer {
    serialize(world: World, meta: MgexFile['meta'], assets: MgexFile['assets']): MgexFile {
        const sceneId = 'default_scene';
        const entities: EntityDef[] = [];

        const allEntities = world.getEntitiesWithComponents();
        for (const entity of allEntities) {
            const components: Record<string, any> = {};

            const entityComponents = world.getEntityComponents(entity);
            for (const [type, comp] of Object.entries(entityComponents)) {
                if (comp) {
                    components[type] = comp;
                }
            }

            entities.push({
                id: entity,
                components
            });
        }

        const scene: SceneDef = {
            id: sceneId,
            name: 'Main Scene',
            entities
        };

        return {
            version: '1.0.0',
            meta,
            assets,
            prefabs: {},
            scenes: { [sceneId]: scene },
            settings: {
                startScene: sceneId,
                physics: { gravity: { x: 0, y: -9.81 } },
                postProcess: {
                    bloom: true,
                    vignette: false,
                    crt: false,
                    bloomThreshold: 0.8,
                    vignetteStrength: 0.3
                },
                input: {}
            }
        };
    }
}
