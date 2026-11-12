import { Engine } from '@glix/runtime';
import { useHistoryStore } from '../store/useHistoryStore';
import { RotateEntityCommand } from '../history/commands/RotateEntityCommand';
import { GizmoRenderer } from './GizmoRenderer';
import { useEditorStore } from '../store/useEditorStore';

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

    render(renderer: GizmoRenderer) {
        if (this.selectedEntityIds.length === 0) return;

        const world = this.engine.getWorld();
        const primaryId = this.selectedEntityIds[0];
        const transform = world.getComponent(primaryId, 'transform');
        if (!transform) return;

        const worldPos = this.getWorldPos(primaryId);
        const handleRadius = 1.5;

        const color: [number, number, number, number] = this.dragging ? [1, 1, 0, 1] : [0, 0.5, 1, 1];
        renderer.drawCircle(worldPos.x, worldPos.y, handleRadius, color, 32);

        // Draw a small indicator line for the current rotation
        const angle = transform.rotation;
        renderer.drawLine(
            worldPos.x, worldPos.y,
            worldPos.x + Math.cos(angle) * handleRadius,
            worldPos.y + Math.sin(angle) * handleRadius,
            color
        );
    }

    private getWorldPos(entityId: string): { x: number, y: number } {
        const world = this.engine.getWorld();
        const t = world.getComponent(entityId, 'transform')!;
        if (t.parent) {
            const pPos = this.getWorldPos(t.parent);
            return { x: pPos.x + t.x, y: pPos.y + t.y };
        }
        return { x: t.x, y: t.y };
    }

    handleMouseDown(worldX: number, worldY: number): boolean {
        if (this.selectedEntityIds.length === 0) return false;

        const worldPos = this.getWorldPos(this.selectedEntityIds[0]);
        const dist = Math.sqrt(Math.pow(worldX - worldPos.x, 2) + Math.pow(worldY - worldPos.y, 2));
        const handleRadius = 1.5;
        const hitThreshold = 0.3;

        if (Math.abs(dist - handleRadius) < hitThreshold) {
            this.dragging = true;
            this.dragStartAngle = Math.atan2(worldY - worldPos.y, worldX - worldPos.x);
            const world = this.engine.getWorld();
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
        const worldPos = this.getWorldPos(primaryId);

        const currentAngle = Math.atan2(worldY - worldPos.x, worldX - worldPos.x); // Wait, this was wrong in original too? (worldY - transform.y)
        // Correcting:
        const curAngle = Math.atan2(worldY - worldPos.y, worldX - worldPos.x);
        let deltaAngle = curAngle - this.dragStartAngle;

        const { snappingEnabled } = useEditorStore.getState();
        const snapStep = (15 * Math.PI) / 180; // 15 degrees

        this.selectedEntityIds.forEach((id, index) => {
            const t = world.getComponent(id, 'transform');
            if (t) {
                let newRot = this.startRotations[index] + deltaAngle;
                if (snappingEnabled) {
                    newRot = Math.round(newRot / snapStep) * snapStep;
                }
                t.rotation = newRot;
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
