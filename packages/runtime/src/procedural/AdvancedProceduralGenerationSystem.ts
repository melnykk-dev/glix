import { Vec2, Vec3 } from '../math';

/**
 * Advanced Procedural Generation System with world generation, terrain synthesis,
 * structure placement, biome systems, and content generation algorithms.
 */
export class AdvancedProceduralGenerationSystem {
    private noiseGenerators: Map<string, NoiseGenerator> = new Map();
    private biomeGenerators: Map<string, BiomeGenerator> = new Map();
    private structureGenerators: Map<string, StructureGenerator> = new Map();

    // World generation
    private worldConfig: WorldConfig;
    private chunkSize: number = 64;
    private worldSeed: number = 0;
    private generatedChunks: Map<string, GeneratedChunk> = new Map();

    // Terrain synthesis
    private heightMapGenerator: HeightMapGenerator;
    private vegetationPlacer: VegetationPlacer;

    // Structure placement
    private settlementGenerator: SettlementGenerator;
    private dungeonGenerator: DungeonGenerator;

    // Biome system
    private biomeBlender: BiomeBlender;
    private climateSimulator: ClimateSimulator;
    private ecosystemSimulator: EcosystemSimulator;

    // Content generation
    private lootGenerator: LootGenerator;
    private npcGenerator: NPCGenerator;
    private questGenerator: QuestGenerator;

    // Performance optimization
    private generationCache: Map<string, any> = new Map();
    private asyncGenerator: AsyncGenerator;
    private levelOfDetail: Map<string, number> = new Map();

    // Debug and visualization
    private generationStats: GenerationStats = {
        chunksGenerated: 0,
        structuresPlaced: 0,
        objectsCreated: 0,
        generationTime: 0,
        cacheHits: 0,
        cacheMisses: 0
    };

    constructor(worldConfig: WorldConfig) {
        this.worldConfig = worldConfig;
        this.worldSeed = worldConfig.seed || Math.random() * 1000000;

        // Initialize core generators
        this.heightMapGenerator = new HeightMapGenerator(this.worldSeed);
        this.vegetationPlacer = new VegetationPlacer();
        this.settlementGenerator = new SettlementGenerator();
        this.dungeonGenerator = new DungeonGenerator();
        this.biomeBlender = new BiomeBlender();
        this.climateSimulator = new ClimateSimulator();
        this.ecosystemSimulator = new EcosystemSimulator();
        this.lootGenerator = new LootGenerator();
        this.npcGenerator = new NPCGenerator();
        this.questGenerator = new QuestGenerator();
        this.asyncGenerator = new AsyncGenerator();

        this.initializeNoiseGenerators();
        this.initializeBiomeGenerators();
        this.initializeStructureGenerators();

        console.log('[AdvancedProceduralGenerationSystem] Advanced procedural generation system initialized');
    }

    private initializeNoiseGenerators(): void {
        // Perlin noise
        this.noiseGenerators.set('perlin', new PerlinNoiseGenerator(this.worldSeed));

        // Simplex noise
        this.noiseGenerators.set('simplex', new SimplexNoiseGenerator(this.worldSeed));

        // Worley noise
        this.noiseGenerators.set('worley', new WorleyNoiseGenerator(this.worldSeed));

        // Fractal noise
        this.noiseGenerators.set('fractal', new FractalNoiseGenerator(this.worldSeed, 4, 0.5));

        // Ridged noise
        this.noiseGenerators.set('ridged', new RidgedNoiseGenerator(this.worldSeed));

        // Billow noise
        this.noiseGenerators.set('billow', new BillowNoiseGenerator(this.worldSeed));
    }

    private initializeBiomeGenerators(): void {
        // Desert biome
        this.biomeGenerators.set('desert', new BiomeGenerator({
            name: 'desert',
            temperature: 0.8,
            humidity: 0.2,
            terrainHeight: 0.3,
            vegetationDensity: 0.1,
            colorPalette: ['#C2B280', '#D2B48C', '#F4A460']
        }));

        // Forest biome
        this.biomeGenerators.set('forest', new BiomeGenerator({
            name: 'forest',
            temperature: 0.5,
            humidity: 0.8,
            terrainHeight: 0.6,
            vegetationDensity: 0.9,
            colorPalette: ['#228B22', '#32CD32', '#006400']
        }));

        // Mountain biome
        this.biomeGenerators.set('mountain', new BiomeGenerator({
            name: 'mountain',
            temperature: 0.3,
            humidity: 0.4,
            terrainHeight: 0.9,
            vegetationDensity: 0.3,
            colorPalette: ['#696969', '#A9A9A9', '#D3D3D3']
        }));

        // Ocean biome
        this.biomeGenerators.set('ocean', new BiomeGenerator({
            name: 'ocean',
            temperature: 0.6,
            humidity: 1.0,
            terrainHeight: 0.0,
            vegetationDensity: 0.0,
            colorPalette: ['#000080', '#0000CD', '#4169E1']
        }));

        // Tundra biome
        this.biomeGenerators.set('tundra', new BiomeGenerator({
            name: 'tundra',
            temperature: 0.1,
            humidity: 0.3,
            terrainHeight: 0.4,
            vegetationDensity: 0.2,
            colorPalette: ['#F0F8FF', '#E6E6FA', '#DCDCDC']
        }));
    }

