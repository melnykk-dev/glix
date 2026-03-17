import { BoxColliderComponent } from '@glix/shared';

export const createBoxCollider = (
    width: number = 1,
    height: number = 1,
    offsetX: number = 0,
    offsetY: number = 0,
    isSensor: boolean = false,
    restitution: number = 0,
    friction: number = 0.2
): BoxColliderComponent => ({
    width,
    height,
    offsetX,
    offsetY,
    isSensor,
    restitution,
    friction,
});
