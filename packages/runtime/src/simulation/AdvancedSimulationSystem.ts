import { Vec2, Vec3 } from '../math';
import { World } from '../core/World';
import { Entity } from '@glix/shared';

/**
 * Advanced Simulation System with weather simulation, time management,
 * ecosystem dynamics, population simulation, and environmental effects.
 */
export class AdvancedSimulationSystem {
    private eventBus: any;

    // Time management
    private gameTime: GameTime;
    private timeScale: number = 1.0;
    private paused: boolean = false;

    // Weather system
    private weatherEngine: WeatherEngine;
    private currentWeather!: WeatherState;
    private weatherHistory: WeatherState[] = [];

    // Ecosystem simulation
    private ecosystems: Map<string, Ecosystem> = new Map();
    private species: Map<string, Species> = new Map();
    private populations: Map<string, Population> = new Map();

    // Environmental effects
    private environmentalEffects: Map<string, EnvironmentalEffect> = new Map();

    // Climate and seasons
    private seasons: Map<string, Season> = new Map();

    // Resource management
    private resources: Map<string, Resource> = new Map();
    private resourceNodes: Map<string, ResourceNode> = new Map();

    // Disaster system
    private disasterEngine: DisasterEngine;
    private activeDisasters: Disaster[] = [];

    // Performance monitoring
    private simulationStats: SimulationStats = {
        updatesPerSecond: 0,
        entitiesSimulated: 0,
        weatherCalculations: 0,
        ecosystemUpdates: 0,
        timeSpent: 0
    };

    constructor(_world: World, eventBus: any) {
        this.eventBus = eventBus;

        this.gameTime = new GameTime();
        this.weatherEngine = new WeatherEngine();
        this.disasterEngine = new DisasterEngine();

        this.initializeSeasons();
        this.initializeWeather();
        this.initializeEcosystems();

        console.log('[AdvancedSimulationSystem] Advanced simulation system initialized');
    }

    private initializeSeasons(): void {
        this.seasons.set('spring', {
            name: 'spring',
            duration: 91 * 24 * 3600, // 91 days in seconds
            temperatureModifier: 0.2,
            humidityModifier: 0.3,
            precipitationModifier: 0.8,
            vegetationGrowthRate: 1.5,
            colors: ['#98FB98', '#32CD32', '#228B22']
        });

        this.seasons.set('summer', {
            name: 'summer',
            duration: 94 * 24 * 3600, // 94 days
            temperatureModifier: 0.8,
            humidityModifier: 0.2,
            precipitationModifier: 0.6,
            vegetationGrowthRate: 1.2,
            colors: ['#FFD700', '#FFA500', '#FF6347']
        });

        this.seasons.set('autumn', {
            name: 'autumn',
            duration: 89 * 24 * 3600, // 89 days
            temperatureModifier: 0.1,
            humidityModifier: 0.4,
            precipitationModifier: 1.0,
            vegetationGrowthRate: 0.5,
            colors: ['#D2691E', '#8B4513', '#CD853F']
        });

        this.seasons.set('winter', {
            name: 'winter',
            duration: 90 * 24 * 3600, // 90 days
            temperatureModifier: -0.6,
            humidityModifier: 0.6,
            precipitationModifier: 1.2,
            vegetationGrowthRate: 0.1,
            colors: ['#F0F8FF', '#E6E6FA', '#DCDCDC']
        });
    }

    private initializeWeather(): void {
        this.currentWeather = {
            temperature: 20,
            humidity: 0.5,
            precipitation: 0,
            windSpeed: 5,
            windDirection: Vec3.fromValues(1, 0, 0),
            cloudCover: 0.3,
            visibility: 1000,
            type: 'clear',
            intensity: 0,
            duration: 3600, // 1 hour
            startTime: this.gameTime.getTotalSeconds()
        };
    }