    private initializeStructureGenerators(): void {
        // Village generator
        this.structureGenerators.set('village', new StructureGenerator({
            name: 'village',
            type: 'settlement',
            minSize: 10,
            maxSize: 50,
            placementRules: ['flat_terrain', 'near_water', 'avoid_mountains']
        }));

        // Castle generator
        this.structureGenerators.set('castle', new StructureGenerator({
            name: 'castle',
            type: 'fortification',
            minSize: 20,
            maxSize: 100,
            placementRules: ['mountain_top', 'strategic_position', 'defensible']
        }));

        // Dungeon generator
        this.structureGenerators.set('dungeon', new StructureGenerator({
            name: 'dungeon',
            type: 'underground',
            minSize: 15,
            maxSize: 80,
            placementRules: ['underground', 'near_settlement', 'mysterious']
        }));

        // Temple generator
        this.structureGenerators.set('temple', new StructureGenerator({
            name: 'temple',
            type: 'religious',
            minSize: 8,
            maxSize: 25,
            placementRules: ['sacred_site', 'mountain_peak', 'natural_wonder']
        }));

        // Ruins generator
        this.structureGenerators.set('ruins', new StructureGenerator({
            name: 'ruins',
            type: 'historical',
            minSize: 12,
            maxSize: 40,
            placementRules: ['ancient_site', 'buried_treasure', 'mysterious']
        }));
    }

    // World generation
    async generateWorld(): Promise<GeneratedWorld> {
        const startTime = performance.now();

        console.log('[AdvancedProceduralGenerationSystem] Starting world generation...');

        const world: GeneratedWorld = {
            seed: this.worldSeed,
            size: this.worldConfig.size,
            chunks: new Map(),
            biomes: new Map(),
            structures: [],
            metadata: {}
        };

        // Generate terrain
        await this.generateTerrain(world);

        // Generate biomes
        await this.generateBiomes(world);

        // Place structures
        await this.placeStructures(world);

        // Generate content
        await this.generateContent(world);

        const generationTime = performance.now() - startTime;
        this.generationStats.generationTime = generationTime;

        console.log(`[AdvancedProceduralGenerationSystem] World generation completed in ${generationTime.toFixed(2)}ms`);
        console.log(`[AdvancedProceduralGenerationSystem] Generated ${world.chunks.size} chunks, ${world.structures.length} structures`);

        return world;
    }

    private async generateTerrain(world: GeneratedWorld): Promise<void> {
        const chunksToGenerate = this.calculateChunksToGenerate(world.size);

        for (const chunkCoord of chunksToGenerate) {
            await this.generateChunk(chunkCoord, world);
        }
    }

    private async generateChunk(chunkCoord: Vec2, world: GeneratedWorld): Promise<void> {
        const cacheKey = `${chunkCoord[0]}_${chunkCoord[1]}`;

        // Check cache first
        if (this.generationCache.has(cacheKey)) {
            this.generationStats.cacheHits++;
            world.chunks.set(cacheKey, this.generationCache.get(cacheKey));
            return;
        }

        this.generationStats.cacheMisses++;

        const chunk: GeneratedChunk = {
            coord: Vec2.clone(chunkCoord),
            heightMap: new Float32Array(this.chunkSize * this.chunkSize),
            biomeMap: new Uint8Array(this.chunkSize * this.chunkSize),
            vegetationMap: new Uint8Array(this.chunkSize * this.chunkSize),
            structureMap: new Uint8Array(this.chunkSize * this.chunkSize),
            objects: [],
            metadata: {}
        };

        // Generate height map
        this.heightMapGenerator.generateHeightMap(
            chunk.coord[0] * this.chunkSize,
            chunk.coord[1] * this.chunkSize,
            this.chunkSize,
            chunk.heightMap
        );

        // Generate biome map (will be refined later)
        this.generateBiomeMap(chunk);

        // Generate vegetation
        this.vegetationPlacer.placeVegetation(chunk);

        // Cache the chunk
        this.generationCache.set(cacheKey, chunk);
        world.chunks.set(cacheKey, chunk);

        this.generationStats.chunksGenerated++;
    }

