import { editorBridge } from '../bridge/EditorBridge';
import { useProjectStore } from '../store/useProjectStore';

export function syncWorldToProject() {
    const engine = editorBridge.getEngine();
    if (!engine) return;

    const world = engine.getWorld();
    const { updateProject, project } = useProjectStore.getState();
    if (!project) return;

    updateProject(proj => {
        const sceneId = proj.settings.startScene;
        if (!sceneId) return proj;
        const currentScene = proj.scenes[sceneId];
        if (!currentScene) return proj;

        const entities: any[] = [];
        const allEntities = world.getEntitiesWithComponents();
        for (const entity of allEntities) {
            const comps = world.getEntityComponents(entity);
            const components: any = {};
            for (const [type, comp] of Object.entries(comps)) {
                // Ensure we clone to avoid direct mutation
                if (comp) components[type] = JSON.parse(JSON.stringify(comp));
            }
            const name = world.getName(entity);
            entities.push({ id: entity, name, components });
        }

        currentScene.entities = entities;

        // Ensure profound cloning so Zustand listeners correctly fire and references don't leak
        const clonedScenes = JSON.parse(JSON.stringify(proj.scenes));
        return { ...proj, scenes: clonedScenes };
    });
}