    private initializeEcosystems(): void {
        // Create sample ecosystems
        this.createEcosystem('forest', {
            name: 'forest',
            biome: 'temperate_forest',
            area: Vec2.fromValues(1000, 1000),
            species: ['deer', 'wolf', 'rabbit', 'fox', 'bear'],
            resources: ['wood', 'berries', 'mushrooms'],
            carryingCapacity: 1000,
            biodiversity: 0.8,
            stability: 0.7
        });

        this.createEcosystem('plains', {
            name: 'plains',
            biome: 'grassland',
            area: Vec2.fromValues(2000, 1500),
            species: ['buffalo', 'lion', 'zebra', 'gazelle', 'hyena'],
            resources: ['grass', 'water', 'minerals'],
            carryingCapacity: 2000,
            biodiversity: 0.6,
            stability: 0.8
        });

        // Initialize species
        this.initializeSpecies();
    }

    private initializeSpecies(): void {
        // Deer
        this.species.set('deer', {
            name: 'deer',
            type: 'herbivore',
            population: 200,
            growthRate: 0.1,
            mortalityRate: 0.05,
            reproductionRate: 0.15,
            foodRequirements: 2.0,
            waterRequirements: 1.0,
            habitatPreferences: ['forest', 'plains'],
            predators: ['wolf', 'bear'],
            prey: [],
            maxLifespan: 10,
            socialBehavior: 'herd',
            migrationPattern: 'seasonal'
        });

        // Wolf
        this.species.set('wolf', {
            name: 'wolf',
            type: 'carnivore',
            population: 50,
            growthRate: 0.05,
            mortalityRate: 0.08,
            reproductionRate: 0.08,
            foodRequirements: 5.0,
            waterRequirements: 2.0,
            habitatPreferences: ['forest', 'mountain'],
            predators: ['bear'],
            prey: ['deer', 'rabbit'],
            maxLifespan: 12,
            socialBehavior: 'pack',
            migrationPattern: 'territorial'
        });

        // Rabbit
        this.species.set('rabbit', {
            name: 'rabbit',
            type: 'herbivore',
            population: 500,
            growthRate: 0.2,
            mortalityRate: 0.1,
            reproductionRate: 0.25,
            foodRequirements: 1.0,
            waterRequirements: 0.5,
            habitatPreferences: ['plains', 'forest'],
            predators: ['wolf', 'fox'],
            prey: [],
            maxLifespan: 3,
            socialBehavior: 'colonial',
            migrationPattern: 'local'
        });

        // Initialize populations
        for (const [speciesName, species] of this.species) {
            this.populations.set(speciesName, {
                species: speciesName,
                currentCount: species.population,
                maxCount: species.population * 2,
                growthTrend: 0,
                lastUpdate: this.gameTime.getTotalSeconds()
            });
        }
    }

    update(deltaTime: number): void {
        if (this.paused) return;

        const startTime = performance.now();

        // Update game time
        this.gameTime.update(deltaTime * this.timeScale);

        // Update weather
        this.updateWeather(deltaTime);

        // Update ecosystems
        this.updateEcosystems(deltaTime);

        // Update environmental effects
        this.updateEnvironmentalEffects(deltaTime);

        // Update disasters
        this.updateDisasters(deltaTime);

        // Update resources
        this.updateResources(deltaTime);

        // Emit simulation events
        this.emitSimulationEvents();

        this.simulationStats.timeSpent = performance.now() - startTime;
    }

    private updateWeather(deltaTime: number): void {
        // Update current weather state
        this.weatherEngine.update(this.currentWeather, deltaTime);

        // Check for weather transitions
        if (this.gameTime.getTotalSeconds() - this.currentWeather.startTime >= this.currentWeather.duration) {
            this.transitionWeather();
        }

        // Update weather history
        if (this.weatherHistory.length > 100) {
            this.weatherHistory.shift();
        }
        this.weatherHistory.push({ ...this.currentWeather });

        this.simulationStats.weatherCalculations++;
    }

