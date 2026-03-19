import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { syncWorldToProject } from '../syncWorldToProject';

export class UpdateComponentCommand implements Command {
    private oldValue: any;

    constructor(
        private entityId: string,
        private componentType: string,
        private newValue: any
    ) { }

    execute() {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;

        const component = world.getComponent(this.entityId, this.componentType as any);
        if (component) {
            this.oldValue = { ...component };
            Object.assign(component, this.newValue);
            syncWorldToProject();
        }
    }

    undo() {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world || !this.oldValue) return;

        const component = world.getComponent(this.entityId, this.componentType as any);
        if (component) {
            Object.assign(component, this.oldValue);
            syncWorldToProject();
        }
    }
}
