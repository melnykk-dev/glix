import { Engine } from '@glix/runtime';
import { useHistoryStore } from '../store/useHistoryStore';
import { MoveEntityCommand } from '../history/commands/MoveEntityCommand';
import { GizmoRenderer } from './GizmoRenderer';
import { useEditorStore } from '../store/useEditorStore';

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

    render(renderer: GizmoRenderer) {
        if (this.selectedEntityIds.length === 0) return;

        const world = this.engine.getWorld();
        const primaryId = this.selectedEntityIds[0];
        const transform = world.getComponent(primaryId, 'transform');
        if (!transform) return;

        const worldPos = this.getWorldPos(primaryId);
        const handleSize = 1.0;

        // X Axis (Red)
        const xColor: [number, number, number, number] = this.dragging === 'x' ? [1, 1, 0, 1] : [1, 0, 0, 1];
        renderer.drawArrow(worldPos.x, worldPos.y, handleSize, 0, xColor);

        // Y Axis (Green)
        const yColor: [number, number, number, number] = this.dragging === 'y' ? [1, 1, 0, 1] : [0, 1, 0, 1];
        renderer.drawArrow(worldPos.x, worldPos.y, 0, handleSize, yColor);
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
        const handleSize = 1.0;
        const hitThreshold = 0.2;

        if (Math.abs(worldY - worldPos.y) < hitThreshold && worldX >= worldPos.x && worldX <= worldPos.x + handleSize) {
            this.dragging = 'x';
        } else if (Math.abs(worldX - worldPos.x) < hitThreshold && worldY >= worldPos.y && worldY <= worldPos.y + handleSize) {
            this.dragging = 'y';
        }

        if (this.dragging) {
            this.dragStartWorldPos = { x: worldX, y: worldY };
            const world = this.engine.getWorld();
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

        let dx = worldX - this.dragStartWorldPos.x;
        let dy = worldY - this.dragStartWorldPos.y;

        const { snappingEnabled, snapSize } = useEditorStore.getState();

        const world = this.engine.getWorld();
        this.selectedEntityIds.forEach((id, index) => {
            const transform = world.getComponent(id, 'transform');
            if (transform) {
                if (this.dragging === 'x') {
                    let newX = this.startPositions[index].x + dx;
                    if (snappingEnabled) newX = Math.round(newX / snapSize) * snapSize;
                    transform.x = newX;
                } else if (this.dragging === 'y') {
                    let newY = this.startPositions[index].y + dy;
                    if (snappingEnabled) newY = Math.round(newY / snapSize) * snapSize;
                    transform.y = newY;
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
