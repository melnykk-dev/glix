import { Engine } from '@glix/runtime';
import { useHistoryStore } from '../store/useHistoryStore';
import { RotateEntityCommand } from '../history/commands/RotateEntityCommand';

export class RotateGizmo {
    private engine: Engine;
    private selectedEntityIds: string[] = [];
    private dragging = false;
    private startRotations: number[] = [];
    private dragStartAngle = 0;

    constructor(engine: Engine) {
        this.engine = engine;
    }

    setSelected(ids: string[]) {
        this.selectedEntityIds = ids;
    }

    render() {
        if (this.selectedEntityIds.length === 0) return;
        // Visual rendering: circle handle
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
        const dist = Math.sqrt(Math.pow(worldX - worldPos.x, 2) + Math.pow(worldY - worldPos.y, 2));
        const handleRadius = 1.5;

        if (Math.abs(dist - handleRadius) < 0.3) {
            this.dragging = true;
            this.dragStartAngle = Math.atan2(worldY - worldPos.y, worldX - worldPos.x);
            this.startRotations = this.selectedEntityIds.map(id => {
                const t = world.getComponent(id, 'transform');
                return t?.rotation || 0;
            });
            return true;
        }

        return false;
    }

    handleMouseMove(worldX: number, worldY: number) {
        if (!this.dragging || this.selectedEntityIds.length === 0) return;

        const world = this.engine.getWorld();
        const primaryId = this.selectedEntityIds[0];
        const transform = world.getComponent(primaryId, 'transform');
        if (!transform) return;

        const currentAngle = Math.atan2(worldY - transform.y, worldX - transform.x);
        const deltaAngle = currentAngle - this.dragStartAngle;

        this.selectedEntityIds.forEach((id, index) => {
            const t = world.getComponent(id, 'transform');
            if (t) {
                t.rotation = this.startRotations[index] + deltaAngle;
            }
        });
    }

    handleMouseUp() {
        if (this.dragging && this.selectedEntityIds.length > 0) {
            const world = this.engine.getWorld();
            const currentRotations = this.selectedEntityIds.map(id => {
                const t = world.getComponent(id, 'transform');
                return t?.rotation || 0;
            });

            useHistoryStore.getState().pushCommand(
                new RotateEntityCommand(
                    [...this.selectedEntityIds],
                    [...this.startRotations],
                    currentRotations
                )
            );
        }
        this.dragging = false;
        this.startRotations = [];
    }
}
