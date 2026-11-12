import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { syncWorldToProject } from '../syncWorldToProject';
import { ComponentType } from '@glix/shared';
import { getDefaultComponent } from '@glix/shared/src/ComponentRegistry';

export class AddComponentCommand implements Command {
    constructor(
        private entityId: string,
        private type: ComponentType,
        private initialData?: any
    ) { }

    execute() {
        const engine = editorBridge.getEngine();
        if (engine) {
            const data = this.initialData || getDefaultComponent(this.type);
            engine.getWorld().addComponent(this.entityId, this.type, JSON.parse(JSON.stringify(data)));
            syncWorldToProject();
        }
    }

    undo() {
        const world = editorBridge.getEngine()?.getWorld();
        if (world) {
            world.removeComponent(this.entityId, this.type);
            syncWorldToProject();
        }
    }
}
