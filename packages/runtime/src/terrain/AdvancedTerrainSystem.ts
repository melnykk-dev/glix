import { Vec2, Vec3, Mat4 } from '../math';

/**
 * Advanced Terrain System with dynamic terrain generation, deformation,
 * LOD management, vegetation placement, and environmental interactions.
 */
export class AdvancedTerrainSystem {
    private terrainChunks: Map<string, TerrainChunk> = new Map();
    private heightMapGenerators: Map<string, any> = new Map(); // HeightMapGenerator
    private textureGenerators: Map<string, any> = new Map(); // TextureGenerator
    private vegetationSystems: Map<string, VegetationSystem> = new Map();
    private deformationTools: Map<string, TerrainDeformationTool> = new Map();

    // Terrain settings
    private chunkSize: number = 64;
    private maxHeight: number = 100;
    private minHeight: number = -50;

    // Performance optimization
    private activeChunks: Set<string> = new Set();
    private lodDistances: number[] = [50, 100, 200, 400, 800];

    // Terrain materials
    private terrainMaterials: Map<string, TerrainMaterial> = new Map();

    // Vegetation
    private vegetationInstances: VegetationInstance[] = [];

    // Deformation
    private deformationQueue: TerrainDeformation[] = [];
    private deformationHistory: TerrainDeformation[] = [];

    // Environmental effects
    private erosionSimulator: ErosionSimulator;
    private weatheringSimulator: WeatheringSimulator;
    private thermalErosion: ThermalErosion;

    // Rendering
    private terrainRenderer: TerrainRenderer;
    private normalCalculator: TerrainNormalCalculator;
    private lodSelector: LODSelector;

    // Procedural generation (reserved for future use)
    // private biomeGenerator: BiomeGenerator;
    // private featureGenerator: TerrainFeatureGenerator;

    constructor() {
        this.erosionSimulator = new ErosionSimulator();
        this.weatheringSimulator = new WeatheringSimulator();
        this.thermalErosion = new ThermalErosion();
        this.terrainRenderer = new TerrainRenderer();
        this.normalCalculator = new TerrainNormalCalculator();
        this.lodSelector = new LODSelector();
        // biomeGenerator and featureGenerator reserved for future use

        this.initializeGenerators();
        this.initializeMaterials();
        this.initializeVegetationSystems();

        console.log('[AdvancedTerrainSystem] Advanced terrain system initialized');
    }

    private initializeGenerators(): void {
        // Height map generators
        this.heightMapGenerators.set('perlin', new PerlinHeightGenerator());
        this.heightMapGenerators.set('simplex', new SimplexHeightGenerator());
        this.heightMapGenerators.set('diamond_square', new DiamondSquareGenerator());
        this.heightMapGenerators.set('fault_line', new FaultLineGenerator());
        this.heightMapGenerators.set('hydraulic', new HydraulicErosionGenerator());

        // Texture generators
        this.textureGenerators.set('splat', new SplatMapGenerator());
        this.textureGenerators.set('triplanar', new TriplanarTextureGenerator());
        this.textureGenerators.set('biome_blend', new BiomeBlendGenerator());

        // Initialize deformation tools
        this.deformationTools.set('raise_lower', new RaiseLowerTool());
        this.deformationTools.set('flatten', new FlattenTool());
        this.deformationTools.set('smooth', new SmoothTool());
        this.deformationTools.set('noise', new NoiseTool());
        this.deformationTools.set('thermal', new ThermalErosionTool());
    }

    private initializeMaterials(): void {
        // Grass material
        this.terrainMaterials.set('grass', {
            name: 'grass',
            diffuseTextures: ['grass_diffuse.jpg', 'grass_normal.jpg'],
            specularTexture: 'grass_specular.jpg',
            normalTexture: 'grass_normal.jpg',
            displacementTexture: 'grass_displacement.jpg',
            roughness: 0.8,
            metallic: 0.0,
            tiling: Vec2.fromValues(10, 10),
            blendMode: 'lerp'
        });

        // Rock material
        this.terrainMaterials.set('rock', {
            name: 'rock',
            diffuseTextures: ['rock_diffuse.jpg', 'rock_normal.jpg'],
            specularTexture: 'rock_specular.jpg',
            normalTexture: 'rock_normal.jpg',
            displacementTexture: 'rock_displacement.jpg',
            roughness: 0.9,
            metallic: 0.1,
            tiling: Vec2.fromValues(5, 5),
            blendMode: 'multiply'
        });

        // Snow material
        this.terrainMaterials.set('snow', {
            name: 'snow',
            diffuseTextures: ['snow_diffuse.jpg', 'snow_normal.jpg'],
            specularTexture: 'snow_specular.jpg',
            normalTexture: 'snow_normal.jpg',
            displacementTexture: 'snow_displacement.jpg',
            roughness: 0.3,
            metallic: 0.0,
            tiling: Vec2.fromValues(8, 8),
            blendMode: 'add'
        });

        // Sand material
        this.terrainMaterials.set('sand', {
            name: 'sand',
            diffuseTextures: ['sand_diffuse.jpg', 'sand_normal.jpg'],
            specularTexture: 'sand_specular.jpg',
            normalTexture: 'sand_normal.jpg',
            displacementTexture: 'sand_displacement.jpg',
            roughness: 0.7,
            metallic: 0.0,
            tiling: Vec2.fromValues(12, 12),
            blendMode: 'lerp'
        });
    }

