import { Vec3, Mat4 } from '../math';

/**
 * Advanced Lighting System with dynamic lights, shadows, and global illumination.
 * Supports point, directional, and spot lights with realistic attenuation and color temperature.
 */
export class LightingSystem {
    private gl: WebGL2RenderingContext;
    private lights: Map<string, Light> = new Map();
    private lightUBO: WebGLBuffer | null = null;
    private maxLights: number = 16;
    private ambientColor: [number, number, number] = [0.1, 0.1, 0.15];
    private ambientIntensity: number = 0.3;
    // GI / advanced feature toggles -- reserved for future rendering passes
    private lightProbes: LightProbe[] = [];
    private reflectionProbes: ReflectionProbe[] = [];

    // Advanced lighting features
    private colorTemperature: number = 6500; // Kelvin

    // Light baking
    private lightmapResolution: number = 512;
    private lightmapTextures: Map<string, WebGLTexture> = new Map();

    // Volumetric lighting
    private volumetricLightingEnabled: boolean = false;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.initializeUBO();
        console.log('[LightingSystem] Advanced lighting system initialized');
    }

    private initializeUBO(): void {
        this.lightUBO = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, this.lightUBO);

        // Allocate space for max lights (position, color, direction, intensity, range, type, etc.)
        const uboSize = this.maxLights * (4 * 4 * 4); // 4 vec4 per light * 4 bytes per float
        this.gl.bufferData(this.gl.UNIFORM_BUFFER, uboSize, this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, null);
    }

    addLight(type: 'point' | 'directional' | 'spot' | 'area', position: [number, number, number],
             color: [number, number, number], intensity: number, range?: number): string {
        const lightId = `light_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const light: Light = {
            id: lightId,
            type,
            position: Vec3.fromValues(...position),
            color: Vec3.fromValues(...color),
            intensity,
            range: range || 10,
            direction: type === 'directional' ? Vec3.fromValues(0, -1, 0) : Vec3.create(),
            spotAngle: type === 'spot' ? Math.PI / 6 : 0,
            castShadows: true,
            shadowMapSize: 1024,
            colorTemperature: this.colorTemperature,
            iesProfile: null,
            animation: undefined,
            flicker: undefined
        };

        this.lights.set(lightId, light);
        this.updateUBO();

        console.log(`[LightingSystem] Added ${type} light: ${lightId}`);
        return lightId;
    }

    removeLight(lightId: string): void {
        this.lights.delete(lightId);
        this.updateUBO();
        console.log(`[LightingSystem] Removed light: ${lightId}`);
    }

    updateLight(lightId: string, properties: Partial<Light>): void {
        const light = this.lights.get(lightId);
        if (!light) return;

        Object.assign(light, properties);
        this.updateUBO();
    }

    private updateUBO(): void {
        if (!this.lightUBO) return;

        const lightData: number[] = [];
        let lightIndex = 0;

        for (const light of this.lights.values()) {
            if (lightIndex >= this.maxLights) break;

            // Position (vec4)
            lightData.push(light.position[0], light.position[1], light.position[2], light.range);

            // Color and intensity (vec4)
            lightData.push(light.color[0] * light.intensity, light.color[1] * light.intensity,
                          light.color[2] * light.intensity, light.type === 'directional' ? 1 : 0);

            // Direction and spot angle (vec4)
            lightData.push(light.direction[0], light.direction[1], light.direction[2], light.spotAngle);

            // Additional properties (vec4)
            lightData.push(light.castShadows ? 1 : 0, light.shadowMapSize / 1024, 0, 0);

            lightIndex++;
        }

        // Pad remaining lights
        while (lightIndex < this.maxLights) {
            for (let i = 0; i < 16; i++) { // 4 vec4 = 16 floats
                lightData.push(0);
            }
            lightIndex++;
        }

        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, this.lightUBO);
        this.gl.bufferSubData(this.gl.UNIFORM_BUFFER, 0, new Float32Array(lightData));
        this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, null);
    }

    bindUBO(program: WebGLProgram, blockIndex: number): void {
        if (!this.lightUBO) return;

        const blockLocation = this.gl.getUniformBlockIndex(program, 'Lights');
        if (blockLocation !== this.gl.INVALID_INDEX) {
            this.gl.uniformBlockBinding(program, blockLocation, blockIndex);
            this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, blockIndex, this.lightUBO);
        }
    }

    // Light baking for static lighting
    async bakeLighting(sceneBounds: { min: Vec3, max: Vec3 }, resolution: number = this.lightmapResolution): Promise<void> {
        console.log('[LightingSystem] Starting light baking...');

        this.lightmapResolution = resolution;

        // Create lightmap textures
        const lightmapCount = Math.ceil((sceneBounds.max[0] - sceneBounds.min[0]) / 10) *
                             Math.ceil((sceneBounds.max[2] - sceneBounds.min[2]) / 10);

        for (let i = 0; i < lightmapCount; i++) {
            const lightmapTexture = this.createLightmapTexture(resolution);
            this.lightmapTextures.set(`lightmap_${i}`, lightmapTexture);
        }

        // Ray trace lighting for each texel
        await this.rayTraceLighting(sceneBounds, resolution);

        console.log('[LightingSystem] Light baking completed');
    }

    private createLightmapTexture(resolution: number): WebGLTexture {
        const gl = this.gl;
        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);

        const data = new Float32Array(resolution * resolution * 4);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, resolution, resolution, 0, gl.RGBA, gl.FLOAT, data);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        return texture;
    }

    private async rayTraceLighting(sceneBounds: { min: Vec3, max: Vec3 }, resolution: number): Promise<void> {
        const promises: Promise<void>[] = [];

        for (let x = 0; x < resolution; x++) {
            for (let z = 0; z < resolution; z++) {
                const worldX = sceneBounds.min[0] + (x / resolution) * (sceneBounds.max[0] - sceneBounds.min[0]);
                const worldZ = sceneBounds.min[2] + (z / resolution) * (sceneBounds.max[2] - sceneBounds.min[2]);

                promises.push(this.traceLightRays(worldX, 0, worldZ, x, z));
            }
        }

        await Promise.all(promises);
    }

    private async traceLightRays(worldX: number, worldY: number, worldZ: number, _texelX: number, _texelZ: number): Promise<void> {
        // Simplified ray tracing for demonstration
        // In a real implementation, this would cast rays in multiple directions
        // and accumulate lighting from all light sources

        let totalLight: Vec3 = Vec3.fromValues(0, 0, 0);
        let sampleCount = 0;

        // Sample lighting from all lights
        for (const light of this.lights.values()) {
            const lightContribution = this.calculateLightContribution(
                Vec3.fromValues(worldX, worldY, worldZ),
                light
            );
            Vec3.add(totalLight, totalLight, lightContribution);
            sampleCount++;
        }

        // Add ambient
        Vec3.add(totalLight, totalLight, Vec3.fromValues(
            this.ambientColor[0] * this.ambientIntensity,
            this.ambientColor[1] * this.ambientIntensity,
            this.ambientColor[2] * this.ambientIntensity
        ));

        // Store in lightmap texture
        // This would update the texture data
    }

    private calculateLightContribution(position: Vec3, light: Light): Vec3 {
        const contribution = Vec3.create();
        const lightDir = Vec3.create();

        if (light.type === 'directional') {
            Vec3.negate(lightDir, light.direction);
        } else {
            Vec3.subtract(lightDir, light.position, position);
            const distance = Vec3.length(lightDir);
            if (distance > light.range) return contribution;

            Vec3.normalize(lightDir, lightDir);
            const attenuation = 1.0 / (1.0 + 0.1 * distance + 0.01 * distance * distance);
            Vec3.scale(contribution, light.color, light.intensity * attenuation);
        }

        Vec3.multiply(contribution, contribution, light.color);
        Vec3.scale(contribution, contribution, light.intensity);

        return contribution;
    }

    // Light probes for global illumination
    addLightProbe(position: Vec3, range: number = 5): string {
        const probeId = `probe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const probe: LightProbe = {
            id: probeId,
            position: Vec3.clone(position),
            range,
            irradiance: new Float32Array(9 * 3), // 9 coefficients * 3 channels
            lastUpdated: 0
        };

        this.lightProbes.push(probe);

        // Sample irradiance at this position
        this.updateLightProbe(probe);

        return probeId;
    }

    private updateLightProbe(probe: LightProbe): void {
        // Sample incident lighting from all directions
        // This would compute spherical harmonics coefficients
        // For simplicity, we'll just sample a few directions

        const directions = [
            [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
        ];

        let totalIrradiance = Vec3.create();

        for (const dir of directions) {
            const lightDir = Vec3.fromValues(dir[0], dir[1], dir[2]);
            void lightDir;
            let lightContribution = Vec3.create();

            for (const light of this.lights.values()) {
                const contribution = this.calculateLightContribution(probe.position, light);
                Vec3.add(lightContribution, lightContribution, contribution);
            }

            Vec3.add(totalIrradiance, totalIrradiance, lightContribution);
        }

        Vec3.scale(totalIrradiance, totalIrradiance, 1.0 / directions.length);

        // Store in irradiance array (simplified - just constant term)
        for (let i = 0; i < 3; i++) {
            probe.irradiance[i] = totalIrradiance[i];
        }

        probe.lastUpdated = performance.now();
    }

    // Reflection probes for environment reflections
    addReflectionProbe(position: Vec3, resolution: number = 128): string {
        const probeId = `reflection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const probe: ReflectionProbe = {
            id: probeId,
            position: Vec3.clone(position),
            resolution,
            cubemap: this.createCubemapTexture(resolution),
            lastUpdated: 0
        };

        this.reflectionProbes.push(probe);

        // Render environment cubemap
        this.updateReflectionProbe(probe);

        return probeId;
    }

    private createCubemapTexture(resolution: number): WebGLTexture {
        const gl = this.gl;
        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

        for (let i = 0; i < 6; i++) {
            gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA,
                         resolution, resolution, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }

        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

        return texture;
    }

    private updateReflectionProbe(probe: ReflectionProbe): void {
        // Render scene from 6 directions to create cubemap
        // This is a complex operation that would require rendering the scene
        // multiple times from different viewpoints

        // Placeholder faces for future implementation
        probe.lastUpdated = performance.now();
    }

    // Volumetric lighting
    renderVolumetricLighting(viewMatrix: Mat4, projectionMatrix: Mat4): void {
        if (!this.volumetricLightingEnabled) return;

        // Render volumetric lighting effects
        // This would involve ray marching through the scene
        // and accumulating light scattering

        for (const light of this.lights.values()) {
            if (light.type === 'point' || light.type === 'spot') {
                this.renderLightVolume(light, viewMatrix, projectionMatrix);
            }
        }
    }

    private renderLightVolume(_light: Light, _viewMatrix: Mat4, _projectionMatrix: Mat4): void {
        // Render light volume geometry (sphere for point lights, cone for spot lights)
        // Use ray marching shader to compute volumetric lighting

        // This is a simplified implementation
        // Real volumetric lighting would be much more complex
    }

    // Advanced lighting features
    setColorTemperature(temperature: number): void {
        this.colorTemperature = temperature;

        // Update all lights with new color temperature
        for (const light of this.lights.values()) {
            light.colorTemperature = temperature;
            // Convert temperature to RGB color
            const rgb = this.temperatureToRGB(temperature);
            Vec3.multiply(light.color, light.color, rgb);
        }

        this.updateUBO();
    }

    private temperatureToRGB(temperature: number): Vec3 {
        // Approximation of blackbody radiation color
        const temp = temperature / 100;

        let r, g, b;

        if (temp <= 66) {
            r = 255;
            g = temp;
            g = 99.4708025861 * Math.log(g) - 161.1195681661;
            if (temp <= 19) {
                b = 0;
            } else {
                b = temp - 10;
                b = 138.5177312231 * Math.log(b) - 305.0447927307;
            }
        } else {
            r = temp - 60;
            r = 329.698727446 * Math.pow(r, -0.1332047592);
            g = temp - 60;
            g = 288.1221695283 * Math.pow(g, -0.0755148492);
            b = 255;
        }

        return Vec3.fromValues(
            Math.max(0, Math.min(255, r)) / 255,
            Math.max(0, Math.min(255, g)) / 255,
            Math.max(0, Math.min(255, b)) / 255
        );
    }

    // Light animation system
    animateLight(lightId: string, animation: LightAnimation): void {
        const light = this.lights.get(lightId);
        if (!light) return;

        light.animation = animation;
    }

    updateAnimations(deltaTime: number): void {
        for (const light of this.lights.values()) {
            if (!light.animation) continue;

            const anim = light.animation;
            anim.elapsedTime += deltaTime;

            // Update light properties based on animation
            if (anim.intensityCurve) {
                light.intensity = this.evaluateCurve(anim.intensityCurve, anim.elapsedTime);
            }

            if (anim.colorCurve) {
                const color = this.evaluateColorCurve(anim.colorCurve, anim.elapsedTime);
                Vec3.copy(light.color, color);
            }

            if (anim.positionCurve) {
                const position = this.evaluateVec3Curve(anim.positionCurve, anim.elapsedTime);
                Vec3.copy(light.position, position);
            }

            // Loop animation if needed
            if (anim.loop && anim.elapsedTime >= anim.duration) {
                anim.elapsedTime = 0;
            }
        }

        this.updateUBO();
    }

    private evaluateCurve(curve: AnimationCurve, time: number): number {
        // Simple linear interpolation for demonstration
        if (curve.keys.length === 0) return 0;
        if (curve.keys.length === 1) return curve.keys[0].value;

        // Find keyframes
        let prevKey = curve.keys[0];
        let nextKey = curve.keys[1];

        for (let i = 1; i < curve.keys.length; i++) {
            if (time < curve.keys[i].time) {
                nextKey = curve.keys[i];
                break;
            }
            prevKey = curve.keys[i];
        }

        // Linear interpolation
        const t = (time - prevKey.time) / (nextKey.time - prevKey.time);
        return prevKey.value + (nextKey.value - prevKey.value) * t;
    }

    private evaluateColorCurve(curve: ColorAnimationCurve, time: number): Vec3 {
        return Vec3.fromValues(
            this.evaluateCurve({ keys: curve.rKeys }, time),
            this.evaluateCurve({ keys: curve.gKeys }, time),
            this.evaluateCurve({ keys: curve.bKeys }, time)
        );
    }

    private evaluateVec3Curve(curve: Vec3AnimationCurve, time: number): Vec3 {
        return Vec3.fromValues(
            this.evaluateCurve({ keys: curve.xKeys }, time),
            this.evaluateCurve({ keys: curve.yKeys }, time),
            this.evaluateCurve({ keys: curve.zKeys }, time)
        );
    }

    // Light flicker effects
    addFlicker(lightId: string, flicker: LightFlicker): void {
        const light = this.lights.get(lightId);
        if (!light) return;

        light.flicker = flicker;
    }

    updateFlicker(deltaTime: number): void {
        for (const light of this.lights.values()) {
            if (!light.flicker) continue;

            const flicker = light.flicker;
            flicker.elapsedTime += deltaTime;

            // Calculate flicker intensity
            const noise1 = Math.sin(flicker.elapsedTime * flicker.frequency) * flicker.intensity;
            const noise2 = Math.sin(flicker.elapsedTime * flicker.frequency * 1.5) * flicker.intensity * 0.5;
            const noise3 = Math.sin(flicker.elapsedTime * flicker.frequency * 0.7) * flicker.intensity * 0.3;

            const flickerAmount = 1.0 + noise1 + noise2 + noise3;
            light.intensity = light.intensity * flickerAmount;
        }

        this.updateUBO();
    }

    // Getters and setters
    getLight(lightId: string): Light | undefined {
        return this.lights.get(lightId);
    }

    getAllLights(): Light[] {
        return Array.from(this.lights.values());
    }

    setAmbientColor(color: [number, number, number]): void {
        this.ambientColor = color;
    }

    setAmbientIntensity(intensity: number): void {
        this.ambientIntensity = intensity;
    }

    setExposure(_exposure: number): void {
        // reserved for post-processing tone mapping
    }

    setBloomProperties(_threshold: number, _intensity: number, _radius: number): void {
        // reserved for post-processing bloom
    }

    enableGlobalIllumination(_enabled: boolean): void {
        // reserved for future GI implementation
    }

    enableVolumetricLighting(enabled: boolean): void {
        this.volumetricLightingEnabled = enabled;
    }

    enableAreaLights(_enabled: boolean): void {
        // reserved for area light support
    }

    setBakedLighting(_enabled: boolean): void {
        // reserved
    }

    dispose(): void {
        if (this.lightUBO) {
            this.gl.deleteBuffer(this.lightUBO);
        }

        for (const texture of this.lightmapTextures.values()) {
            this.gl.deleteTexture(texture);
        }

        for (const probe of this.reflectionProbes) {
            this.gl.deleteTexture(probe.cubemap);
        }

        console.log('[LightingSystem] Disposed');
    }
}

// Type definitions
interface Light {
    id: string;
    type: 'point' | 'directional' | 'spot' | 'area';
    position: Vec3;
    color: Vec3;
    intensity: number;
    range: number;
    direction: Vec3;
    spotAngle: number;
    castShadows: boolean;
    shadowMapSize: number;
    colorTemperature: number;
    iesProfile: any; // IES light profile
    animation?: LightAnimation;
    flicker?: LightFlicker;
}

interface LightAnimation {
    duration: number;
    loop: boolean;
    elapsedTime: number;
    intensityCurve?: AnimationCurve;
    colorCurve?: ColorAnimationCurve;
    positionCurve?: Vec3AnimationCurve;
}

interface LightFlicker {
    frequency: number;
    intensity: number;
    elapsedTime: number;
}

interface AnimationCurve {
    keys: { time: number; value: number }[];
}

interface ColorAnimationCurve {
    rKeys: { time: number; value: number }[];
    gKeys: { time: number; value: number }[];
    bKeys: { time: number; value: number }[];
}

interface Vec3AnimationCurve {
    xKeys: { time: number; value: number }[];
    yKeys: { time: number; value: number }[];
    zKeys: { time: number; value: number }[];
}

interface LightProbe {
    id: string;
    position: Vec3;
    range: number;
    irradiance: Float32Array;
    lastUpdated: number;
}

interface ReflectionProbe {
    id: string;
    position: Vec3;
    resolution: number;
    cubemap: WebGLTexture;
    lastUpdated: number;
}
