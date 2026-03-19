import { World } from '../core/World';
import { MgexFile } from '@glix/shared';
import { AssetPreloader } from './AssetPreloader';
import { AudioManager } from './AudioManager';

export class ResourceManager {
    private project: MgexFile | null = null;

    constructor(
        private preloader: AssetPreloader,
        private audioManager: AudioManager
    ) { }

    public setProject(project: MgexFile): void {
        this.project = project;
    }

    public getProject(): MgexFile | null {
        return this.project;
    }

    public garbageCollect(world: World): void {
        const activeTextures = new Set<string>();
        const activeAudio = new Set<string>();

        const allEntities = world.getEntitiesWithComponents();
        for (const entity of allEntities) {
            const comps = world.getEntityComponents(entity);

            // Textures
            if (comps.sprite?.textureId) activeTextures.add(comps.sprite.textureId);
            if (comps.uiImage?.textureId) activeTextures.add(comps.uiImage.textureId);
            if (comps.particleEmitter?.texture) activeTextures.add(comps.particleEmitter.texture);

            if (comps.frameAnimation?.atlasId) {
                const atlas = this.preloader.getAtlas(comps.frameAnimation.atlasId);
                if (atlas) activeTextures.add(atlas.textureId);
            }

            // Tilemaps
            if (comps.tilemap?.tilesetId) {
                const ts = this.preloader.tilesets.get(comps.tilemap.tilesetId);
                if (ts && ts.textureId) activeTextures.add(ts.textureId);
            }

            // Audio: if there were audio components, we would track them.
            // Script components might hold custom properties, we can't reliably track audio keys from scripts
            // without a dedicated audio component. We'll skip audio GC for now to prevent breaking script-triggered sounds.
        }

        // We also want to keep fonts, etc. But AssetPreloader preloads from MgexFile.
        // If an asset is NOT in activeTextures, and it's a texture, we garbage collect it.
        const texturesMap = this.preloader.getAllTextures();
        for (const [id, tex] of texturesMap.entries()) {
            if (!activeTextures.has(id)) {
                const gl = (this.preloader as any).gl as WebGL2RenderingContext;
                gl.deleteTexture(tex);
                texturesMap.delete(id);
                console.log(`[ResourceManager] Garbage collected unused texture: ${id}`);
            }
        }
    }
}