    private transitionWeather(): void {
        const newWeatherType = this.weatherEngine.generateNextWeather(this.currentWeather);

        this.currentWeather = {
            temperature: this.weatherEngine.calculateTemperature(this.gameTime, newWeatherType),
            humidity: this.weatherEngine.calculateHumidity(this.gameTime, newWeatherType),
            precipitation: this.weatherEngine.calculatePrecipitation(newWeatherType),
            windSpeed: this.weatherEngine.calculateWindSpeed(newWeatherType),
            windDirection: this.weatherEngine.calculateWindDirection(),
            cloudCover: this.weatherEngine.calculateCloudCover(newWeatherType),
            visibility: this.weatherEngine.calculateVisibility(newWeatherType),
            type: newWeatherType,
            intensity: Math.random(),
            duration: 1800 + Math.random() * 7200, // 30 minutes to 2 hours
            startTime: this.gameTime.getTotalSeconds()
        };

        // Emit weather change event
        this.eventBus.emit('weather_changed', { oldWeather: this.weatherHistory[this.weatherHistory.length - 1], newWeather: this.currentWeather });
    }

    private updateEcosystems(deltaTime: number): void {
        for (const [_ecosystemId, ecosystem] of this.ecosystems) {
            this.updateEcosystem(ecosystem, deltaTime);
        }

        this.simulationStats.ecosystemUpdates++;
    }

    private updateEcosystem(ecosystem: Ecosystem, deltaTime: number): void {
        // Update species populations
        for (const speciesName of ecosystem.species) {
            const species = this.species.get(speciesName);
            const population = this.populations.get(speciesName);

            if (!species || !population) continue;

            // Calculate population dynamics
            const birthRate = species.reproductionRate * (1 - population.currentCount / population.maxCount);
            const deathRate = species.mortalityRate + this.calculateEnvironmentalPressure(species, ecosystem);
            const predationRate = this.calculatePredationRate(species);
            const foodAvailability = this.calculateFoodAvailability(species, ecosystem);

            const netGrowth = (birthRate - deathRate - predationRate) * foodAvailability * deltaTime;

            population.currentCount += population.currentCount * netGrowth;
            population.currentCount = Math.max(0, Math.min(population.maxCount, population.currentCount));

            population.growthTrend = netGrowth;
            population.lastUpdate = this.gameTime.getTotalSeconds();
        }

        // Update ecosystem health
        ecosystem.biodiversity = this.calculateBiodiversity(ecosystem);
        ecosystem.stability = this.calculateStability(ecosystem);
    }

    private calculateEnvironmentalPressure(species: Species, ecosystem: Ecosystem): number {
        let pressure = 0;

        // Temperature pressure
        const optimalTemp = 20; // Simplified
        const tempDiff = Math.abs(this.currentWeather.temperature - optimalTemp);
        pressure += tempDiff * 0.01;

        // Weather pressure
        if (this.currentWeather.precipitation > 0.5) {
            pressure += this.currentWeather.precipitation * 0.1;
        }

        // Habitat suitability
        if (!species.habitatPreferences.includes(ecosystem.biome)) {
            pressure += 0.2;
        }

        return pressure;
    }

    private calculatePredationRate(species: Species): number {
        let predationRate = 0;

        for (const predatorName of species.predators) {
            const predatorPopulation = this.populations.get(predatorName);
            if (predatorPopulation) {
                const predator = this.species.get(predatorName);
                if (predator) {
                    predationRate += (predatorPopulation.currentCount / predatorPopulation.maxCount) * 0.1;
                }
            }
        }

        return predationRate;
    }

    private calculateFoodAvailability(species: Species, ecosystem: Ecosystem): number {
        // Simplified food availability calculation
        let availability = 1.0;

        // Reduce availability based on competition
        const competitors = ecosystem.species.filter(s => s !== species.name && this.species.get(s)?.type === species.type);
        availability *= Math.max(0.1, 1 - competitors.length * 0.1);

        // Weather effects
        if (species.type === 'herbivore') {
            if (this.currentWeather.precipitation < 0.2) {
                availability *= 0.7; // Drought reduces vegetation
            }
        }

        return availability;
    }

