import { Engine } from '@glix/runtime';
import { useHistoryStore } from '../store/useHistoryStore';
import { ScaleEntityCommand } from '../history/commands/ScaleEntityCommand';
import { GizmoRenderer } from './GizmoRenderer';
import { useEditorStore } from '../store/useEditorStore';

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

    render(renderer: GizmoRenderer) {
        if (this.selectedEntityIds.length === 0) return;

        const world = this.engine.getWorld();
        const primaryId = this.selectedEntityIds[0];
        const transform = world.getComponent(primaryId, 'transform');
        if (!transform) return;

        const worldPos = this.getWorldPos(primaryId);
        const handleSize = 0.2;
        const offset = 1.0;

        // X Scale Handle (Red Box)
        const xColor: [number, number, number, number] = this.dragging === 'x' ? [1, 1, 0, 1] : [1, 0, 0, 1];
        renderer.drawLine(worldPos.x, worldPos.y, worldPos.x + offset, worldPos.y, xColor);
        renderer.drawRect(worldPos.x + offset, worldPos.y, handleSize, handleSize, xColor);

        // Y Scale Handle (Green Box)
        const yColor: [number, number, number, number] = this.dragging === 'y' ? [1, 1, 0, 1] : [0, 1, 0, 1];
        renderer.drawLine(worldPos.x, worldPos.y, worldPos.x, worldPos.y + offset, yColor);
        renderer.drawRect(worldPos.x, worldPos.y + offset, handleSize, handleSize, yColor);

        // Uniform Scale Handle (Blue Box in center-offset)
        const xyColor: [number, number, number, number] = this.dragging === 'xy' ? [1, 1, 0, 1] : [0, 0, 1, 1];
        renderer.drawRect(worldPos.x + offset * 0.7, worldPos.y + offset * 0.7, handleSize, handleSize, xyColor);
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
        const handleSize = 0.3;
        const offset = 1.0;

        if (Math.abs(worldX - (worldPos.x + offset)) < handleSize && Math.abs(worldY - worldPos.y) < handleSize) {
            this.dragging = 'x';
        } else if (Math.abs(worldX - worldPos.x) < handleSize && Math.abs(worldY - (worldPos.y + offset)) < handleSize) {
            this.dragging = 'y';
        } else if (Math.abs(worldX - (worldPos.x + offset * 0.7)) < handleSize && Math.abs(worldY - (worldPos.y + offset * 0.7)) < handleSize) {
            this.dragging = 'xy';
        }

        if (this.dragging) {
            this.dragStartWorldPos = { x: worldX, y: worldY };
            const world = this.engine.getWorld();
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

        const { snappingEnabled, snapSize } = useEditorStore.getState();
        const world = this.engine.getWorld();

        this.selectedEntityIds.forEach((id, index) => {
            const transform = world.getComponent(id, 'transform');
            if (transform) {
                if (this.dragging === 'x' || this.dragging === 'xy') {
                    let newSX = this.startScales[index].x + dx;
                    if (snappingEnabled) newSX = Math.round(newSX / snapSize) * snapSize;
                    transform.scaleX = Math.max(0.01, newSX);
                }
                if (this.dragging === 'y' || this.dragging === 'xy') {
                    let newSY = this.startScales[index].y + dy;
                    if (snappingEnabled) newSY = Math.round(newSY / snapSize) * snapSize;
                    transform.scaleY = Math.max(0.01, newSY);
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
