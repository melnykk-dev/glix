import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { ComponentType } from '@glix/shared';

export class UpdatePropertyCommand implements Command {
    constructor(
        private entityId: string,
        private componentType: ComponentType,
        private property: string,
        private oldValue: any,
        private newValue: any
    ) { }

    execute() {
        this.updateValue(this.newValue);
    }

    undo() {
        this.updateValue(this.oldValue);
    }

    private updateValue(value: any) {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;
        const component = world.getComponent(this.entityId, this.componentType);
        if (component) {
            (component as any)[this.property] = value;
        }
    }
}
