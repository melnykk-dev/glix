import { SpriteAtlasData } from '@glix/shared';

export class SpriteAtlas {
    constructor(
        public readonly textureId: string,
        public readonly regions: SpriteAtlasData['regions']
    ) { }

    getRegion(name: string) {
        return this.regions[name];
    }
}
