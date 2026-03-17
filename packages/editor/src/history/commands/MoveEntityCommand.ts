import { Command } from '../Command';
import { editorBridge } from '../../bridge/EditorBridge';

export class MoveEntityCommand implements Command {
    constructor(
        private entityIds: string[],
        private oldPositions: { x: number, y: number }[],
        private newPositions: { x: number, y: number }[]
    ) { }

    execute() {
        this.applyPositions(this.newPositions);
    }

    undo() {
        this.applyPositions(this.oldPositions);
    }

    private applyPositions(positions: { x: number, y: number }[]) {
        const world = editorBridge.getEngine()?.getWorld();
        if (!world) return;
        this.entityIds.forEach((id, index) => {
            const transform = world.getComponent(id, 'transform');
            if (transform) {
                transform.x = positions[index].x;
                transform.y = positions[index].y;
            }
        });
    }
}
