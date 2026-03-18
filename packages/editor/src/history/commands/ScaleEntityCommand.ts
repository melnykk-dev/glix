import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { useProjectStore } from '../../store/useProjectStore';
import { MgexFile } from '@glix/shared';

export class ScaleEntityCommand implements Command {
    constructor(
        private entityIds: string[],
        private oldScales: { x: number, y: number }[],
        private newScales: { x: number, y: number }[]
    ) { }

    execute() {
        this.applyScales(this.newScales);
    }

    undo() {
        this.applyScales(this.oldScales);
    }

    private applyScales(scales: { x: number, y: number }[]) {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;
        this.entityIds.forEach((id, index) => {
            const transform = world.getComponent(id, 'transform');
            if (transform) {
                transform.scaleX = scales[index].x;
                transform.scaleY = scales[index].y;
            }
        });

        // Sync with project store
        const { updateProject, project } = useProjectStore.getState();
        if (project) {
            updateProject((proj: MgexFile) => {
                const scene = proj.scenes[proj.settings.startScene];
                if (scene) {
                    scene.entities.forEach((ent: { id: string; components: any }) => {
                        const idx = this.entityIds.indexOf(ent.id);
                        if (idx !== -1 && ent.components.transform) {
                            ent.components.transform.scaleX = scales[idx].x;
                            ent.components.transform.scaleY = scales[idx].y;
                        }
                    });
                }
                return { ...proj };
            });
        }
    }
}