    private calculateBiodiversity(ecosystem: Ecosystem): number {
        const speciesCount = ecosystem.species.length;
        const evenness = this.calculateSpeciesEvenness(ecosystem);
        return (speciesCount / 10) * evenness; // Normalize to 0-1
    }

    private calculateSpeciesEvenness(ecosystem: Ecosystem): number {
        const populations = ecosystem.species.map(speciesName => {
            const pop = this.populations.get(speciesName);
            return pop ? pop.currentCount : 0;
        });

        const total = populations.reduce((sum, count) => sum + count, 0);
        if (total === 0) return 0;

        const proportions = populations.map(count => count / total);
        const entropy = -proportions.reduce((sum, prop) => sum + (prop > 0 ? prop * Math.log(prop) : 0), 0);
        const maxEntropy = Math.log(proportions.length);

        return entropy / maxEntropy;
    }

    private calculateStability(ecosystem: Ecosystem): number {
        // Calculate stability based on population fluctuations
        let stability = 1.0;

        for (const speciesName of ecosystem.species) {
            const population = this.populations.get(speciesName);
            if (population && Math.abs(population.growthTrend) > 0.1) {
                stability *= 0.9; // Reduce stability for high fluctuations
            }
        }

        return Math.max(0, Math.min(1, stability));
    }

    private updateEnvironmentalEffects(deltaTime: number): void {
        for (const [effectId, effect] of this.environmentalEffects) {
            effect.update(deltaTime);

            if (effect.duration > 0 && this.gameTime.getTotalSeconds() - effect.startTime >= effect.duration) {
                this.removeEnvironmentalEffect(effectId);
            }
        }
    }

    private updateDisasters(deltaTime: number): void {
        // Update active disasters
        for (let i = this.activeDisasters.length - 1; i >= 0; i--) {
            const disaster = this.activeDisasters[i];
            disaster.update(deltaTime);

            if (disaster.intensity <= 0) {
                this.activeDisasters.splice(i, 1);
            }
        }

        // Check for new disasters
        if (Math.random() < 0.001) { // 0.1% chance per update
            this.triggerDisaster();
        }
    }

    private triggerDisaster(): void {
        const disasterTypes = ['earthquake', 'flood', 'wildfire', 'storm', 'drought'];
        const disasterType = disasterTypes[Math.floor(Math.random() * disasterTypes.length)];

        const disaster = this.disasterEngine.createDisaster(disasterType, Vec3.fromValues(
            Math.random() * 1000,
            0,
            Math.random() * 1000
        ));

        this.activeDisasters.push(disaster);

        this.eventBus.emit('disaster_started', { disaster });
    }

    private updateResources(deltaTime: number): void {
        for (const [_resourceId, resource] of this.resources) {
            // Update resource regeneration/consumption
            if (resource.regenerationRate > 0) {
                resource.currentAmount = Math.min(
                    resource.maxAmount,
                    resource.currentAmount + resource.regenerationRate * deltaTime
                );
            }
        }

        // Update resource nodes
        for (const [nodeId, node] of this.resourceNodes) {
            if (node.depletionRate > 0) {
                node.currentAmount -= node.depletionRate * deltaTime;
                if (node.currentAmount <= 0) {
                    this.removeResourceNode(nodeId);
                }
            }
        }
    }

    private emitSimulationEvents(): void {
        // Emit periodic simulation events
        if (Math.floor(this.gameTime.getTotalSeconds()) % 3600 === 0) { // Every hour
            this.eventBus.emit('simulation_hour', {
                gameTime: this.gameTime.getFormattedTime(),
                weather: this.currentWeather,
                season: this.getCurrentSeason()
            });
        }

        if (Math.floor(this.gameTime.getTotalSeconds()) % 86400 === 0) { // Every day
            this.eventBus.emit('simulation_day', {
                day: Math.floor(this.gameTime.getTotalSeconds() / 86400),
                season: this.getCurrentSeason(),
                ecosystems: Array.from(this.ecosystems.values())
            });
        }
    }