    private generateBiomeMap(chunk: GeneratedChunk): void {
        const perlinNoise = this.noiseGenerators.get('perlin')!;
        const simplexNoise = this.noiseGenerators.get('simplex')!;

        for (let y = 0; y < this.chunkSize; y++) {
            for (let x = 0; x < this.chunkSize; x++) {
                const worldX = chunk.coord[0] * this.chunkSize + x;
                const worldY = chunk.coord[1] * this.chunkSize + y;

                // Use multiple noise functions for biome determination
                const temperature = perlinNoise.noise(worldX * 0.001, worldY * 0.001, 0);
                const humidity = simplexNoise.noise(worldX * 0.0008, worldY * 0.0008, 100);

                // Determine biome based on temperature and humidity
                let biomeIndex = 0;
                if (temperature > 0.6 && humidity < 0.3) biomeIndex = 0; // Desert
                else if (temperature > 0.3 && humidity > 0.6) biomeIndex = 1; // Forest
                else if (temperature < 0.4 && chunk.heightMap[y * this.chunkSize + x] > 0.7) biomeIndex = 2; // Mountain
                else if (chunk.heightMap[y * this.chunkSize + x] < 0.1) biomeIndex = 3; // Ocean
                else if (temperature < 0.2) biomeIndex = 4; // Tundra
                else biomeIndex = 1; // Default to forest

                chunk.biomeMap[y * this.chunkSize + x] = biomeIndex;
            }
        }
    }

    private async generateBiomes(world: GeneratedWorld): Promise<void> {
        // Refine biome placement with additional analysis
        for (const [chunkKey, chunk] of world.chunks) {
            this.biomeBlender.blendBiomes(chunk);

            // Generate biome-specific features
            const biomeCounts = new Map<number, number>();
            for (const biomeId of chunk.biomeMap) {
                biomeCounts.set(biomeId, (biomeCounts.get(biomeId) || 0) + 1);
            }

            // Store biome information
            world.biomes.set(chunkKey, {
                primaryBiome: this.getMostCommonBiome(biomeCounts),
                biomeDistribution: biomeCounts,
                climate: this.climateSimulator.simulateClimate(chunk.coord),
                ecosystem: this.ecosystemSimulator.simulateEcosystem(chunk)
            });
        }
    }

    private getMostCommonBiome(biomeCounts: Map<number, number>): string {
        let maxCount = 0;
        let mostCommon = 'forest';

        for (const [biomeId, count] of biomeCounts) {
            if (count > maxCount) {
                maxCount = count;
                mostCommon = this.getBiomeName(biomeId);
            }
        }

        return mostCommon;
    }

    private getBiomeName(biomeId: number): string {
        const biomeNames = ['desert', 'forest', 'mountain', 'ocean', 'tundra'];
        return biomeNames[biomeId] || 'forest';
    }

    private async placeStructures(world: GeneratedWorld): Promise<void> {
        // Place settlements
        await this.placeSettlements(world);

        // Place dungeons
        await this.placeDungeons(world);

        // Place temples and ruins
        await this.placeSpecialStructures(world);

        // Place natural structures
        await this.placeNaturalStructures(world);
    }

    private async placeSettlements(world: GeneratedWorld): Promise<void> {
        const settlementCandidates = this.findSettlementCandidates(world);

        for (const candidate of settlementCandidates) {
            if (Math.random() < 0.3) { // 30% chance to place settlement
                const settlement = this.settlementGenerator.generateSettlement(candidate);
                world.structures.push(settlement);
                this.generationStats.structuresPlaced++;
            }
        }
    }

    private findSettlementCandidates(world: GeneratedWorld): Vec2[] {
        const candidates: Vec2[] = [];

        for (const chunk of world.chunks.values()) {
            for (let y = 0; y < this.chunkSize; y++) {
                for (let x = 0; x < this.chunkSize; x++) {
                    const height = chunk.heightMap[y * this.chunkSize + x];
                    const biome = chunk.biomeMap[y * this.chunkSize + x];

                    // Look for flat areas in forest or plains biomes
                    if (height > 0.2 && height < 0.7 && (biome === 1)) { // Forest biome
                        candidates.push(Vec2.fromValues(
                            chunk.coord[0] * this.chunkSize + x,
                            chunk.coord[1] * this.chunkSize + y
                        ));
                    }
                }
            }
        }

        return candidates;
    }

    private async placeDungeons(world: GeneratedWorld): Promise<void> {
        const dungeonCandidates = this.findDungeonCandidates(world);

        for (const candidate of dungeonCandidates) {
            if (Math.random() < 0.1) { // 10% chance to place dungeon
                const dungeon = this.dungeonGenerator.generateDungeon(candidate);
                world.structures.push(dungeon);
                this.generationStats.structuresPlaced++;
            }
        }
    }

    private findDungeonCandidates(world: GeneratedWorld): Vec2[] {
        const candidates: Vec2[] = [];

        for (const chunk of world.chunks.values()) {
            for (let y = 0; y < this.chunkSize; y++) {
                for (let x = 0; x < this.chunkSize; x++) {
                    const height = chunk.heightMap[y * this.chunkSize + x];
                    const biome = chunk.biomeMap[y * this.chunkSize + x];

                    // Look for mountainous or mysterious areas
                    if (height > 0.6 && biome === 2) { // Mountain biome
                        candidates.push(Vec2.fromValues(
                            chunk.coord[0] * this.chunkSize + x,
                            chunk.coord[1] * this.chunkSize + y
                        ));
                    }
                }
            }
        }

        return candidates;
    }

