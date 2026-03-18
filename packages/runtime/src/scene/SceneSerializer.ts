import { World } from '../core/World';
import { MgexFile, SceneDef, EntityDef } from '@glix/shared';
import { ComponentType } from '@glix/shared';

export class SceneSerializer {
    serialize(world: World, meta: MgexFile['meta'], assets: MgexFile['assets']): MgexFile {
        const sceneId = 'default_scene';
        const entities: EntityDef[] = [];

        const allEntities = world.getEntitiesWithComponents();
        for (const entity of allEntities) {
            const components: Record<string, any> = {};

            // This is a bit manual since World doesn't expose all component types easily
            // In a real ECS we'd iterate over registered components
            const types: ComponentType[] = [
                'transform',
                'sprite',
                'frameAnimation',
                'rigidBody',
                'boxCollider',
                'circleCollider',
            ];
            for (const type of types) {
                const comp = world.getComponent(entity, type);
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
