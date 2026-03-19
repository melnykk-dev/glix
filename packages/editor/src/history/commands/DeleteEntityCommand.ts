import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { syncWorldToProject } from '../syncWorldToProject';

export class DeleteEntityCommand implements Command {
    private previousComponents: any = null;

    constructor(private entityId: string) { }

    execute() {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;

        this.previousComponents = world.getEntityComponents(this.entityId);
        world.removeEntity(this.entityId);
        syncWorldToProject();
    }

    undo() {
        if (!this.previousComponents) return;
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;

        world.createEntity(this.entityId);
        Object.entries(this.previousComponents).forEach(([type, value]) => {
            world.addComponent(this.entityId, type as any, value as any);
        });
        syncWorldToProject();
    }
}