    private async placeSpecialStructures(world: GeneratedWorld): Promise<void> {
        // Place temples on mountain peaks
        const templeCandidates = this.findTempleCandidates(world);

        for (const candidate of templeCandidates) {
            if (Math.random() < 0.05) { // 5% chance
                const temple = this.structureGenerators.get('temple')!.generate(candidate);
                world.structures.push(temple);
                this.generationStats.structuresPlaced++;
            }
        }

        // Place ruins in various locations
        const ruinCandidates = this.findRuinCandidates(world);

        for (const candidate of ruinCandidates) {
            if (Math.random() < 0.08) { // 8% chance
                const ruins = this.structureGenerators.get('ruins')!.generate(candidate);
                world.structures.push(ruins);
                this.generationStats.structuresPlaced++;
            }
        }
    }

    private findTempleCandidates(world: GeneratedWorld): Vec2[] {
        const candidates: Vec2[] = [];

        for (const chunk of world.chunks.values()) {
            for (let y = 0; y < this.chunkSize; y++) {
                for (let x = 0; x < this.chunkSize; x++) {
                    const height = chunk.heightMap[y * this.chunkSize + x];

                    if (height > 0.8) { // Mountain peaks
                        candidates.push(Vec2.fromValues(
                            chunk.coord[0] * this.chunkSize + x,
                            chunk.coord[1] * this.chunkSize + y
                        ));
                    }
                }
            }
        }

        return candidates;
    }

    private findRuinCandidates(world: GeneratedWorld): Vec2[] {
        const candidates: Vec2[] = [];

        for (const chunk of world.chunks.values()) {
            for (let y = 0; y < this.chunkSize; y++) {
                for (let x = 0; x < this.chunkSize; x++) {
                    if (Math.random() < 0.001) { // Random distribution
                        candidates.push(Vec2.fromValues(
                            chunk.coord[0] * this.chunkSize + x,
                            chunk.coord[1] * this.chunkSize + y
                        ));
                    }
                }
            }
        }

        return candidates;
    }

    private async placeNaturalStructures(_world: GeneratedWorld): Promise<void> {
        // Generate natural features like caves, lakes, forests, etc.
        // This would include additional procedural generation algorithms
    }

    private async generateContent(world: GeneratedWorld): Promise<void> {
        // Generate loot in structures
        for (const structure of world.structures) {
            if (structure.type === 'dungeon' || structure.type === 'ruins') {
                this.lootGenerator.generateLoot(structure);
            }
        }

        // Generate NPCs
        await this.generateNPCs(world);

        // Generate quests
        this.questGenerator.generateQuests(world);
    }

    private async generateNPCs(world: GeneratedWorld): Promise<void> {
        for (const structure of world.structures) {
            if (structure.type === 'settlement') {
                const npcCount = Math.floor(Math.random() * 10) + 5; // 5-15 NPCs per settlement
                for (let i = 0; i < npcCount; i++) {
                    const npc = this.npcGenerator.generateNPC(structure.position);
                    structure.objects.push(npc as unknown as GeneratedObject);
                    this.generationStats.objectsCreated++;
                }
            }
        }
    }

    private calculateChunksToGenerate(worldSize: Vec2): Vec2[] {
        const chunks: Vec2[] = [];

        const minChunkX = Math.floor(-worldSize[0] / 2 / this.chunkSize);
        const maxChunkX = Math.floor(worldSize[0] / 2 / this.chunkSize);
        const minChunkY = Math.floor(-worldSize[1] / 2 / this.chunkSize);
        const maxChunkY = Math.floor(worldSize[1] / 2 / this.chunkSize);

        for (let x = minChunkX; x <= maxChunkX; x++) {
            for (let y = minChunkY; y <= maxChunkY; y++) {
                chunks.push(Vec2.fromValues(x, y));
            }
        }

        return chunks;
    }

    // Dynamic generation
    async generateChunkAt(coord: Vec2): Promise<GeneratedChunk | null> {
        const cacheKey = `${coord[0]}_${coord[1]}`;

        if (this.generatedChunks.has(cacheKey)) {
            return this.generatedChunks.get(cacheKey)!;
        }

        // Check if LOD allows generation
        const lod = this.levelOfDetail.get(cacheKey) || 1;
        if (lod < 0.5) return null; // Too far, don't generate

        const world: GeneratedWorld = { seed: this.worldConfig.seed || Date.now(), size: this.worldConfig.size, chunks: new Map(), biomes: new Map(), structures: [], metadata: {} };
        await this.generateChunk(coord, world);

        const chunk = world.chunks.get(cacheKey);
        if (chunk) {
            this.generatedChunks.set(cacheKey, chunk);
        }

        return chunk || null;
    }

