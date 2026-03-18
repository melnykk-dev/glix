import { SortingLayerComponent } from '@glix/shared';

export const createSortingLayer = (
    layer: number = 0,
    orderInLayer: number = 0
): SortingLayerComponent => ({
    layer,
    orderInLayer,
});
