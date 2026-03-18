import { Engine } from '@glix/runtime';
import { useHistoryStore } from '../store/useHistoryStore';
import { ScaleEntityCommand } from '../history/commands/ScaleEntityCommand';

export class ScaleGizmo {
    private engine: Engine;
    private selectedEntityIds: string[] = [];
    private dragging: 'x' | 'y' | 'xy' | null = null;
    private startScales: { x: number, y: number }[] = [];
    private dragStartWorldPos: { x: number, y: number } = { x: 0, y: 0 };

    constructor(engine: Engine) {
        this.engine = engine;
    }

    setSelected(ids: string[]) {
        this.selectedEntityIds = ids;
    }

    render() {
        if (this.selectedEntityIds.length === 0) return;
        // Visual rendering: corner and edge handles
    }

    handleMouseDown(worldX: number, worldY: number): boolean {
        if (this.selectedEntityIds.length === 0) return false;

        const world = this.engine.getWorld();
        const primaryId = this.selectedEntityIds[0];
        const transform = world.getComponent(primaryId, 'transform');
        if (!transform) return false;

        const computeWorldPos = (entityId: string): { x: number, y: number } => {
            const t = world.getComponent(entityId, 'transform')!;
            if (t.parent) {
                const pPos = computeWorldPos(t.parent);
                return { x: pPos.x + t.x, y: pPos.y + t.y };
            }
            return { x: t.x, y: t.y };
        };

        const worldPos = computeWorldPos(primaryId);
        const handleSize = 0.5;

        if (Math.abs(worldX - (worldPos.x + 1)) < handleSize && Math.abs(worldY - worldPos.y) < handleSize) {
            this.dragging = 'x';
        } else if (Math.abs(worldX - worldPos.x) < handleSize && Math.abs(worldY - (worldPos.y + 1)) < handleSize) {
            this.dragging = 'y';
        }

        if (this.dragging) {
            this.dragStartWorldPos = { x: worldX, y: worldY };
            this.startScales = this.selectedEntityIds.map(id => {
                const t = world.getComponent(id, 'transform');
                return { x: t?.scaleX || 1, y: t?.scaleY || 1 };
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
                if (this.dragging === 'x' || this.dragging === 'xy') {
                    transform.scaleX = this.startScales[index].x + dx;
                }
                if (this.dragging === 'y' || this.dragging === 'xy') {
                    transform.scaleY = this.startScales[index].y + dy;
                }
            }
        });
    }

    handleMouseUp() {
        if (this.dragging && this.selectedEntityIds.length > 0) {
            const world = this.engine.getWorld();
            const currentScales = this.selectedEntityIds.map(id => {
                const t = world.getComponent(id, 'transform');
                return { x: t?.scaleX || 1, y: t?.scaleY || 1 };
            });

            useHistoryStore.getState().pushCommand(
                new ScaleEntityCommand(
                    [...this.selectedEntityIds],
                    [...this.startScales],
                    currentScales
                )
            );
        }
        this.dragging = null;
        this.startScales = [];
    }
}
