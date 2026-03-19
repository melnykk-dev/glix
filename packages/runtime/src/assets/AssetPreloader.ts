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
                const data = this.parseJsonAsset(asset.data);
                if (data) {
                    const atlas = new SpriteAtlas(data.textureId, data.regions);
                    this.atlases.set(id, atlas);
                }
            } else if (asset.type === 'tileset') {
                const data = this.parseJsonAsset(asset.data);
                if (data) {
                    this.tilesets.set(id, data);
                }
            }
        }
    }

    /**
     * Parse a JSON asset that may be stored as either:
     *  - a raw JSON string
     *  - a base64 data URL  (data:application/json;base64,...)
     *  - a plain data URL   (data:application/json,...) with percent-encoded content
     */
    private parseJsonAsset(data: string): any | null {
        if (!data) return null;

        try {
            // Raw JSON string
            if (data.trimStart().startsWith('{') || data.trimStart().startsWith('[')) {
                return JSON.parse(data);
            }

            // data URL
            if (data.startsWith('data:')) {
                const commaIdx = data.indexOf(',');
                if (commaIdx === -1) return null;
                const meta = data.slice(0, commaIdx);
                const payload = data.slice(commaIdx + 1);

                if (meta.includes('base64')) {
                    return JSON.parse(atob(payload));
                } else {
                    return JSON.parse(decodeURIComponent(payload));
                }
            }

            // Fallback: attempt direct parse
            return JSON.parse(data);
        } catch (e) {
            console.warn('[AssetPreloader] Failed to parse JSON asset:', e);
            return null;
        }
    }

    /** Load a single texture by ID and data URL — used by the HTML exporter. */
    async loadTexture(id: string, dataUrl: string): Promise<void> {
        const textureLoader = new TextureLoader(this.gl);
        const texture = await textureLoader.load(dataUrl);
        this.textures.set(id, texture);
    }

    getTexture(id: string): WebGLTexture | undefined {
        return this.textures.get(id);
    }

    getAtlas(id: string): SpriteAtlas | undefined {
        return this.atlases.get(id);
    }

    async loadTileset(id: string, tilesetData: any): Promise<void> {
        this.tilesets.set(id, tilesetData);
    }

    getAllTextures(): Map<string, WebGLTexture> {
        return this.textures;
    }
}