    private initializeVegetationSystems(): void {
        // Grass system
        this.vegetationSystems.set('grass', {
            type: 'grass',
            density: 0.8,
            heightRange: Vec2.fromValues(0.1, 0.5),
            colorRange: [Vec3.fromValues(0.2, 0.6, 0.1), Vec3.fromValues(0.4, 0.8, 0.2)],
            windSensitivity: 0.7,
            lodDistances: [10, 25, 50],
            textures: ['grass_billboard.png'],
            placementRules: ['flat_surfaces', 'above_water', 'not_on_roads']
        });

        // Trees system
        this.vegetationSystems.set('trees', {
            type: 'trees',
            density: 0.2,
            heightRange: Vec2.fromValues(5, 15),
            colorRange: [Vec3.fromValues(0.3, 0.2, 0.1), Vec3.fromValues(0.1, 0.4, 0.1)],
            windSensitivity: 0.3,
            lodDistances: [50, 100, 200],
            textures: ['tree_oak.png', 'tree_pine.png', 'tree_birch.png'],
            placementRules: ['fertile_soil', 'adequate_space', 'not_on_slopes']
        });

        // Flowers system
        this.vegetationSystems.set('flowers', {
            type: 'flowers',
            density: 0.3,
            heightRange: Vec2.fromValues(0.05, 0.2),
            colorRange: [Vec3.fromValues(0.8, 0.2, 0.8), Vec3.fromValues(0.9, 0.8, 0.2)],
            windSensitivity: 0.9,
            lodDistances: [5, 15, 30],
            textures: ['flower_red.png', 'flower_yellow.png', 'flower_blue.png'],
            placementRules: ['grassy_areas', 'sunny_spots', 'seasonal']
        });
    }

    // Terrain generation
    async generateTerrain(worldSize: Vec2, config: TerrainGenerationConfig): Promise<void> {
        console.log('[AdvancedTerrainSystem] Starting terrain generation...');

        const chunkCount = this.calculateChunkCount(worldSize);
        const startTime = performance.now();

        for (let x = 0; x < chunkCount.x; x++) {
            for (let z = 0; z < chunkCount.z; z++) {
                const chunkCoord = Vec2.fromValues(x, z);
                await this.generateChunk(chunkCoord, config);
            }
        }

        const generationTime = performance.now() - startTime;
        console.log(`[AdvancedTerrainSystem] Terrain generation completed in ${generationTime.toFixed(2)}ms`);
        console.log(`[AdvancedTerrainSystem] Generated ${this.terrainChunks.size} terrain chunks`);
    }

    private async generateChunk(chunkCoord: Vec2, config: TerrainGenerationConfig): Promise<void> {
        const chunkKey = `${chunkCoord[0]}_${chunkCoord[1]}`;
        const chunk: TerrainChunk = {
            coord: Vec2.clone(chunkCoord),
            bounds: this.calculateChunkBounds(chunkCoord),
            heightMap: new Float32Array((this.chunkSize + 1) * (this.chunkSize + 1)),
            normalMap: new Float32Array((this.chunkSize + 1) * (this.chunkSize + 1) * 3),
            biomeMap: new Uint8Array(this.chunkSize * this.chunkSize),
            materialMap: new Uint8Array(this.chunkSize * this.chunkSize),
            vegetationMap: new Uint8Array(this.chunkSize * this.chunkSize),
            lodLevel: 0,
            lastUpdate: Date.now(),
            renderData: null,
            physicsBody: null
        };

        // Generate height map
        await this.generateHeightMap(chunk, config);

        // Generate normals
        this.normalCalculator.calculateNormals(chunk);

        // Generate biome data
        this.generateBiomeMap(chunk, config);

        // Generate material blending
        this.generateMaterialMap(chunk);

        // Generate vegetation placement
        this.generateVegetationMap(chunk);

        // Create physics body
        this.createPhysicsBody(chunk);

        // Create render data
        chunk.renderData = this.terrainRenderer.createRenderData(chunk);

        this.terrainChunks.set(chunkKey, chunk);
    }