    // Noise generation utilities
    generateNoise(type: string, x: number, y: number, z: number = 0): number {
        const generator = this.noiseGenerators.get(type);
        if (!generator) return 0;

        return generator.noise(x, y, z);
    }

    // Terrain modification
    modifyTerrain(chunkCoord: Vec2, modifications: TerrainModification[]): void {
        const chunkKey = `${chunkCoord[0]}_${chunkCoord[1]}`;
        const chunk = this.generatedChunks.get(chunkKey);

        if (!chunk) return;

        for (const modification of modifications) {
            this.applyTerrainModification(chunk, modification);
        }
    }

    private applyTerrainModification(chunk: GeneratedChunk, modification: TerrainModification): void {
        const { position, radius, strength, type } = modification;

        const startX = Math.max(0, Math.floor(position[0] - radius));
        const endX = Math.min(this.chunkSize - 1, Math.floor(position[0] + radius));
        const startY = Math.max(0, Math.floor(position[1] - radius));
        const endY = Math.min(this.chunkSize - 1, Math.floor(position[1] + radius));

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                const dx = x - position[0];
                const dy = y - position[1];
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= radius) {
                    const index = y * this.chunkSize + x;
                    const falloff = 1 - (distance / radius);

                    switch (type) {
                        case 'raise':
                            chunk.heightMap[index] += strength * falloff;
                            break;
                        case 'lower':
                            chunk.heightMap[index] -= strength * falloff;
                            break;
                        case 'flatten':
                            chunk.heightMap[index] = strength;
                            break;
                        case 'smooth':
                            // Implement smoothing algorithm
                            break;
                    }
                }
            }
        }
    }

    // Biome manipulation
    changeBiome(chunkCoord: Vec2, position: Vec2, newBiome: string, radius: number): void {
        const chunkKey = `${chunkCoord[0]}_${chunkCoord[1]}`;
        const chunk = this.generatedChunks.get(chunkKey);

        if (!chunk) return;

        const biomeId = this.getBiomeId(newBiome);
        const startX = Math.max(0, Math.floor(position[0] - radius));
        const endX = Math.min(this.chunkSize - 1, Math.floor(position[0] + radius));
        const startY = Math.max(0, Math.floor(position[1] - radius));
        const endY = Math.min(this.chunkSize - 1, Math.floor(position[1] + radius));

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                const dx = x - position[0];
                const dy = y - position[1];
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= radius) {
                    chunk.biomeMap[y * this.chunkSize + x] = biomeId;
                }
            }
        }
    }

    private getBiomeId(biomeName: string): number {
        const biomeIds: { [key: string]: number } = {
            'desert': 0,
            'forest': 1,
            'mountain': 2,
            'ocean': 3,
            'tundra': 4
        };
        return biomeIds[biomeName] || 1;
    }

    // Structure placement
    placeStructure(structureType: string, position: Vec3): GeneratedStructure | null {
        const generator = this.structureGenerators.get(structureType);
        if (!generator) return null;

        const structure = generator.generate(position);
        this.generationStats.structuresPlaced++;

        // Add to appropriate chunk
        const chunkCoord = Vec2.fromValues(
            Math.floor(position[0] / this.chunkSize),
            Math.floor(position[2] / this.chunkSize)
        );

        const chunkKey = `${chunkCoord[0]}_${chunkCoord[1]}`;
        const chunk = this.generatedChunks.get(chunkKey);

        if (chunk) {
            chunk.objects.push(structure as unknown as GeneratedObject);
        }

        return structure;
    }

    // Content generation
    generateLoot(lootConfig: LootConfig): GeneratedLoot[] {
        return this.lootGenerator.generateLootForConfig(lootConfig);
    }

    generateNPC(npcType: string, position: Vec3): GeneratedNPC | null {
        return this.npcGenerator.generateNPCOfType(npcType, position);
    }

    generateQuest(questType: string, context: any): GeneratedQuest | null {
        return this.questGenerator.generateQuestOfType(questType, context);
    }

    // Async generation
    async generateWorldAsync(onProgress?: (progress: number) => void): Promise<GeneratedWorld> {
        return this.asyncGenerator.generateWorldAsync(this, onProgress);
    }

    // Caching and optimization
    preloadChunks(coords: Vec2[], priority: number = 1): void {
        for (const coord of coords) {
            this.asyncGenerator.queueChunk(coord, priority);
        }
    }

    clearCache(): void {
        this.generationCache.clear();
        this.generatedChunks.clear();
        console.log('[AdvancedProceduralGenerationSystem] Cache cleared');
    }

    setCacheSize(maxSize: number): void {
        // Implement LRU cache with size limit
        console.log(`[AdvancedProceduralGenerationSystem] Cache size set to ${maxSize}`);
    }

    // Level of detail
    updateLevelOfDetail(cameraPosition: Vec3, viewDistance: number): void {
        for (const [chunkKey, chunk] of this.generatedChunks) {
            const chunkCenter = Vec3.fromValues(
                chunk.coord[0] * this.chunkSize + this.chunkSize / 2,
                0,
                chunk.coord[1] * this.chunkSize + this.chunkSize / 2
            );

            const distance = Vec3.distance(cameraPosition, chunkCenter);
            const lod = Math.max(0.1, Math.min(1.0, viewDistance / distance));

            this.levelOfDetail.set(chunkKey, lod);
        }
    }

    // Debug and analysis
    getGenerationStats(): GenerationStats {
        return { ...this.generationStats };
    }

    enableDebugMode(enabled: boolean): void {
        console.log(`[AdvancedProceduralGenerationSystem] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    getDebugInfo(): any {
        return {
            worldSeed: this.worldSeed,
            chunkSize: this.chunkSize,
            generatedChunks: this.generatedChunks.size,
            cachedChunks: this.generationCache.size,
            structuresPlaced: this.generationStats.structuresPlaced,
            objectsCreated: this.generationStats.objectsCreated,
            cacheEfficiency: this.generationStats.cacheHits /
                (this.generationStats.cacheHits + this.generationStats.cacheMisses),
            averageGenerationTime: this.generationStats.generationTime / Math.max(1, this.generationStats.chunksGenerated)
        };
    }

    // Export/Import
    exportWorld(world: GeneratedWorld): string {
        return JSON.stringify({
            seed: world.seed,
            size: world.size,
            chunks: Array.from(world.chunks.entries()),
            biomes: Array.from(world.biomes.entries()),
            structures: world.structures,
            metadata: world.metadata
        });
    }

    importWorld(data: string): GeneratedWorld {
        const parsed = JSON.parse(data);
        const world: GeneratedWorld = {
            seed: parsed.seed,
            size: parsed.size,
            chunks: new Map(parsed.chunks),
            biomes: new Map(parsed.biomes),
            structures: parsed.structures,
            metadata: parsed.metadata
        };

        // Restore chunks to cache
        for (const [key, chunk] of world.chunks) {
            this.generatedChunks.set(key, chunk);
            this.generationCache.set(key, chunk);
        }

        return world;
    }

    // Cleanup
    dispose(): void {
        this.noiseGenerators.clear();
        this.biomeGenerators.clear();
        this.structureGenerators.clear();
        this.generationCache.clear();
        this.generatedChunks.clear();
        this.levelOfDetail.clear();

        console.log('[AdvancedProceduralGenerationSystem] Disposed');
    }
}

// Supporting classes and interfaces
interface WorldConfig {
    seed?: number;
    size: Vec2;
    biomeCount?: number;
    structureDensity?: number;
    terrainRoughness?: number;
}

interface GeneratedWorld {
    seed: number;
    size: Vec2;
    chunks: Map<string, GeneratedChunk>;
    biomes: Map<string, BiomeInfo>;
    structures: GeneratedStructure[];
    metadata: any;
}

interface GeneratedChunk {
    coord: Vec2;
    heightMap: Float32Array;
    biomeMap: Uint8Array;
    vegetationMap: Uint8Array;
    structureMap: Uint8Array;
    objects: GeneratedObject[];
    metadata: any;
}

interface BiomeInfo {
    primaryBiome: string;
    biomeDistribution: Map<number, number>;
    climate: ClimateData;
    ecosystem: EcosystemData;
}

interface ClimateData {
    temperature: number;
    humidity: number;
    precipitation: number;
    windSpeed: number;
}

interface EcosystemData {
    biodiversity: number;
    predatorCount: number;
    preyCount: number;
    vegetationDensity: number;
}

interface GeneratedStructure {
    id: string;
    type: string;
    position: Vec3;
    size: Vec3;
    rotation: number;
    objects: GeneratedObject[];
    metadata: any;
}

interface GeneratedObject {
    id: string;
    type: string;
    position: Vec3;
    rotation?: Vec3 | number;
    scale?: Vec3;
    properties?: any;
}

interface TerrainModification {
    position: Vec2;
    radius: number;
    strength: number;
    type: 'raise' | 'lower' | 'flatten' | 'smooth';
}

interface LootConfig {
    level: number;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    type: string;
    count: number;
}

interface GeneratedLoot {
    id: string;
    type: string;
    rarity: string;
    value: number;
    properties: any;
}

interface GeneratedNPC {
    id: string;
    type: string;
    position: Vec3;
    personality: any;
    inventory: any[];
    dialogue: string[];
}

interface GeneratedQuest {
    id: string;
    type: string;
    title: string;
    description: string;
    objectives: QuestObjective[];
    rewards: QuestReward[];
}

interface QuestObjective {
    type: string;
    target: string;
    count: number;
    completed: boolean;
}

interface QuestReward {
    type: string;
    item?: string;
    experience?: number;
    gold?: number;
}

interface GenerationStats {
    chunksGenerated: number;
    structuresPlaced: number;
    objectsCreated: number;
    generationTime: number;
    cacheHits: number;
    cacheMisses: number;
}

// Core generator classes
interface NoiseGenerator {
    noise(x: number, y: number, z?: number): number;
}

class PerlinNoiseGenerator implements NoiseGenerator {
    constructor(_seed: number) {
    }

    noise(x: number, y: number, z: number = 0): number {
        // Simplified Perlin noise implementation
        return (Math.sin(x * 0.01) + Math.sin(y * 0.01) + Math.sin(z * 0.01)) * 0.33 + 0.5;
    }
}

class SimplexNoiseGenerator implements NoiseGenerator {
    constructor(_seed: number) {
    }

    noise(x: number, y: number, z: number = 0): number {
        // Simplified Simplex noise implementation
        return (Math.sin(x * 0.015) * Math.cos(y * 0.015) + Math.sin(z * 0.015)) * 0.5 + 0.5;
    }
}

class WorleyNoiseGenerator implements NoiseGenerator {
    constructor(_seed: number) {
    }

    noise(x: number, y: number, z: number = 0): number {
        // Simplified Worley noise implementation
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const iz = Math.floor(z);

        let minDist = Infinity;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const px = ix + dx + this.random(ix + dx, iy + dy, iz + dz);
                    const py = iy + dy + this.random(ix + dx, iy + dy, iz + dz + 1);
                    const pz = iz + dz + this.random(ix + dx, iy + dy, iz + dz + 2);

                    const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2);
                    minDist = Math.min(minDist, dist);
                }
            }
        }

        return minDist;
    }

    private random(x: number, y: number, z: number): number {
        const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43758.5453;
        return n - Math.floor(n);
    }
}

class FractalNoiseGenerator implements NoiseGenerator {
    private baseNoise: PerlinNoiseGenerator;
    private octaves: number;
    private persistence: number;

    constructor(seed: number, octaves: number = 4, persistence: number = 0.5) {
        this.baseNoise = new PerlinNoiseGenerator(seed);
        this.octaves = octaves;
        this.persistence = persistence;
    }

    noise(x: number, y: number, z: number = 0): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;

        for (let i = 0; i < this.octaves; i++) {
            value += this.baseNoise.noise(x * frequency, y * frequency, z * frequency) * amplitude;
            amplitude *= this.persistence;
            frequency *= 2;
        }

        return value;
    }
}

class RidgedNoiseGenerator implements NoiseGenerator {
    private baseNoise: PerlinNoiseGenerator;

    constructor(seed: number) {
        this.baseNoise = new PerlinNoiseGenerator(seed);
    }

    noise(x: number, y: number, z: number = 0): number {
        const value = Math.abs(this.baseNoise.noise(x, y, z));
        return 1 - value;
    }
}

class BillowNoiseGenerator implements NoiseGenerator {
    private baseNoise: PerlinNoiseGenerator;

    constructor(seed: number) {
        this.baseNoise = new PerlinNoiseGenerator(seed);
    }

    noise(x: number, y: number, z: number = 0): number {
        const value = Math.abs(this.baseNoise.noise(x, y, z) * 2 - 1);
        return value;
    }
}

// Terrain and biome generators
class HeightMapGenerator {
    private noiseGenerators: Map<string, NoiseGenerator> = new Map();

    constructor(seed: number) {
        this.noiseGenerators.set('base', new FractalNoiseGenerator(seed, 6, 0.6));
        this.noiseGenerators.set('detail', new FractalNoiseGenerator(seed + 1000, 3, 0.3));
        this.noiseGenerators.set('ridges', new RidgedNoiseGenerator(seed + 2000));
    }

    generateHeightMap(worldX: number, worldY: number, size: number, heightMap: Float32Array): void {
        const baseNoise = this.noiseGenerators.get('base')!;
        const detailNoise = this.noiseGenerators.get('detail')!;
        const ridgeNoise = this.noiseGenerators.get('ridges')!;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const nx = (worldX + x) * 0.005;
                const ny = (worldY + y) * 0.005;

                const baseHeight = baseNoise.noise(nx, ny);
                const detailHeight = detailNoise.noise(nx * 4, ny * 4) * 0.3;
                const ridgeHeight = ridgeNoise.noise(nx * 2, ny * 2) * 0.2;

                const height = baseHeight + detailHeight + ridgeHeight;
                heightMap[y * size + x] = Math.max(0, Math.min(1, height));
            }
        }
    }
}

class BiomeGenerator {
    private config: BiomeConfig;

    constructor(config: BiomeConfig) {
        this.config = config;
    }

    generateBiomeData(x: number, y: number): BiomeData {
        return {
            temperature: this.config.temperature + Math.sin(x * 0.01) * 0.1,
            humidity: this.config.humidity + Math.cos(y * 0.01) * 0.1,
            height: this.config.terrainHeight,
            vegetation: this.config.vegetationDensity,
            color: this.config.colorPalette[Math.floor(Math.random() * this.config.colorPalette.length)]
        };
    }
}

interface BiomeConfig {
    name: string;
    temperature: number;
    humidity: number;
    terrainHeight: number;
    vegetationDensity: number;
    colorPalette: string[];
}

interface BiomeData {
    temperature: number;
    humidity: number;
    height: number;
    vegetation: number;
    color: string;
}

class StructureGenerator {
    private config: StructureConfig;

    constructor(config: StructureConfig) {
        this.config = config;
    }

    generate(position: Vec3): GeneratedStructure {
        const size = Vec3.fromValues(
            this.config.minSize + Math.random() * (this.config.maxSize - this.config.minSize),
            1,
            this.config.minSize + Math.random() * (this.config.maxSize - this.config.minSize)
        );

        return {
            id: `${this.config.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: this.config.type,
            position: Vec3.clone(position),
            size,
            rotation: Math.random() * Math.PI * 2,
            objects: [],
            metadata: { config: this.config }
        };
    }
}

