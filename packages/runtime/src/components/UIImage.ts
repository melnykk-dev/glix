import { UIImageComponent } from '@glix/shared';

export const createUIImage = (
    textureId: string = '',
    width: number = 100,
    height: number = 100
): UIImageComponent => ({
    textureId,
    width,
    height,
});