    private async generateHeightMap(chunk: TerrainChunk, config: TerrainGenerationConfig): Promise<void> {
        const generators = config.heightGenerators || ['perlin'];

        // Initialize with base height
        for (let i = 0; i < chunk.heightMap.length; i++) {
            chunk.heightMap[i] = 0;
        }

        // Apply each generator
        for (const generatorName of generators) {
            const generator = this.heightMapGenerators.get(generatorName);
            if (generator) {
                const weights = config.generatorWeights?.[generatorName] || 1.0;
                const scale = config.generatorScales?.[generatorName] || 1.0;

                await generator.generate(
                    chunk.coord[0] * this.chunkSize,
                    chunk.coord[1] * this.chunkSize,
                    this.chunkSize + 1,
                    chunk.heightMap,
                    scale,
                    weights
                );
            }
        }

        // Apply global scaling
        const heightScale = config.heightScale || 1.0;
        const heightOffset = config.heightOffset || 0.0;

        for (let i = 0; i < chunk.heightMap.length; i++) {
            chunk.heightMap[i] = chunk.heightMap[i] * heightScale + heightOffset;
            chunk.heightMap[i] = Math.max(this.minHeight, Math.min(this.maxHeight, chunk.heightMap[i]));
        }
    }

    private generateBiomeMap(chunk: TerrainChunk, _config: TerrainGenerationConfig): void {
        for (let z = 0; z < this.chunkSize; z++) {
            for (let x = 0; x < this.chunkSize; x++) {
                // _worldX and _worldZ reserved for biome lookup in future
                const height = this.sampleHeightMap(chunk, x, z);

                // Determine biome based on height and other factors
                let biomeIndex = 0;

                if (height < -10) biomeIndex = 3; // Ocean
                else if (height < 0) biomeIndex = 3; // Beach
                else if (height < 20) biomeIndex = 0; // Grass
                else if (height < 60) biomeIndex = 1; // Forest
                else biomeIndex = 2; // Mountain

                chunk.biomeMap[z * this.chunkSize + x] = biomeIndex;
            }
        }
    }

    private generateMaterialMap(chunk: TerrainChunk): void {
        for (let z = 0; z < this.chunkSize; z++) {
            for (let x = 0; x < this.chunkSize; x++) {
                const biome = chunk.biomeMap[z * this.chunkSize + x];
                const slope = this.calculateSlope(chunk, x, z);

                let materialIndex = 0;

                if (slope > 0.7) materialIndex = 1; // Rock on steep slopes
                else if (biome === 0) materialIndex = 0; // Grass on plains
                else if (biome === 1) materialIndex = 0; // Grass in forest
                else if (biome === 2) materialIndex = 1; // Rock on mountains
                else if (biome === 3) materialIndex = 3; // Sand on beaches/ocean

                chunk.materialMap[z * this.chunkSize + x] = materialIndex;
            }
        }
    }

    private generateVegetationMap(chunk: TerrainChunk): void {
        for (let z = 0; z < this.chunkSize; z++) {
            for (let x = 0; x < this.chunkSize; x++) {
                const biome = chunk.biomeMap[z * this.chunkSize + x];
                const slope = this.calculateSlope(chunk, x, z);

                let vegetationType = 0; // None

                if (slope < 0.3) { // Flat areas
                    if (biome === 0) vegetationType = 1; // Grass
                    else if (biome === 1) vegetationType = 2; // Trees
                }

                chunk.vegetationMap[z * this.chunkSize + x] = vegetationType;
            }
        }
    }

    private calculateSlope(chunk: TerrainChunk, x: number, z: number): number {
        // Calculate slope using central difference
        // height is sampled to calculate dx/dz, but the center height isn't directly used
        const heightX1 = this.sampleHeightMap(chunk, x + 1, z);
        const heightX2 = this.sampleHeightMap(chunk, x - 1, z);
        const heightZ1 = this.sampleHeightMap(chunk, x, z + 1);
        const heightZ2 = this.sampleHeightMap(chunk, x, z - 1);

        const dx = (heightX1 - heightX2) / 2;
        const dz = (heightZ1 - heightZ2) / 2;

        return Math.sqrt(dx * dx + dz * dz);
    }

    private sampleHeightMap(chunk: TerrainChunk, x: number, z: number): number {
        // Clamp coordinates
        x = Math.max(0, Math.min(this.chunkSize, x));
        z = Math.max(0, Math.min(this.chunkSize, z));

        return chunk.heightMap[z * (this.chunkSize + 1) + x];
    }

    private createPhysicsBody(chunk: TerrainChunk): void {
        // Create physics collision mesh for the terrain chunk
        // This would integrate with the physics system
        chunk.physicsBody = {}; // Placeholder
    }

    // Terrain deformation
    applyDeformation(deformation: TerrainDeformation): void {
        this.deformationQueue.push(deformation);
        this.deformationHistory.push(deformation);
    }

    processDeformations(): void {
        while (this.deformationQueue.length > 0) {
            const deformation = this.deformationQueue.shift()!;
            this.applyDeformationInternal(deformation);
        }
    }

