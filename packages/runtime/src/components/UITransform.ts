import { UITransformComponent } from '@glix/shared';

export const createUITransform = (
    anchorX: number = 0,
    anchorY: number = 0,
    pivotX: number = 0,
    pivotY: number = 0,
    offsetX: number = 0,
    offsetY: number = 0
): UITransformComponent => ({
    anchorX,
    anchorY,
    pivotX,
    pivotY,
    offsetX,
    offsetY,
});
