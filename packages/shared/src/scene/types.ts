import { MgexFile, AssetDef, EntityDef, SceneDef } from './MgexSchema';

export type { MgexFile, AssetDef, EntityDef, SceneDef };

export interface SpriteAtlasData {
    textureId: string;
    regions: {
        [name: string]: {
            x: number;
            y: number;
            w: number;
            h: number;
        };
    };
}

export interface TilesetData {
    textureId: string;
    tileWidth: number;
    tileHeight: number;
    columns: number;
    rows: number;
    spacing: number;
    solidTiles?: number[];
}