    // Public API methods
    getGameTime(): GameTime {
        return this.gameTime;
    }

    getCurrentWeather(): WeatherState {
        return { ...this.currentWeather };
    }

    getCurrentSeason(): Season {
        const yearProgress = (this.gameTime.getTotalSeconds() % (365 * 24 * 3600)) / (365 * 24 * 3600);
        const seasonProgress = yearProgress * 4;

        if (seasonProgress < 1) return this.seasons.get('spring')!;
        if (seasonProgress < 2) return this.seasons.get('summer')!;
        if (seasonProgress < 3) return this.seasons.get('autumn')!;
        return this.seasons.get('winter')!;
    }

    getEcosystem(ecosystemId: string): Ecosystem | null {
        return this.ecosystems.get(ecosystemId) || null;
    }

    getSpecies(speciesName: string): Species | null {
        return this.species.get(speciesName) || null;
    }

    getPopulation(speciesName: string): Population | null {
        return this.populations.get(speciesName) || null;
    }

    createEcosystem(ecosystemId: string, config: EcosystemConfig): Ecosystem {
        const ecosystem: Ecosystem = {
            id: ecosystemId,
            name: config.name,
            biome: config.biome,
            area: Vec2.clone(config.area),
            species: [...config.species],
            resources: [...config.resources],
            carryingCapacity: config.carryingCapacity,
            biodiversity: config.biodiversity,
            stability: config.stability,
            center: Vec2.fromValues(config.area[0] / 2, config.area[1] / 2),
            boundaries: this.calculateBoundaries(config.area)
        };

        this.ecosystems.set(ecosystemId, ecosystem);
        return ecosystem;
    }

    addSpeciesToEcosystem(ecosystemId: string, speciesName: string): void {
        const ecosystem = this.ecosystems.get(ecosystemId);
        if (ecosystem && !ecosystem.species.includes(speciesName)) {
            ecosystem.species.push(speciesName);
        }
    }

    removeSpeciesFromEcosystem(ecosystemId: string, speciesName: string): void {
        const ecosystem = this.ecosystems.get(ecosystemId);
        if (ecosystem) {
            ecosystem.species = ecosystem.species.filter(s => s !== speciesName);
        }
    }

    createEnvironmentalEffect(effectId: string, type: string, position: Vec3, config: EnvironmentalEffectConfig): EnvironmentalEffect {
        const effect: EnvironmentalEffect = {
            id: effectId,
            type,
            position: Vec3.clone(position),
            radius: config.radius || 10,
            intensity: config.intensity || 1.0,
            duration: config.duration || -1, // -1 for permanent
            startTime: this.gameTime.getTotalSeconds(),
            affectedEntities: [],
            parameters: config.parameters || {},
            update: (_dt: number) => {}
        };

        this.environmentalEffects.set(effectId, effect);
        return effect;
    }

    removeEnvironmentalEffect(effectId: string): void {
        const effect = this.environmentalEffects.get(effectId);
        if (effect) {
            // Clean up affected entities
            this.environmentalEffects.delete(effectId);
        }
    }

    addResource(resourceId: string, config: ResourceConfig): Resource {
        const resource: Resource = {
            id: resourceId,
            name: config.name,
            type: config.type,
            currentAmount: config.initialAmount,
            maxAmount: config.maxAmount,
            regenerationRate: config.regenerationRate || 0,
            depletionRate: config.depletionRate || 0,
            quality: config.quality || 1.0
        };

        this.resources.set(resourceId, resource);
        return resource;
    }

    consumeResource(resourceId: string, amount: number): number {
        const resource = this.resources.get(resourceId);
        if (!resource) return 0;

        const consumed = Math.min(amount, resource.currentAmount);
        resource.currentAmount -= consumed;

        return consumed;
    }

