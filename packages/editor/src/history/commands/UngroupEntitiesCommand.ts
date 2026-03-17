import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { useEditorStore } from '../../store/useEditorStore';

export class UngroupEntitiesCommand implements Command {
    private parentId: string;
    private childIds: string[] = [];

    constructor(parentId: string) {
        this.parentId = parentId;
    }

    execute() {
        const engine = editorBridge.getEngine();
        if (!engine) return;
        const world = engine.getWorld();

        // Find children
        const allEntities = world.getEntitiesWithComponents('transform');
        this.childIds = allEntities.filter(id => {
            const t = world.getComponent(id, 'transform');
            return t?.parent === this.parentId;
        });

        // Ungroup
        this.childIds.forEach(id => {
            const t = world.getComponent(id, 'transform');
            if (t) t.parent = undefined;
        });

        // Hide parent
        world.removeEntity(this.parentId);
        useEditorStore.getState().setSelectedEntityIds(this.childIds);
    }

    undo() {
        const engine = editorBridge.getEngine();
        if (!engine) return;
        const world = engine.getWorld();

        // Re-create parent
        world.createEntity(this.parentId);
        world.addComponent(this.parentId, 'transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

        // Restore children
        this.childIds.forEach(id => {
            const t = world.getComponent(id, 'transform');
            if (t) t.parent = this.parentId;
        });

        useEditorStore.getState().setSelectedEntityIds([this.parentId]);
    }
}