    private applyDeformationInternal(deformation: TerrainDeformation): void {
        const affectedChunks = this.getAffectedChunks(deformation.position, deformation.radius);

        for (const chunkKey of affectedChunks) {
            const chunk = this.terrainChunks.get(chunkKey);
            if (!chunk) continue;

            const tool = this.deformationTools.get(deformation.tool);
            if (tool) {
                tool.apply(chunk, deformation);
                chunk.lastUpdate = Date.now();

                // Update normals and render data
                this.normalCalculator.calculateNormals(chunk);
                chunk.renderData = this.terrainRenderer.createRenderData(chunk);

                // Update physics body
                this.updatePhysicsBody(chunk);
            }
        }
    }

    private getAffectedChunks(position: Vec3, radius: number): string[] {
        const affectedChunks: string[] = [];
        const chunkRadius = Math.ceil(radius / this.chunkSize);

        const centerChunkX = Math.floor(position[0] / this.chunkSize);
        const centerChunkZ = Math.floor(position[2] / this.chunkSize);

        for (let x = centerChunkX - chunkRadius; x <= centerChunkX + chunkRadius; x++) {
            for (let z = centerChunkZ - chunkRadius; z <= centerChunkZ + chunkRadius; z++) {
                affectedChunks.push(`${x}_${z}`);
            }
        }

        return affectedChunks;
    }

    private updatePhysicsBody(_chunk: TerrainChunk): void {
        // Update physics collision mesh
        // This would notify the physics system to update the collision shape
    }

    // Vegetation management
    placeVegetation(chunkCoord: Vec2): void {
        const chunk = this.terrainChunks.get(`${chunkCoord[0]}_${chunkCoord[1]}`);
        if (!chunk) return;

        for (let z = 0; z < this.chunkSize; z++) {
            for (let x = 0; x < this.chunkSize; x++) {
                const vegetationType = chunk.vegetationMap[z * this.chunkSize + x];

                if (vegetationType > 0) {
                    const worldPos = Vec3.fromValues(
                        chunk.coord[0] * this.chunkSize + x + 0.5,
                        this.sampleHeightMap(chunk, x, z),
                        chunk.coord[1] * this.chunkSize + z + 0.5
                    );

                    this.placeVegetationInstance(vegetationType, worldPos, chunk);
                }
            }
        }
    }

    private placeVegetationInstance(type: number, position: Vec3, chunk: TerrainChunk): void {
        const vegetationSystem = this.getVegetationSystemByType(type);
        if (!vegetationSystem) return;

        const instance: VegetationInstance = {
            type,
            position: Vec3.clone(position),
            rotation: Math.random() * Math.PI * 2,
            scale: vegetationSystem.heightRange[0] + Math.random() * (vegetationSystem.heightRange[1] - vegetationSystem.heightRange[0]),
            color: this.getRandomColor(vegetationSystem.colorRange),
            lodLevel: 0,
            chunkCoord: Vec2.clone(chunk.coord)
        };

        this.vegetationInstances.push(instance);
    }

    private getVegetationSystemByType(type: number): VegetationSystem | null {
        const typeNames = ['none', 'grass', 'trees', 'flowers'];
        const typeName = typeNames[type];
        return typeName ? this.vegetationSystems.get(typeName) || null : null;
    }

    private getRandomColor(colorRange: Vec3[]): Vec3 {
        const t = Math.random();
        return Vec3.lerp(Vec3.create(), colorRange[0], colorRange[1], t);
    }

    // LOD management
    updateLOD(cameraPosition: Vec3): void {
        for (const [_chunkKey, chunk] of this.terrainChunks) {
            const chunkCenter = Vec3.fromValues(
                chunk.coord[0] * this.chunkSize + this.chunkSize / 2,
                0,
                chunk.coord[1] * this.chunkSize + this.chunkSize / 2
            );

            const distance = Vec3.distance(cameraPosition, chunkCenter);
            const newLODLevel = this.lodSelector.selectLOD(distance, this.lodDistances);

            if (newLODLevel !== chunk.lodLevel) {
                chunk.lodLevel = newLODLevel;
                chunk.renderData = this.terrainRenderer.createRenderData(chunk);
            }
        }
    }

    // Erosion and weathering
    simulateErosion(deltaTime: number): void {
        for (const chunk of this.terrainChunks.values()) {
            this.erosionSimulator.simulate(chunk, deltaTime);
            this.weatheringSimulator.simulate(chunk, deltaTime);
            this.thermalErosion.simulate(chunk, deltaTime);
        }
    }

    // Rendering
    render(camera: any, projectionMatrix: Mat4, viewMatrix: Mat4): void {
        this.terrainRenderer.render(
            Array.from(this.terrainChunks.values()),
            this.vegetationInstances,
            camera,
            projectionMatrix,
            viewMatrix
        );
    }

