import { Engine } from '@glix/runtime';
import { useHistoryStore } from '../store/useHistoryStore';
import { MoveEntityCommand } from '../history/commands/MoveEntityCommand';

export class TranslateGizmo {
    private engine: Engine;
    private selectedEntityIds: string[] = [];
    private dragging: 'x' | 'y' | null = null;
    private startPositions: { x: number, y: number }[] = [];
    private dragStartWorldPos: { x: number, y: number } = { x: 0, y: 0 };

    constructor(engine: Engine) {
        this.engine = engine;
    }

    setSelected(ids: string[]) {
        this.selectedEntityIds = ids;
    }

    render() {
        if (this.selectedEntityIds.length === 0) return;
        // Visual rendering would go here
    }

    handleMouseDown(worldX: number, worldY: number): boolean {
        if (this.selectedEntityIds.length === 0) return false;

        const world = this.engine.getWorld();
        const primaryId = this.selectedEntityIds[0];
        const transform = world.getComponent(primaryId, 'transform');
        if (!transform) return false;

        const handleSize = 1.0;
        if (Math.abs(worldY - transform.y) < 0.2 && worldX >= transform.x && worldX <= transform.x + handleSize) {
            this.dragging = 'x';
        } else if (Math.abs(worldX - transform.x) < 0.2 && worldY >= transform.y && worldY <= transform.y + handleSize) {
            this.dragging = 'y';
        }

        if (this.dragging) {
            this.dragStartWorldPos = { x: worldX, y: worldY };
            this.startPositions = this.selectedEntityIds.map(id => {
                const t = world.getComponent(id, 'transform');
                return { x: t?.x || 0, y: t?.y || 0 };
            });
            return true;
        }

        return false;
    }

    handleMouseMove(worldX: number, worldY: number) {
        if (!this.dragging || this.selectedEntityIds.length === 0) return;

        const dx = worldX - this.dragStartWorldPos.x;
        const dy = worldY - this.dragStartWorldPos.y;

        const world = this.engine.getWorld();
        this.selectedEntityIds.forEach((id, index) => {
            const transform = world.getComponent(id, 'transform');
            if (transform) {
                if (this.dragging === 'x') {
                    transform.x = this.startPositions[index].x + dx;
                } else if (this.dragging === 'y') {
                    transform.y = this.startPositions[index].y + dy;
                }
            }
        });
    }

    handleMouseUp() {
        if (this.dragging && this.selectedEntityIds.length > 0) {
            const world = this.engine.getWorld();
            const currentPositions = this.selectedEntityIds.map(id => {
                const t = world.getComponent(id, 'transform');
                return { x: t?.x || 0, y: t?.y || 0 };
            });

            useHistoryStore.getState().pushCommand(
                new MoveEntityCommand(
                    [...this.selectedEntityIds],
                    [...this.startPositions],
                    currentPositions
                )
            );
        }
        this.dragging = null;
        this.startPositions = [];
    }
}
