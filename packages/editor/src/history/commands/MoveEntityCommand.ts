import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { useProjectStore } from '../../store/useProjectStore';
import { MgexFile } from '@glix/shared';

export class MoveEntityCommand implements Command {
    constructor(
        private entityIds: string[],
        private oldPositions: { x: number, y: number }[],
        private newPositions: { x: number, y: number }[]
    ) { }

    execute() {
        this.applyPositions(this.newPositions);
    }

    undo() {
        this.applyPositions(this.oldPositions);
    }

    private applyPositions(positions: { x: number, y: number }[]) {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;
        this.entityIds.forEach((id, index) => {
            const transform = world.getComponent(id, 'transform');
            if (transform) {
                transform.x = positions[index].x;
                transform.y = positions[index].y;
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
                            ent.components.transform.x = positions[idx].x;
                            ent.components.transform.y = positions[idx].y;
                        }
                    });
                }
                return { ...proj };
            });
        }
    }
}