    // Collision detection
    getHeightAtPosition(position: Vec3): number {
        const chunkCoord = Vec2.fromValues(
            Math.floor(position[0] / this.chunkSize),
            Math.floor(position[2] / this.chunkSize)
        );

        const chunk = this.terrainChunks.get(`${chunkCoord[0]}_${chunkCoord[1]}`);
        if (!chunk) return 0;

        const localX = position[0] - chunkCoord[0] * this.chunkSize;
        const localZ = position[2] - chunkCoord[1] * this.chunkSize;

        return this.sampleHeightMap(chunk, localX, localZ);
    }

    raycastTerrain(_origin: Vec3, _direction: Vec3, _maxDistance: number): TerrainRaycastResult | null {
        // Implement terrain raycasting
        // This would use the height maps to find intersections
        return null; // Placeholder
    }

    // Utility methods
    getChunkAtPosition(position: Vec3): TerrainChunk | null {
        const chunkCoord = Vec2.fromValues(
            Math.floor(position[0] / this.chunkSize),
            Math.floor(position[2] / this.chunkSize)
        );

        return this.terrainChunks.get(`${chunkCoord[0]}_${chunkCoord[1]}`) || null;
    }

    getChunksInRadius(center: Vec3, radius: number): TerrainChunk[] {
        const chunks: TerrainChunk[] = [];
        const chunkRadius = Math.ceil(radius / this.chunkSize);

        const centerChunkX = Math.floor(center[0] / this.chunkSize);
        const centerChunkZ = Math.floor(center[2] / this.chunkSize);

        for (let x = centerChunkX - chunkRadius; x <= centerChunkX + chunkRadius; x++) {
            for (let z = centerChunkZ - chunkRadius; z <= centerChunkZ + chunkRadius; z++) {
                const chunk = this.terrainChunks.get(`${x}_${z}`);
                if (chunk) {
                    const chunkCenter = Vec3.fromValues(
                        x * this.chunkSize + this.chunkSize / 2,
                        0,
                        z * this.chunkSize + this.chunkSize / 2
                    );

                    if (Vec3.distance(center, chunkCenter) <= radius) {
                        chunks.push(chunk);
                    }
                }
            }
        }

        return chunks;
    }

    // Export/Import
    exportTerrain(): string {
        const terrainData = {
            chunks: Array.from(this.terrainChunks.entries()),
            vegetationInstances: this.vegetationInstances,
            deformationHistory: this.deformationHistory
        };

        return JSON.stringify(terrainData);
    }

    importTerrain(data: string): void {
        const terrainData = JSON.parse(data);

        this.terrainChunks.clear();
        for (const [key, chunk] of terrainData.chunks) {
            this.terrainChunks.set(key, chunk);
        }

        this.vegetationInstances = terrainData.vegetationInstances || [];
        this.deformationHistory = terrainData.deformationHistory || [];
    }

    // Performance monitoring
    getStats(): TerrainStats {
        return {
            totalChunks: this.terrainChunks.size,
            activeChunks: this.activeChunks.size,
            vegetationInstances: this.vegetationInstances.length,
            averageChunkSize: this.chunkSize,
            totalMemoryUsage: this.calculateMemoryUsage()
        };
    }

    private calculateMemoryUsage(): number {
        let totalBytes = 0;

        // Height maps (4 bytes per float)
        totalBytes += this.terrainChunks.size * (this.chunkSize + 1) * (this.chunkSize + 1) * 4;

        // Normal maps (4 bytes per float * 3 components)
        totalBytes += this.terrainChunks.size * (this.chunkSize + 1) * (this.chunkSize + 1) * 3 * 4;

        // Biome/material/vegetation maps (1 byte each)
        totalBytes += this.terrainChunks.size * this.chunkSize * this.chunkSize * 3;

        return totalBytes;
    }

    private calculateChunkBounds(chunkCoord: Vec2): { min: Vec3; max: Vec3 } {
        return {
            min: Vec3.fromValues(
                chunkCoord[0] * this.chunkSize,
                this.minHeight,
                chunkCoord[1] * this.chunkSize
            ),
            max: Vec3.fromValues(
                (chunkCoord[0] + 1) * this.chunkSize,
                this.maxHeight,
                (chunkCoord[1] + 1) * this.chunkSize
            )
        };
    }

    private calculateChunkCount(worldSize: Vec2): { x: number; z: number } {
        return {
            x: Math.ceil(worldSize[0] / this.chunkSize),
            z: Math.ceil(worldSize[1] / this.chunkSize)
        };
    }

    // Cleanup
    dispose(): void {
        for (const chunk of this.terrainChunks.values()) {
            if (chunk.renderData) {
                this.terrainRenderer.destroyRenderData(chunk.renderData);
            }
        }

        this.terrainChunks.clear();
        this.vegetationInstances.length = 0;
        this.deformationQueue.length = 0;
        this.deformationHistory.length = 0;

        console.log('[AdvancedTerrainSystem] Disposed');
    }
}

