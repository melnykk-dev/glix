import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';

export class CreateEntityCommand implements Command {
    private createdId: string | null = null;

    constructor(private initialComponents?: any) { }

    execute() {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;

        this.createdId = world.createEntity(this.createdId || undefined);
        if (this.initialComponents) {
            Object.entries(this.initialComponents).forEach(([type, value]) => {
                world.addComponent(this.createdId!, type as any, value as any);
            });
        }
    }

    undo() {
        if (!this.createdId) return;
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;
        world.removeEntity(this.createdId);
    }
}
