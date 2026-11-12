import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';
import { useEditorStore } from '../../store/useEditorStore';

export class GroupEntitiesCommand implements Command {
    private parentId: string;
    private childIds: string[];
    private oldParents: Map<string, string | undefined> = new Map();

    constructor(childIds: string[]) {
        this.childIds = childIds;
        this.parentId = `group_${Math.random().toString(36).substr(2, 9)}`;
    }

    execute() {
        const engine = editorBridge.getEngine();
        if (!engine) return;
        const world = engine.getWorld();

        // Create parent
        world.createEntity(this.parentId);
        world.addComponent(this.parentId, 'transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });

        // Update children
        this.childIds.forEach(id => {
            const t = world.getComponent(id, 'transform');
            if (t) {
                this.oldParents.set(id, t.parent);
                t.parent = this.parentId;
            }
        });

        useEditorStore.getState().setSelectedEntityIds([this.parentId]);
    }

    undo() {
        const engine = editorBridge.getEngine();
        if (!engine) return;
        const world = engine.getWorld();

        // Revert children
        this.childIds.forEach(id => {
            const t = world.getComponent(id, 'transform');
            if (t) {
                t.parent = this.oldParents.get(id);
            }
        });

        // Remove parent
        world.removeEntity(this.parentId);
        useEditorStore.getState().setSelectedEntityIds(this.childIds);
    }
}
