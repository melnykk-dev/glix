import { Engine } from '@glix/runtime';

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

        const dist = Math.sqrt(Math.pow(worldX - transform.x, 2) + Math.pow(worldY - transform.y, 2));
        const handleRadius = 1.5;

        if (Math.abs(dist - handleRadius) < 0.3) {
            this.dragging = true;
            this.dragStartAngle = Math.atan2(worldY - transform.y, worldX - transform.x);
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
            // command logic would go here
        }
        this.dragging = false;
        this.startRotations = [];
    }
}