// Supporting classes and interfaces
interface TerrainChunk {
    coord: Vec2;
    bounds: { min: Vec3; max: Vec3 };
    heightMap: Float32Array;
    normalMap: Float32Array;
    biomeMap: Uint8Array;
    materialMap: Uint8Array;
    vegetationMap: Uint8Array;
    lodLevel: number;
    lastUpdate: number;
    renderData: any; // Terrain render data
    physicsBody: any; // Physics collision body
}

interface TerrainGenerationConfig {
    heightGenerators?: string[];
    generatorWeights?: { [key: string]: number };
    generatorScales?: { [key: string]: number };
    heightScale?: number;
    heightOffset?: number;
    biomeConfig?: any;
    vegetationDensity?: number;
}

interface TerrainMaterial {
    name: string;
    diffuseTextures: string[];
    specularTexture?: string;
    normalTexture?: string;
    displacementTexture?: string;
    roughness: number;
    metallic: number;
    tiling: Vec2;
    blendMode: 'lerp' | 'multiply' | 'add';
}

interface BlendMap {
    textures: WebGLTexture[];
    weights: Float32Array;
}

interface VegetationSystem {
    type: string;
    density: number;
    heightRange: Vec2;
    colorRange: Vec3[];
    windSensitivity: number;
    lodDistances: number[];
    textures: string[];
    placementRules: string[];
}

interface VegetationInstance {
    type: number;
    position: Vec3;
    rotation: number;
    scale: number;
    color: Vec3;
    lodLevel: number;
    chunkCoord: Vec2;
}

interface TerrainDeformation {
    tool: string;
    position: Vec3;
    radius: number;
    strength: number;
    parameters?: any;
}

interface TerrainDeformationTool {
    apply(chunk: TerrainChunk, deformation: TerrainDeformation): void;
}

interface TerrainRaycastResult {
    position: Vec3;
    normal: Vec3;
    distance: number;
    chunk: TerrainChunk;
}

interface TerrainStats {
    totalChunks: number;
    activeChunks: number;
    vegetationInstances: number;
    averageChunkSize: number;
    totalMemoryUsage: number;
}

// Terrain generator implementations
class PerlinHeightGenerator {
    async generate(worldX: number, worldZ: number, size: number, heightMap: Float32Array, scale: number, weight: number): Promise<void> {
        // Perlin noise implementation
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const nx = (worldX + x) * scale * 0.01;
                const nz = (worldZ + z) * scale * 0.01;

                // Simple noise function (replace with proper Perlin)
                const noise = (Math.sin(nx) + Math.sin(nz) + Math.sin(nx + nz)) * 0.33 + 0.5;
                heightMap[z * size + x] += noise * weight;
            }
        }
    }
}

class SimplexHeightGenerator {
    async generate(worldX: number, worldZ: number, size: number, heightMap: Float32Array, scale: number, weight: number): Promise<void> {
        // Simplex noise implementation
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                const nx = (worldX + x) * scale * 0.008;
                const nz = (worldZ + z) * scale * 0.008;

                // Simple noise function (replace with proper Simplex)
                const noise = (Math.sin(nx * 1.7) * Math.cos(nz * 1.3) + Math.sin(nz * 0.9)) * 0.5 + 0.5;
                heightMap[z * size + x] += noise * weight;
            }
        }
    }
}

class DiamondSquareGenerator {
    async generate(_worldX: number, _worldZ: number, size: number, heightMap: Float32Array, _scale: number, weight: number): Promise<void> {
        // Diamond-square algorithm implementation
        // Initialize corners
        heightMap[0] = Math.random() * weight;
        heightMap[size - 1] = Math.random() * weight;
        heightMap[(size - 1) * size] = Math.random() * weight;
        heightMap[(size - 1) * size + size - 1] = Math.random() * weight;

        let stepSize = size - 1;
        let roughness = 1.0;

        while (stepSize > 1) {
            // Diamond step
            for (let z = 0; z < size - 1; z += stepSize) {
                for (let x = 0; x < size - 1; x += stepSize) {
                    const avg = (
                        heightMap[z * size + x] +
                        heightMap[z * size + x + stepSize] +
                        heightMap[(z + stepSize) * size + x] +
                        heightMap[(z + stepSize) * size + x + stepSize]
                    ) / 4;

                    heightMap[(z + stepSize / 2) * size + x + stepSize / 2] = avg + (Math.random() - 0.5) * roughness * weight;
                }
            }

            // Square step
            for (let z = 0; z < size; z += stepSize / 2) {
                for (let x = (z + stepSize / 2) % stepSize; x < size; x += stepSize) {
                    let sum = 0;
                    let count = 0;

                    // Adjacent points
                    if (x - stepSize / 2 >= 0) {
                        sum += heightMap[z * size + x - stepSize / 2];
                        count++;
                    }
                    if (x + stepSize / 2 < size) {
                        sum += heightMap[z * size + x + stepSize / 2];
                        count++;
                    }
                    if (z - stepSize / 2 >= 0) {
                        sum += heightMap[(z - stepSize / 2) * size + x];
                        count++;
                    }
                    if (z + stepSize / 2 < size) {
                        sum += heightMap[(z + stepSize / 2) * size + x];
                        count++;
                    }

                    if (count > 0) {
                        heightMap[z * size + x] = sum / count + (Math.random() - 0.5) * roughness * weight;
                    }
                }
            }

            stepSize /= 2;
            roughness *= 0.5;
        }
    }
}

