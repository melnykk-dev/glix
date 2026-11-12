import { CircleColliderComponent } from '@glix/shared';

export const createCircleCollider = (
    radius: number = 0.5,
    offsetX: number = 0,
    offsetY: number = 0,
    isSensor: boolean = false,
    restitution: number = 0,
    friction: number = 0.2
): CircleColliderComponent => ({
    radius,
    offsetX,
    offsetY,
    isSensor,
    restitution,
    friction,
});
