import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { ComponentType } from '@glix/shared';

export class RemoveComponentCommand implements Command {
    private previousValue: any;

    constructor(
        private entityId: string,
        private componentType: ComponentType
    ) { }

    execute() {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;
        this.previousValue = world.getComponent(this.entityId, this.componentType);
        world.removeComponent(this.entityId, this.componentType);
    }

    undo() {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world || !this.previousValue) return;
        world.addComponent(this.entityId, this.componentType, this.previousValue);
    }
}
