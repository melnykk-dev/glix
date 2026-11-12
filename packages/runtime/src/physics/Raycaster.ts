import * as planck from 'planck';
import { Entity } from '@glix/shared';
import { Mat4 } from '../math';
import { vec3 } from 'gl-matrix';

export class Raycaster {
    private pWorld: planck.World;

    constructor(pWorld: planck.World) {
        this.pWorld = pWorld;
    }

    /**
     * Casts a ray from screen coordinates through the camera into the scene.
     * In 2D, this performs a point query at the calculated world position.
     */
    public castRay(
        screenX: number,
        screenY: number,
        canvasWidth: number,
        canvasHeight: number,
        viewMatrix: Mat4,
        projectionMatrix: Mat4
    ): Entity | null {
        // 1. Convert screen coordinates to Normalized Device Coordinates (NDC)
        const x = (screenX / canvasWidth) * 2 - 1;
        const y = -((screenY / canvasHeight) * 2 - 1); // Flip Y

        // 2. Create Inverse View-Projection Matrix
        const vp = Mat4.create();
        Mat4.multiply(vp, projectionMatrix, viewMatrix);

        const invVP = Mat4.create();
        if (!Mat4.invert(invVP, vp)) {
            return null;
        }

        // 3. Transform NDC to World Space
        const worldPoint = vec3.fromValues(x, y, 0);
        vec3.transformMat4(worldPoint, worldPoint, invVP);

        const worldX = worldPoint[0];
        const worldY = worldPoint[1];

        // 4. Query Planck World for fixtures at this point
        let hitEntity: Entity | null = null;
        const point = planck.Vec2(worldX, worldY);

        // Use a small AABB around the point for queryAABB
        const aabb = {
            lowerBound: planck.Vec2(worldX - 0.001, worldY - 0.001),
            upperBound: planck.Vec2(worldX + 0.001, worldY + 0.001)
        };

        this.pWorld.queryAABB(aabb, (fixture) => {
            if (fixture.testPoint(point)) {
                const body = fixture.getBody();
                hitEntity = body.getUserData() as Entity;
                return false; // Found one, stop search
            }
            return true; // Continue search
        });

        return hitEntity;
    }
}
