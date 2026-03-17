import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { ComponentType } from '@glix/shared';
import { getDefaultComponent } from '@glix/shared/src/ComponentRegistry';

export class AddComponentCommand implements Command {
    constructor(
        private entityId: string,
        private componentType: ComponentType,
        private initialValue?: any
    ) { }

    execute() {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;
        const value = this.initialValue ?? getDefaultComponent(this.componentType);
        world.addComponent(this.entityId, this.componentType, value);
    }

    undo() {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;
        world.removeComponent(this.entityId, this.componentType);
    }
}
