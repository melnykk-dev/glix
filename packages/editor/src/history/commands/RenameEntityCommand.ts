import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { useProjectStore } from '../../store/useProjectStore';

export class RenameEntityCommand implements Command {
    constructor(
        private entityId: string,
        private oldName: string,
        private newName: string
    ) { }

    execute() {
        this.updateName(this.newName);
    }

    undo() {
        this.updateName(this.oldName);
    }

    private updateName(name: string) {
        const engine = editorBridge.getEngine();
        const world = engine?.getWorld();
        if (!world) return;

        world.setName(this.entityId, name);

        // Sync with project store
        useProjectStore.getState().updateProject(project => {
            const sceneId = project.settings.startScene;
            if (!sceneId) return project;
            const scene = project.scenes[sceneId];
            if (scene) {
                const entity = scene.entities.find((e: any) => e.id === this.entityId);
                if (entity) {
                    entity.name = name;
                }
            }
            return { ...project };
        });
    }
}