interface StructureConfig {
    name: string;
    type: string;
    minSize: number;
    maxSize: number;
    placementRules: string[];
}

// Placeholder classes for other generators

class VegetationPlacer {
    placeVegetation(_chunk: GeneratedChunk): void {
        // Vegetation placement logic
    }
}


class SettlementGenerator {
    generateSettlement(position: Vec2): GeneratedStructure {
        return {
            id: `settlement_${Date.now()}`,
            type: 'settlement',
            position: Vec3.fromValues(position[0], 0, position[1]),
            size: Vec3.fromValues(20, 1, 20),
            rotation: 0,
            objects: [],
            metadata: {}
        };
    }
}

class DungeonGenerator {
    generateDungeon(position: Vec2): GeneratedStructure {
        return {
            id: `dungeon_${Date.now()}`,
            type: 'dungeon',
            position: Vec3.fromValues(position[0], -5, position[1]),
            size: Vec3.fromValues(30, 10, 30),
            rotation: 0,
            objects: [],
            metadata: {}
        };
    }
}

class BiomeBlender {
    blendBiomes(_chunk: GeneratedChunk): void {
        // Biome blending algorithm
    }
}

class ClimateSimulator {
    simulateClimate(_position: Vec2): ClimateData {
        return {
            temperature: 0.5,
            humidity: 0.5,
            precipitation: 0.5,
            windSpeed: 0.5
        };
    }
}

