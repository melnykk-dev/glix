import { SortingLayerComponent } from '@glix/shared';

export const createSortingLayer = (
    layer: number = 0,
    orderInLayer: number = 0,
    ySort: boolean = false
): SortingLayerComponent => ({
    layer,
    orderInLayer,
    ySort,
});