// Additional generator stubs
class FaultLineGenerator {
    async generate(_worldX: number, _worldZ: number, _size: number, _heightMap: Float32Array, _scale: number, _weight: number): Promise<void> {
        // Fault line displacement implementation
        // Placeholder
    }
}

class HydraulicErosionGenerator {
    async generate(_worldX: number, _worldZ: number, _size: number, _heightMap: Float32Array, _scale: number, _weight: number): Promise<void> {
        // Hydraulic erosion implementation
        // Placeholder
    }
}

class SplatMapGenerator {
    generate(_chunk: TerrainChunk): BlendMap {
        // Splat map generation
        return { textures: [], weights: new Float32Array(0) };
    }
}

class TriplanarTextureGenerator {
    generate(_chunk: TerrainChunk): BlendMap {
        // Triplanar texture mapping
        return { textures: [], weights: new Float32Array(0) };
    }
}

class BiomeBlendGenerator {
    generate(_chunk: TerrainChunk): BlendMap {
        // Biome-based texture blending
        return { textures: [], weights: new Float32Array(0) };
    }
}

// Deformation tools
class RaiseLowerTool implements TerrainDeformationTool {
    apply(chunk: TerrainChunk, deformation: TerrainDeformation): void {
        this.applyBrush(chunk, deformation, (distance, strength) => strength * (1 - distance));
    }

    private applyBrush(chunk: TerrainChunk, deformation: TerrainDeformation, brushFunction: (distance: number, strength: number) => number): void {
        const startX = Math.max(0, Math.floor(deformation.position[0] - deformation.radius));
        const endX = Math.min(chunk.heightMap.length / (chunk.coord[1] + 1) - 1, Math.floor(deformation.position[0] + deformation.radius));
        const startZ = Math.max(0, Math.floor(deformation.position[2] - deformation.radius));
        const endZ = Math.min(chunk.heightMap.length / (chunk.coord[0] + 1) - 1, Math.floor(deformation.position[2] + deformation.radius));

        for (let z = startZ; z <= endZ; z++) {
            for (let x = startX; x <= endX; x++) {
                const dx = x - deformation.position[0];
                const dz = z - deformation.position[2];
                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance <= deformation.radius) {
                    const normalizedDistance = distance / deformation.radius;
                    const brushValue = brushFunction(normalizedDistance, deformation.strength);

                    const index = z * (chunk.coord[0] + 1) + x;
                    chunk.heightMap[index] += brushValue;
                }
            }
        }
    }
}

class FlattenTool implements TerrainDeformationTool {
    apply(chunk: TerrainChunk, deformation: TerrainDeformation): void {
        // Flatten to target height
        const targetHeight = deformation.parameters?.targetHeight || deformation.position[1];

        const startX = Math.max(0, Math.floor(deformation.position[0] - deformation.radius));
        const endX = Math.min(chunk.heightMap.length / (chunk.coord[1] + 1) - 1, Math.floor(deformation.position[0] + deformation.radius));
        const startZ = Math.max(0, Math.floor(deformation.position[2] - deformation.radius));
        const endZ = Math.min(chunk.heightMap.length / (chunk.coord[0] + 1) - 1, Math.floor(deformation.position[2] + deformation.radius));

        for (let z = startZ; z <= endZ; z++) {
            for (let x = startX; x <= endX; x++) {
                const dx = x - deformation.position[0];
                const dz = z - deformation.position[2];
                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance <= deformation.radius) {
                    const index = z * (chunk.coord[0] + 1) + x;
                    const currentHeight = chunk.heightMap[index];
                    const heightDiff = targetHeight - currentHeight;
                    const falloff = 1 - (distance / deformation.radius);

                    chunk.heightMap[index] += heightDiff * falloff * deformation.strength;
                }
            }
        }
    }
}