class EcosystemSimulator {
    simulateEcosystem(_chunk: GeneratedChunk): EcosystemData {
        return {
            biodiversity: 0.5,
            predatorCount: 10,
            preyCount: 50,
            vegetationDensity: 0.7
        };
    }
}

class LootGenerator {
    generateLoot(_structure: GeneratedStructure): void {
        // Loot generation logic
    }

    generateLootForConfig(config: LootConfig): GeneratedLoot[] {
        const loot: GeneratedLoot[] = [];
        for (let i = 0; i < config.count; i++) {
            loot.push({
                id: `loot_${Date.now()}_${i}`,
                type: config.type,
                rarity: config.rarity,
                value: config.level * 10,
                properties: {}
            });
        }
        return loot;
    }
}

class NPCGenerator {
    generateNPC(position: Vec3): GeneratedNPC {
        return {
            id: `npc_${Date.now()}`,
            type: 'villager',
            position: Vec3.clone(position),
            personality: {},
            inventory: [],
            dialogue: ['Hello there!']
        };
    }

    generateNPCOfType(type: string, position: Vec3): GeneratedNPC {
        return {
            id: `npc_${type}_${Date.now()}`,
            type,
            position: Vec3.clone(position),
            personality: {},
            inventory: [],
            dialogue: ['Greetings!']
        };
    }
}

class QuestGenerator {
    generateQuests(_world: GeneratedWorld): void {
        // Quest generation logic
    }

    generateQuestOfType(type: string, _context: any): GeneratedQuest | null {
        return {
            id: `quest_${type}_${Date.now()}`,
            type,
            title: 'Sample Quest',
            description: 'Complete this quest',
            objectives: [],
            rewards: []
        };
    }
}

class AsyncGenerator {
    private generationQueue: { coord: Vec2; priority: number }[] = [];

    queueChunk(coord: Vec2, priority: number): void {
        this.generationQueue.push({ coord, priority });
        this.generationQueue.sort((a, b) => b.priority - a.priority);
    }

    async generateWorldAsync(system: AdvancedProceduralGenerationSystem, _onProgress?: (progress: number) => void): Promise<GeneratedWorld> {
        // Async world generation implementation
        return system.generateWorld();
    }
}
