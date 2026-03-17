import { MgexFile, TilesetData } from '@glix/shared';
import { TextureLoader } from './TextureLoader';
import { SpriteAtlas } from './SpriteAtlas';
import { AudioManager } from './AudioManager';

export class AssetPreloader {
    private textures: Map<string, WebGLTexture> = new Map();
    private atlases: Map<string, SpriteAtlas> = new Map();
    public tilesets: Map<string, TilesetData> = new Map();
    public assetDefs: Record<string, MgexFile['assets'][string]> = {};

    constructor(
        private gl: WebGL2RenderingContext,
        private audioManager: AudioManager
    ) { }

    async preload(assets: MgexFile['assets']): Promise<void> {
        this.assetDefs = assets;
        const textureLoader = new TextureLoader(this.gl);

        for (const [id, asset] of Object.entries(assets)) {
            if (asset.type === 'texture') {
                const texture = await textureLoader.load(asset.data);
                this.textures.set(id, texture);
            } else if (asset.type === 'audio') {
                await this.audioManager.loadSound(id, asset.data);
            } else if (asset.type === 'spriteatlas') {
                const data = JSON.parse(atob(asset.data.split(',')[1]));
                const atlas = new SpriteAtlas(data.textureId, data.regions);
                this.atlases.set(id, atlas);
            } else if (asset.type === 'tileset') {
                const data = JSON.parse(atob(asset.data.split(',')[1]));
                this.tilesets.set(id, data);
            }
        }
    }

    getTexture(id: string): WebGLTexture | undefined {
        return this.textures.get(id);
    }

    getAtlas(id: string): SpriteAtlas | undefined {
        return this.atlases.get(id);
    }

    getAllTextures(): Map<string, WebGLTexture> {
        return this.textures;
    }
}
