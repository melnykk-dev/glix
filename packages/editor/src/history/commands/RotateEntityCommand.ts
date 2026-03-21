import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { useProjectStore } from '../../store/useProjectStore';
import { MgexFile } from '@glix/shared';

export class RotateEntityCommand implements Command {
    constructor(
        private entityIds: string[],
        private oldRotations: number[],
        private newRotations: number[]
    ) { }

    execute() {
        this.applyRotations(this.newRotations);
    }

    undo() {
        this.applyRotations(this.oldRotations);
    }

    private applyRotations(rotations: number[]) {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;
        this.entityIds.forEach((id, index) => {
            const transform = world.getComponent(id, 'transform');
            if (transform) {
                transform.rotation = rotations[index];
            }
        });

        // Sync with project store
        const { updateProject, project } = useProjectStore.getState();
        if (project) {
            updateProject((proj: MgexFile) => {
                const startSceneId = proj.settings.startScene;
                if (!startSceneId) return proj;
                const scene = proj.scenes[startSceneId];
                if (scene) {
                    scene.entities.forEach((ent: { id: string; components: any }) => {
                        const idx = this.entityIds.indexOf(ent.id);
                        if (idx !== -1 && ent.components.transform) {
                            ent.components.transform.rotation = rotations[idx];
                        }
                    });
                }
                return { ...proj };
            });
        }
    }
}
