import { TilemapComponent, TilemapLayer } from '@glix/shared';

export const createTilemapLayer = (
    name: string,
    tiles: number[][] = [],
    visible: boolean = true,
    opacity: number = 1.0
): TilemapLayer => ({
    name,
    tiles,
    visible,
    opacity,
});

export const createTilemap = (
    tilesetId: string = '',
    tileWidth: number = 32,
    tileHeight: number = 32,
    layers: TilemapLayer[] = []
): TilemapComponent => ({
    tilesetId,
    layers,
    tileWidth,
    tileHeight,
});