    createResourceNode(nodeId: string, resourceId: string, position: Vec3, config: ResourceNodeConfig): ResourceNode {
        const resourceNode: ResourceNode = {
            id: nodeId,
            resourceId,
            position: Vec3.clone(position),
            currentAmount: config.initialAmount,
            maxAmount: config.maxAmount,
            regenerationRate: config.regenerationRate || 0,
            depletionRate: config.depletionRate || 0,
            extractionRate: config.extractionRate || 1.0,
            quality: config.quality || 1.0
        };

        this.resourceNodes.set(nodeId, resourceNode);
        return resourceNode;
    }

    removeResourceNode(nodeId: string): void {
        this.resourceNodes.delete(nodeId);
    }

    setTimeScale(scale: number): void {
        this.timeScale = Math.max(0, scale);
    }

    pauseSimulation(): void {
        this.paused = true;
    }

    resumeSimulation(): void {
        this.paused = false;
    }

    getSimulationStats(): SimulationStats {
        return { ...this.simulationStats };
    }

    // Debug and monitoring
    getDebugInfo(): any {
        return {
            gameTime: this.gameTime.getFormattedTime(),
            currentWeather: this.currentWeather,
            currentSeason: this.getCurrentSeason().name,
            ecosystems: Array.from(this.ecosystems.keys()),
            species: Array.from(this.species.keys()),
            activeDisasters: this.activeDisasters.length,
            environmentalEffects: Array.from(this.environmentalEffects.keys()),
            resources: Array.from(this.resources.values()),
            timeScale: this.timeScale,
            paused: this.paused,
            simulationStats: this.simulationStats
        };
    }

    // Cleanup
    dispose(): void {
        this.ecosystems.clear();
        this.species.clear();
        this.populations.clear();
        this.environmentalEffects.clear();
        this.resources.clear();
        this.resourceNodes.clear();
        this.activeDisasters.length = 0;
        this.weatherHistory.length = 0;

        console.log('[AdvancedSimulationSystem] Disposed');
    }

    private calculateBoundaries(area: Vec2): Vec2[] {
        return [
            Vec2.fromValues(0, 0),
            Vec2.fromValues(area[0], 0),
            Vec2.fromValues(area[0], area[1]),
            Vec2.fromValues(0, area[1])
        ];
    }
}

// Supporting classes and interfaces
class GameTime {
    private totalSeconds: number = 0;

    update(deltaTime: number): void {
        this.totalSeconds += deltaTime;
    }

    getTotalSeconds(): number {
        return this.totalSeconds;
    }