class SmoothTool implements TerrainDeformationTool {
    apply(chunk: TerrainChunk, deformation: TerrainDeformation): void {
        // Smooth terrain by averaging neighboring heights
        const tempMap = new Float32Array(chunk.heightMap.length);
        tempMap.set(chunk.heightMap);

        const startX = Math.max(1, Math.floor(deformation.position[0] - deformation.radius));
        const endX = Math.min(chunk.heightMap.length / (chunk.coord[1] + 1) - 2, Math.floor(deformation.position[0] + deformation.radius));
        const startZ = Math.max(1, Math.floor(deformation.position[2] - deformation.radius));
        const endZ = Math.min(chunk.heightMap.length / (chunk.coord[0] + 1) - 2, Math.floor(deformation.position[2] + deformation.radius));

        for (let z = startZ; z <= endZ; z++) {
            for (let x = startX; x <= endX; x++) {
                const dx = x - deformation.position[0];
                const dz = z - deformation.position[2];
                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance <= deformation.radius) {
                    const index = z * (chunk.coord[0] + 1) + x;
                    const neighbors = [
                        tempMap[index - 1], // Left
                        tempMap[index + 1], // Right
                        tempMap[index - (chunk.coord[0] + 1)], // Up
                        tempMap[index + (chunk.coord[0] + 1)]  // Down
                    ];

                    const average = neighbors.reduce((sum, val) => sum + val, 0) / neighbors.length;
                    const falloff = 1 - (distance / deformation.radius);

                    chunk.heightMap[index] = chunk.heightMap[index] * (1 - falloff * deformation.strength) + average * falloff * deformation.strength;
                }
            }
        }
    }
}

class NoiseTool implements TerrainDeformationTool {
    apply(chunk: TerrainChunk, deformation: TerrainDeformation): void {
        const startX = Math.max(0, Math.floor(deformation.position[0] - deformation.radius));
        const endX = Math.min(chunk.heightMap.length / (chunk.coord[1] + 1) - 1, Math.floor(deformation.position[0] + deformation.radius));
        const startZ = Math.max(0, Math.floor(deformation.position[2] - deformation.radius));
        const endZ = Math.min(chunk.heightMap.length / (chunk.coord[0] + 1) - 1, Math.floor(deformation.position[2] + deformation.radius));

        for (let z = startZ; z <= endZ; z++) {
            for (let x = startX; x <= endX; x++) {
                const dx = x - deformation.position[0];
                const dz = z - deformation.position[2];
                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance <= deformation.radius) {
                    const noise = (Math.random() - 0.5) * 2;
                    const falloff = 1 - (distance / deformation.radius);

                    const index = z * (chunk.coord[0] + 1) + x;
                    chunk.heightMap[index] += noise * falloff * deformation.strength;
                }
            }
        }
    }
}

class ThermalErosionTool implements TerrainDeformationTool {
    apply(_chunk: TerrainChunk, _deformation: TerrainDeformation): void {
        // Apply thermal erosion simulation
        // This would simulate material sliding down slopes
        // Placeholder implementation
    }
}

// Simulator classes
class ErosionSimulator {
    simulate(_chunk: TerrainChunk, _deltaTime: number): void {
        // Hydraulic erosion simulation
        // Placeholder
    }
}

class WeatheringSimulator {
    simulate(_chunk: TerrainChunk, _deltaTime: number): void {
        // Chemical weathering simulation
        // Placeholder
    }
}

class ThermalErosion {
    simulate(_chunk: TerrainChunk, _deltaTime: number): void {
        // Thermal erosion simulation
        // Placeholder
    }
}

class TerrainRenderer {
    createRenderData(_chunk: TerrainChunk): any {
        // Create vertex buffers, index buffers, etc.
        return {};
    }

    destroyRenderData(_renderData: any): void {
        // Clean up render data
    }

    render(_chunks: TerrainChunk[], _vegetationInstances: VegetationInstance[], _camera: any, _projectionMatrix: Mat4, _viewMatrix: Mat4): void {
        // Render terrain chunks and vegetation
    }
}

class TerrainNormalCalculator {
    calculateNormals(chunk: TerrainChunk): void {
        // Calculate surface normals from height map
        const size = Math.sqrt(chunk.heightMap.length);

        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {
                // Calculate normal using central difference
                const heightL = x > 0 ? chunk.heightMap[z * size + x - 1] : chunk.heightMap[z * size + x];
                const heightR = x < size - 1 ? chunk.heightMap[z * size + x + 1] : chunk.heightMap[z * size + x];
                const heightU = z > 0 ? chunk.heightMap[(z - 1) * size + x] : chunk.heightMap[z * size + x];
                const heightD = z < size - 1 ? chunk.heightMap[(z + 1) * size + x] : chunk.heightMap[z * size + x];

                const normal = Vec3.fromValues(
                    heightL - heightR,
                    2.0, // Height scale factor
                    heightU - heightD
                );

                Vec3.normalize(normal, normal);

                const normalIndex = (z * size + x) * 3;
                chunk.normalMap[normalIndex] = normal[0];
                chunk.normalMap[normalIndex + 1] = normal[1];
                chunk.normalMap[normalIndex + 2] = normal[2];
            }
        }
    }
}

class LODSelector {
    selectLOD(distance: number, lodDistances: number[]): number {
        for (let i = 0; i < lodDistances.length; i++) {
            if (distance < lodDistances[i]) {
                return i;
            }
        }
        return lodDistances.length;
    }
}