    getFormattedTime(): string {
        const days = Math.floor(this.totalSeconds / 86400);
        const hours = Math.floor((this.totalSeconds % 86400) / 3600);
        const minutes = Math.floor((this.totalSeconds % 3600) / 60);
        const seconds = Math.floor(this.totalSeconds % 60);

        return `Day ${days + 1}, ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    getSeasonProgress(): number {
        return (this.totalSeconds % (365 * 24 * 3600)) / (365 * 24 * 3600);
    }
}

class WeatherEngine {
    update(weather: WeatherState, deltaTime: number): void {
        // Update weather dynamics
        weather.temperature += (Math.random() - 0.5) * 0.1 * deltaTime;
        weather.humidity = Math.max(0, Math.min(1, weather.humidity + (Math.random() - 0.5) * 0.01 * deltaTime));
        weather.windSpeed += (Math.random() - 0.5) * 0.5 * deltaTime;
        weather.windSpeed = Math.max(0, weather.windSpeed);
    }

    generateNextWeather(_currentWeather: WeatherState): string {
        const weatherTypes = ['clear', 'cloudy', 'rain', 'storm', 'snow'];
        const weights = [0.4, 0.3, 0.15, 0.1, 0.05];

        let random = Math.random();
        for (let i = 0; i < weatherTypes.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return weatherTypes[i];
            }
        }

        return 'clear';
    }

    calculateTemperature(gameTime: GameTime, weatherType: string): number {
        const baseTemp = 20;
        const seasonModifier = Math.sin(gameTime.getSeasonProgress() * Math.PI * 2) * 15;
        const weatherModifier = this.getWeatherTemperatureModifier(weatherType);

        return baseTemp + seasonModifier + weatherModifier;
    }

    private getWeatherTemperatureModifier(weatherType: string): number {
        switch (weatherType) {
            case 'clear': return 5;
            case 'cloudy': return 0;
            case 'rain': return -2;
            case 'storm': return -5;
            case 'snow': return -10;
            default: return 0;
        }
    }

    calculateHumidity(gameTime: GameTime, weatherType: string): number {
        const baseHumidity = 0.5;
        const seasonModifier = Math.sin(gameTime.getSeasonProgress() * Math.PI * 2) * 0.2;
        const weatherModifier = this.getWeatherHumidityModifier(weatherType);

        return Math.max(0, Math.min(1, baseHumidity + seasonModifier + weatherModifier));
    }

    private getWeatherHumidityModifier(weatherType: string): number {
        switch (weatherType) {
            case 'clear': return -0.2;
            case 'cloudy': return 0.1;
            case 'rain': return 0.3;
            case 'storm': return 0.4;
            case 'snow': return 0.2;
            default: return 0;
        }
    }

    calculatePrecipitation(weatherType: string): number {
        switch (weatherType) {
            case 'clear': return 0;
            case 'cloudy': return 0.1;
            case 'rain': return 0.5 + Math.random() * 0.5;
            case 'storm': return 0.8 + Math.random() * 0.2;
            case 'snow': return 0.3 + Math.random() * 0.4;
            default: return 0;
        }
    }

    calculateWindSpeed(weatherType: string): number {
        const baseSpeed = 5;
        const weatherModifier = this.getWeatherWindModifier(weatherType);
        return Math.max(0, baseSpeed + weatherModifier + (Math.random() - 0.5) * 10);
    }

    private getWeatherWindModifier(weatherType: string): number {
        switch (weatherType) {
            case 'clear': return -2;
            case 'cloudy': return 0;
            case 'rain': return 3;
            case 'storm': return 15;
            case 'snow': return 5;
            default: return 0;
        }
    }

    calculateWindDirection(): Vec3 {
        const angle = Math.random() * Math.PI * 2;
        return Vec3.fromValues(Math.cos(angle), 0, Math.sin(angle));
    }

    calculateCloudCover(weatherType: string): number {
        switch (weatherType) {
            case 'clear': return 0.2;
            case 'cloudy': return 0.6;
            case 'rain': return 0.8;
            case 'storm': return 0.95;
            case 'snow': return 0.7;
            default: return 0.3;
        }
    }

    calculateVisibility(weatherType: string): number {
        switch (weatherType) {
            case 'clear': return 2000;
            case 'cloudy': return 1500;
            case 'rain': return 500;
            case 'storm': return 200;
            case 'snow': return 300;
            default: return 1000;
        }
    }
}


class DisasterEngine {
    createDisaster(type: string, position: Vec3): Disaster {
        const disaster: Disaster = {
            id: `${type}_${Date.now()}`,
            type,
            position: Vec3.clone(position),
            radius: this.getDisasterRadius(type),
            intensity: this.getDisasterIntensity(type),
            duration: this.getDisasterDuration(type),
            startTime: Date.now(),
            affectedArea: [],
            update: (deltaTime: number) => {
                disaster.intensity -= deltaTime / disaster.duration;
                disaster.intensity = Math.max(0, disaster.intensity);
            }
        };

        return disaster;
    }

    private getDisasterRadius(type: string): number {
        switch (type) {
            case 'earthquake': return 100;
            case 'flood': return 200;
            case 'wildfire': return 50;
            case 'storm': return 300;
            case 'drought': return 1000;
            default: return 100;
        }
    }

    private getDisasterIntensity(type: string): number {
        switch (type) {
            case 'earthquake': return 0.8;
            case 'flood': return 0.6;
            case 'wildfire': return 0.7;
            case 'storm': return 0.9;
            case 'drought': return 0.4;
            default: return 0.5;
        }
    }

    private getDisasterDuration(type: string): number {
        switch (type) {
            case 'earthquake': return 30; // seconds
            case 'flood': return 3600; // 1 hour
            case 'wildfire': return 7200; // 2 hours
            case 'storm': return 1800; // 30 minutes
            case 'drought': return 2592000; // 30 days
            default: return 600; // 10 minutes
        }
    }
}

// Interfaces
interface GameTime {
    update(deltaTime: number): void;
    getTotalSeconds(): number;
    getFormattedTime(): string;
    getSeasonProgress(): number;
}

interface WeatherState {
    temperature: number;
    humidity: number;
    precipitation: number;
    windSpeed: number;
    windDirection: Vec3;
    cloudCover: number;
    visibility: number;
    type: string;
    intensity: number;
    duration: number;
    startTime: number;
}

interface Season {
    name: string;
    duration: number;
    temperatureModifier: number;
    humidityModifier: number;
    precipitationModifier: number;
    vegetationGrowthRate: number;
    colors: string[];
}

interface Ecosystem {
    id: string;
    name: string;
    biome: string;
    area: Vec2;
    species: string[];
    resources: string[];
    carryingCapacity: number;
    biodiversity: number;
    stability: number;
    center: Vec2;
    boundaries: Vec2[];
}

interface EcosystemConfig {
    name: string;
    biome: string;
    area: Vec2;
    species: string[];
    resources: string[];
    carryingCapacity: number;
    biodiversity: number;
    stability: number;
}

interface Species {
    name: string;
    type: 'herbivore' | 'carnivore' | 'omnivore';
    population: number;
    growthRate: number;
    mortalityRate: number;
    reproductionRate: number;
    foodRequirements: number;
    waterRequirements: number;
    habitatPreferences: string[];
    predators: string[];
    prey: string[];
    maxLifespan: number;
    socialBehavior: string;
    migrationPattern: string;
}

interface Population {
    species: string;
    currentCount: number;
    maxCount: number;
    growthTrend: number;
    lastUpdate: number;
}

interface EnvironmentalEffect {
    id: string;
    type: string;
    position: Vec3;
    radius: number;
    intensity: number;
    duration: number;
    startTime: number;
    affectedEntities: Entity[];
    parameters: any;
    update(deltaTime: number): void;
}

interface EnvironmentalEffectConfig {
    radius?: number;
    intensity?: number;
    duration?: number;
    parameters?: any;
}

interface Resource {
    id: string;
    name: string;
    type: string;
    currentAmount: number;
    maxAmount: number;
    regenerationRate: number;
    depletionRate: number;
    quality: number;
}

interface ResourceConfig {
    name: string;
    type: string;
    initialAmount: number;
    maxAmount: number;
    regenerationRate?: number;
    depletionRate?: number;
    quality?: number;
}

interface ResourceNode {
    id: string;
    resourceId: string;
    position: Vec3;
    currentAmount: number;
    maxAmount: number;
    regenerationRate: number;
    depletionRate: number;
    extractionRate: number;
    quality: number;
}

interface ResourceNodeConfig {
    initialAmount: number;
    maxAmount: number;
    regenerationRate?: number;
    depletionRate?: number;
    extractionRate?: number;
    quality?: number;
}

interface Disaster {
    id: string;
    type: string;
    position: Vec3;
    radius: number;
    intensity: number;
    duration: number;
    startTime: number;
    affectedArea: Vec3[];
    update(deltaTime: number): void;
}




interface SimulationStats {
    updatesPerSecond: number;
    entitiesSimulated: number;
    weatherCalculations: number;
    ecosystemUpdates: number;
    timeSpent: number;
}
