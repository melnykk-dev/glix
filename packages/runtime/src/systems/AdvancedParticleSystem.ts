import { Vec3, Mat4 } from '../math';

/**
 * Advanced Particle System with sub-emitters, trails, force fields, advanced rendering,
 * GPU acceleration, and complex particle behaviors.
 */
export class AdvancedParticleSystem {
    private gl: WebGL2RenderingContext;
    private emitters: Map<string, ParticleEmitter> = new Map();
    private particles: Map<string, Particle[]> = new Map();
    private forceFields: Map<string, ForceField> = new Map();
    private subEmitters: Map<string, SubEmitter[]> = new Map();
    private trails: Map<string, ParticleTrail[]> = new Map();
    private particleTextures: Map<string, WebGLTexture> = new Map();

    // GPU acceleration
    private particleShader: WebGLProgram | null = null;
    private computeShader: WebGLProgram | null = null;
    private particleVAO: WebGLVertexArrayObject | null = null;
    private particleVBO: WebGLBuffer | null = null;
    private particleEBO: WebGLBuffer | null = null;
    private transformFeedback: WebGLTransformFeedback | null = null;

    // Advanced features
    private maxParticles: number = 100000;
    private particlePool: Particle[] = [];
    private activeParticles: number = 0;

    // Performance optimization
    private particleBatches: ParticleBatch[] = [];
    private renderGroups: Map<string, ParticleRenderGroup> = new Map();

    // Advanced rendering
    private blendModes: Map<string, BlendMode> = new Map();
    private renderers: Map<string, ParticleRenderer> = new Map();
    private materials: Map<string, ParticleMaterial> = new Map();

    // Simulation
    private simulationPaused: boolean = false;
    private timeScale: number = 1.0;
    private fixedTimeStep: number = 1/60;
    private accumulator: number = 0;

    // Debug and profiling
    private performanceStats: ParticlePerformanceStats = {
        activeParticles: 0,
        emittedPerSecond: 0,
        renderedPerSecond: 0,
        updateTime: 0,
        renderTime: 0
    };

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.initializeShaders();
        this.initializeBuffers();
        this.initializeDefaultTextures();
        console.log('[AdvancedParticleSystem] Advanced particle system initialized');
    }

    private initializeShaders(): void {
        const gl = this.gl;

        // Particle rendering shader
        const vertexShader = `#version 300 es
            layout(location = 0) in vec3 a_position;
            layout(location = 1) in vec2 a_texCoord;
            layout(location = 2) in vec4 a_color;
            layout(location = 3) in float a_size;
            layout(location = 4) in float a_rotation;

            uniform mat4 u_viewProjection;
            uniform vec3 u_cameraPosition;
            uniform float u_time;

            out vec2 v_texCoord;
            out vec4 v_color;
            out float v_size;

            void main() {
                vec3 position = a_position;

                // Billboard towards camera
                vec3 toCamera = normalize(u_cameraPosition - position);
                vec3 right = normalize(cross(toCamera, vec3(0, 1, 0)));
                vec3 up = cross(right, toCamera);

                // Apply rotation
                float cosRot = cos(a_rotation);
                float sinRot = sin(a_rotation);
                vec2 rotatedUV = vec2(
                    a_texCoord.x * cosRot - a_texCoord.y * sinRot,
                    a_texCoord.x * sinRot + a_texCoord.y * cosRot
                );

                // Calculate vertex position
                vec2 vertexOffset = (rotatedUV - 0.5) * a_size;
                position += right * vertexOffset.x + up * vertexOffset.y;

                gl_Position = u_viewProjection * vec4(position, 1.0);
                v_texCoord = a_texCoord;
                v_color = a_color;
                v_size = a_size;
            }
        `;

        const fragmentShader = `#version 300 es
            precision mediump float;

            in vec2 v_texCoord;
            in vec4 v_color;
            in float v_size;

            uniform sampler2D u_texture;
            uniform int u_blendMode;
            uniform float u_softness;
            uniform vec4 u_tint;

            out vec4 outColor;

            void main() {
                vec4 texColor = texture(u_texture, v_texCoord);
                vec4 finalColor = texColor * v_color * u_tint;

                // Apply softness (fade out edges)
                float dist = length(v_texCoord - 0.5) * 2.0;
                float alpha = 1.0 - smoothstep(1.0 - u_softness, 1.0, dist);
                finalColor.a *= alpha;

                // Apply blend mode
                if (u_blendMode == 1) { // Additive
                    outColor = finalColor;
                } else if (u_blendMode == 2) { // Multiply
                    outColor = finalColor * finalColor;
                } else { // Alpha blend
                    outColor = finalColor;
                }

                if (outColor.a < 0.01) discard;
            }
        `;

        this.particleShader = this.createShaderProgram(vertexShader, fragmentShader);

        // Compute shader for GPU particle simulation (if supported)
        if (gl.getExtension('EXT_disjoint_timer_query_webgl2')) {
            // Initialize compute shader for GPU particle simulation
            this.initializeComputeShader();
        }
    }

    private initializeComputeShader(): void {
        // Compute shader for particle simulation on GPU
        const computeShader = `#version 310 es
            layout(local_size_x = 64) in;

            struct Particle {
                vec3 position;
                vec3 velocity;
                vec4 color;
                float life;
                float maxLife;
                float size;
                float rotation;
                uint emitterId;
            };

            layout(std430, binding = 0) buffer ParticleBuffer {
                Particle particles[];
            };

            uniform float u_deltaTime;
            uniform vec3 u_gravity;
            uniform uint u_particleCount;

            void main() {
                uint id = gl_GlobalInvocationID.x;
                if (id >= u_particleCount) return;

                Particle particle = particles[id];

                // Update physics
                particle.velocity += u_gravity * u_deltaTime;
                particle.position += particle.velocity * u_deltaTime;

                // Update life
                particle.life -= u_deltaTime;
                if (particle.life <= 0.0) {
                    particle.life = 0.0;
                }

                // Update color based on life
                float lifeRatio = particle.life / particle.maxLife;
                particle.color.a = lifeRatio;

                particles[id] = particle;
            }
        `;

        // Create compute program
        this.computeShader = this.createShaderProgram(computeShader, null);
    }

    private createShaderProgram(vertexSource: string, fragmentSource: string | null): WebGLProgram | null {
        const gl = this.gl;

        const program = gl.createProgram();

        // Vertex shader
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader!, vertexSource);
        gl.compileShader(vertexShader!);

        if (!gl.getShaderParameter(vertexShader!, gl.COMPILE_STATUS)) {
            console.error('Particle vertex shader compilation error:', gl.getShaderInfoLog(vertexShader!));
            return null;
        }

        gl.attachShader(program!, vertexShader!);

        // Fragment shader (if provided)
        if (fragmentSource) {
            const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fragmentShader!, fragmentSource);
            gl.compileShader(fragmentShader!);

            if (!gl.getShaderParameter(fragmentShader!, gl.COMPILE_STATUS)) {
                console.error('Particle fragment shader compilation error:', gl.getShaderInfoLog(fragmentShader!));
                return null;
            }

            gl.attachShader(program!, fragmentShader!);
        }

        gl.linkProgram(program!);

        if (!gl.getProgramParameter(program!, gl.LINK_STATUS)) {
            console.error('Particle shader program linking error:', gl.getProgramInfoLog(program!));
            return null;
        }

        return program!;
    }

    private initializeBuffers(): void {
        const gl = this.gl;

        // Create VAO for particles
        this.particleVAO = gl.createVertexArray();
        gl.bindVertexArray(this.particleVAO);

        // Create VBO for particle data
        this.particleVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVBO);

        // Vertex attributes: position (3), texCoord (2), color (4), size (1), rotation (1)
        const stride = (3 + 2 + 4 + 1 + 1) * 4; // 11 floats * 4 bytes

        gl.enableVertexAttribArray(0); // position
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(1); // texCoord
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);

        gl.enableVertexAttribArray(2); // color
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 20);

        gl.enableVertexAttribArray(3); // size
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36);

        gl.enableVertexAttribArray(4); // rotation
        gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 40);

        // Create EBO for indices
        this.particleEBO = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.particleEBO);

        gl.bindVertexArray(null);

        // Initialize particle pool
        for (let i = 0; i < this.maxParticles; i++) {
            this.particlePool.push({
                id: i,
                position: Vec3.create(),
                velocity: Vec3.create(),
                acceleration: Vec3.create(),
                color: [1, 1, 1, 1],
                size: 1,
                rotation: 0,
                life: 0,
                maxLife: 1,
                emitterId: '',
                textureId: '',
                trail: undefined,
                customData: {}
            });
        }
    }

    private initializeDefaultTextures(): void {
        const gl = this.gl;

        // Create default particle texture (circle)
        const size = 32;
        const data = new Uint8Array(size * size * 4);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - size / 2;
                const dy = y - size / 2;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const alpha = Math.max(0, 1 - distance / (size / 2));

                const index = (y * size + x) * 4;
                data[index] = 255; // R
                data[index + 1] = 255; // G
                data[index + 2] = 255; // B
                data[index + 3] = Math.floor(alpha * 255); // A
            }
        }

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.particleTextures.set('default_circle', texture!);

        // Create square texture
        const squareData = new Uint8Array(size * size * 4);
        for (let i = 0; i < squareData.length; i += 4) {
            squareData[i] = 255;
            squareData[i + 1] = 255;
            squareData[i + 2] = 255;
            squareData[i + 3] = 255;
        }

        const squareTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, squareTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, squareData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        this.particleTextures.set('default_square', squareTexture!);
    }

    // Emitter management
    createEmitter(config: ParticleEmitterConfig): string {
        const emitterId = `emitter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const emitter: ParticleEmitter = {
            id: emitterId,
            position: Vec3.fromValues(...config.position),
            direction: Vec3.fromValues(...(config.direction || [0, 1, 0])),
            enabled: true,
            emitting: false,
            loop: config.loop || false,
            duration: config.duration || -1,
            startDelay: config.startDelay || 0,
            emissionRate: config.emissionRate || 10,
            burstCount: config.burstCount || 0,
            burstTime: config.burstTime || 0,

            // Particle properties
            lifetime: config.lifetime || [1, 1],
            speed: config.speed || [1, 1],
            size: config.size || [1, 1],
            rotation: config.rotation || [0, 0],
            color: config.color || [[1, 1, 1, 1], [1, 1, 1, 1]],
            textureId: config.textureId || 'default_circle',

            // Shape and emission
            shape: config.shape || 'point',
            shapeSize: config.shapeSize || [0, 0, 0],
            angle: config.angle || [0, 360],
            radius: config.radius || [0, 0],

            // Physics
            gravity: Vec3.fromValues(...(config.gravity || [0, -9.81, 0])),
            drag: config.drag || 0,
            velocityInheritance: config.velocityInheritance || 0,

            // Rendering
            blendMode: config.blendMode || 'alpha',
            sortingMode: config.sortingMode || 'none',
            renderOrder: config.renderOrder || 0,
            maxParticles: config.maxParticles || 1000,

            // Advanced features
            subEmitters: [],
            trails: [],
            forceFields: [],
            renderer: config.renderer || 'billboard',
            material: config.material || 'default',

            // State
            age: 0,
            particlesEmitted: 0,
            lastEmissionTime: 0,
            paused: false
        };

        this.emitters.set(emitterId, emitter);
        this.particles.set(emitterId, []);

        // Initialize sub-emitters
        if (config.subEmitters) {
            for (const subConfig of config.subEmitters) {
                this.addSubEmitter(emitterId, subConfig);
            }
        }

        // Initialize trails
        if (config.trails) {
            for (const trailConfig of config.trails) {
                this.addTrail(emitterId, trailConfig);
            }
        }

        console.log(`[AdvancedParticleSystem] Created emitter: ${emitterId}`);
        return emitterId;
    }

    destroyEmitter(emitterId: string): void {
        const emitter = this.emitters.get(emitterId);
        if (!emitter) return;

        // Clean up particles
        const emitterParticles = this.particles.get(emitterId) || [];
        for (const particle of emitterParticles) {
            this.returnParticleToPool(particle);
        }
        this.particles.delete(emitterId);

        // Clean up sub-emitters
        const subEmitters = this.subEmitters.get(emitterId) || [];
        for (const subEmitter of subEmitters) {
            this.destroyEmitter(subEmitter.emitterId);
        }
        this.subEmitters.delete(emitterId);

        // Clean up trails
        this.trails.delete(emitterId);

        this.emitters.delete(emitterId);
        console.log(`[AdvancedParticleSystem] Destroyed emitter: ${emitterId}`);
    }

    // Particle emission
    emitParticles(emitterId: string, count: number): void {
        const emitter = this.emitters.get(emitterId);
        if (!emitter || !emitter.enabled) return;

        const emitterParticles = this.particles.get(emitterId) || [];
        if (emitterParticles.length >= emitter.maxParticles) return;

        const particlesToEmit = Math.min(count, emitter.maxParticles - emitterParticles.length);

        for (let i = 0; i < particlesToEmit; i++) {
            const particle = this.getParticleFromPool();
            if (!particle) break;

            this.initializeParticle(particle, emitter);
            emitterParticles.push(particle);
            emitter.particlesEmitted++;
        }

        this.particles.set(emitterId, emitterParticles);
    }

    private initializeParticle(particle: Particle, emitter: ParticleEmitter): void {
        // Position based on emission shape
        this.setParticlePosition(particle, emitter);

        // Direction and speed
        this.setParticleVelocity(particle, emitter);

        // Other properties
        particle.life = this.randomBetween(emitter.lifetime[0], emitter.lifetime[1]);
        particle.maxLife = particle.life;
        particle.size = this.randomBetween(emitter.size[0], emitter.size[1]);
        particle.rotation = this.randomBetween(emitter.rotation[0], emitter.rotation[1]);
        particle.emitterId = emitter.id;
        particle.textureId = emitter.textureId;

        // Color interpolation
        const lifeRatio = 1.0;
        const startColor = emitter.color[0];
        const endColor = emitter.color[1];
        for (let i = 0; i < 4; i++) {
            particle.color[i] = startColor[i] + (endColor[i] - startColor[i]) * lifeRatio;
        }

        // Initialize trail if needed
        if (emitter.trails.length > 0) {
            particle.trail = {
                id: `trail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                emitterId: emitter.id,
                positions: [Vec3.clone(particle.position)],
                colors: [[particle.color[0], particle.color[1], particle.color[2], particle.color[3]] as any],
                widths: [particle.size],
                maxLength: emitter.trails[0].maxLength,
                textureId: emitter.trails[0].textureId,
                age: 0,
                enabled: true
            };
        }
    }

    private setParticlePosition(particle: Particle, emitter: ParticleEmitter): void {
        Vec3.copy(particle.position, emitter.position);

        switch (emitter.shape) {
            case 'point':
                // Already at emitter position
                break;

            case 'sphere':
                const radius = this.randomBetween(emitter.radius[0], emitter.radius[1]);
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI;

                particle.position[0] += radius * Math.sin(phi) * Math.cos(theta);
                particle.position[1] += radius * Math.sin(phi) * Math.sin(theta);
                particle.position[2] += radius * Math.cos(phi);
                break;

            case 'box':
                particle.position[0] += (Math.random() - 0.5) * emitter.shapeSize[0];
                particle.position[1] += (Math.random() - 0.5) * emitter.shapeSize[1];
                particle.position[2] += (Math.random() - 0.5) * emitter.shapeSize[2];
                break;

            case 'circle':
                const circleRadius = this.randomBetween(emitter.radius[0], emitter.radius[1]);
                const angle = Math.random() * Math.PI * 2;

                particle.position[0] += Math.cos(angle) * circleRadius;
                particle.position[2] += Math.sin(angle) * circleRadius;
                break;

            case 'cone':
                const coneRadius = this.randomBetween(emitter.radius[0], emitter.radius[1]);
                const coneDistance = Math.random();

                const radialAngle = Math.random() * Math.PI * 2;
                const radialRadius = coneRadius * coneDistance;

                particle.position[0] += Math.cos(radialAngle) * radialRadius;
                particle.position[1] += coneDistance;
                particle.position[2] += Math.sin(radialAngle) * radialRadius;
                break;
        }
    }

    private setParticleVelocity(particle: Particle, emitter: ParticleEmitter): void {
        const speed = this.randomBetween(emitter.speed[0], emitter.speed[1]);
        const angleRange = (emitter.angle[1] - emitter.angle[0]) * Math.PI / 180;
        const baseAngle = emitter.angle[0] * Math.PI / 180;

        const angle = baseAngle + Math.random() * angleRange;
        const elevation = (Math.random() - 0.5) * Math.PI / 2; // -90 to 90 degrees

        Vec3.set(particle.velocity,
            Math.cos(angle) * Math.cos(elevation) * speed,
            Math.sin(elevation) * speed,
            Math.sin(angle) * Math.cos(elevation) * speed
        );

        // Apply velocity inheritance
        if (emitter.velocityInheritance > 0) {
            // Would inherit velocity from parent object
        }
    }

    private randomBetween(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    // Particle simulation
    update(deltaTime: number): void {
        if (this.simulationPaused) return;

        const scaledDeltaTime = deltaTime * this.timeScale;
        this.accumulator += scaledDeltaTime;

        // Fixed timestep simulation
        while (this.accumulator >= this.fixedTimeStep) {
            this.updateFixed(this.fixedTimeStep);
            this.accumulator -= this.fixedTimeStep;
        }

        // Update performance stats
        this.updatePerformanceStats();
    }

    private updateFixed(deltaTime: number): void {
        // Update emitters
        for (const emitter of this.emitters.values()) {
            if (!emitter.enabled || emitter.paused) continue;

            emitter.age += deltaTime;

            // Check if emitter should start
            if (emitter.age >= emitter.startDelay && !emitter.emitting) {
                emitter.emitting = true;
                emitter.lastEmissionTime = emitter.age;
            }

            // Check if emitter should stop
            if (emitter.duration > 0 && emitter.age >= emitter.duration) {
                emitter.emitting = false;
                if (!emitter.loop) {
                    emitter.enabled = false;
                } else {
                    emitter.age = 0;
                    emitter.emitting = false;
                }
            }

            // Emit particles
            if (emitter.emitting) {
                const timeSinceLastEmission = emitter.age - emitter.lastEmissionTime;
                const particlesToEmit = Math.floor(timeSinceLastEmission * emitter.emissionRate);

                if (particlesToEmit > 0) {
                    this.emitParticles(emitter.id, particlesToEmit);
                    emitter.lastEmissionTime = emitter.age;
                }

                // Handle bursts
                if (emitter.burstCount > 0 && emitter.age >= emitter.burstTime) {
                    this.emitParticles(emitter.id, emitter.burstCount);
                    emitter.burstTime += emitter.burstTime; // Schedule next burst
                }
            }
        }

        // Update particles
        this.updateParticlesCPU(deltaTime);

        // Update trails
        this.updateTrails(deltaTime);

        // Apply force fields
        this.applyForceFields(deltaTime);

        // Handle sub-emitters
        this.updateSubEmitters(deltaTime);
    }

    private updateParticlesCPU(deltaTime: number): void {
        for (const [emitterId, emitterParticles] of this.particles) {
            const emitter = this.emitters.get(emitterId);
            if (!emitter) continue;

            for (let i = emitterParticles.length - 1; i >= 0; i--) {
                const particle = emitterParticles[i];

                // Update physics
                Vec3.scaleAndAdd(particle.velocity, particle.velocity, emitter.gravity, deltaTime);
                Vec3.scaleAndAdd(particle.position, particle.position, particle.velocity, deltaTime);

                // Apply drag
                Vec3.scale(particle.velocity, particle.velocity, 1 - emitter.drag * deltaTime);

                // Update life
                particle.life -= deltaTime;

                // Update color interpolation
                const lifeRatio = particle.life / particle.maxLife;
                const startColor = emitter.color[0];
                const endColor = emitter.color[1];
                for (let c = 0; c < 4; c++) {
                    particle.color[c] = startColor[c] + (endColor[c] - startColor[c]) * (1 - lifeRatio);
                }

                // Update size interpolation
                if (emitter.size.length > 1) {
                    const sizeRatio = 1 - lifeRatio;
                    particle.size = emitter.size[0] + (emitter.size[1] - emitter.size[0]) * sizeRatio;
                }

                // Update rotation
                particle.rotation += deltaTime * 2; // Simple rotation

                // Update trail
                if (particle.trail) {
                    this.updateParticleTrail(particle, deltaTime);
                }

                // Remove dead particles
                if (particle.life <= 0) {
                    this.returnParticleToPool(particle);
                    emitterParticles.splice(i, 1);
                }
            }
        }
    }



    private updateParticleTrail(particle: Particle, _deltaTime: number): void {
        if (!particle.trail) return;

        const trail = particle.trail;

        // Add current position to trail
        trail.positions.unshift(Vec3.clone(particle.position));
        trail.colors.unshift([particle.color[0], particle.color[1], particle.color[2], particle.color[3]] as any);
        trail.widths.unshift(particle.size);

        // Limit trail length
        if (trail.positions.length > trail.maxLength) {
            trail.positions.pop();
            trail.colors.pop();
            trail.widths.pop();
        }
    }

    private updateTrails(deltaTime: number): void {
        // Update trail effects
        for (const [_emitterId, emitterTrails] of this.trails) {
            for (const trail of emitterTrails) {
                // Update trail properties
                trail.age += deltaTime;

                // Fade trail over time
                for (let i = 0; i < trail.colors.length; i++) {
                    trail.colors[i][3] *= 0.98; // Fade alpha
                }
            }
        }
    }

    private applyForceFields(_deltaTime: number): void {
        for (const forceField of this.forceFields.values()) {
            if (!forceField.enabled) continue;

            for (const [_emitterId, emitterParticles] of this.particles) {
                for (const particle of emitterParticles) {
                    this.applyForceFieldToParticle(forceField, particle, _deltaTime);
                }
            }
        }
    }

    private applyForceFieldToParticle(forceField: ForceField, particle: Particle, deltaTime: number): void {
        const delta = Vec3.create();
        Vec3.subtract(delta, particle.position, forceField.position);

        const distance = Vec3.length(delta);
        if (distance > forceField.radius) return;

        const force = Vec3.create();
        const normalizedDelta = Vec3.create();
        Vec3.normalize(normalizedDelta, delta);

        switch (forceField.type) {
            case 'radial':
                if (forceField.attraction) {
                    Vec3.scale(force, normalizedDelta, -forceField.strength / (distance * distance + 1));
                } else {
                    Vec3.scale(force, normalizedDelta, forceField.strength / (distance * distance + 1));
                }
                break;

            case 'vortex':
                Vec3.cross(force, normalizedDelta, Vec3.fromValues(0, 1, 0));
                Vec3.scale(force, force, forceField.strength / (distance + 1));
                break;

            case 'wind':
                Vec3.copy(force, forceField.direction);
                Vec3.scale(force, force, forceField.strength);
                break;
        }

        // Apply falloff
        const falloff = 1 - Math.min(distance / forceField.radius, 1);
        Vec3.scale(force, force, falloff);

        // Apply force to particle
        Vec3.scaleAndAdd(particle.velocity, particle.velocity, force, deltaTime);
    }

    private updateSubEmitters(_deltaTime: number): void {
        for (const [parentEmitterId, subEmitters] of this.subEmitters) {
            for (const subEmitter of subEmitters) {
                if (!subEmitter.enabled) continue;

                // Check trigger conditions
                const parentParticles = this.particles.get(parentEmitterId) || [];
                for (const particle of parentParticles) {
                    const lifeRatio = particle.life / particle.maxLife;

                    if (subEmitter.triggerCondition === 'death' && particle.life <= 0) {
                        this.emitParticles(subEmitter.emitterId, subEmitter.particlesPerEvent);
                    } else if (subEmitter.triggerCondition === 'collision') {
                        // Would check for particle collisions
                    } else if (subEmitter.triggerCondition === 'time' && lifeRatio <= subEmitter.triggerTime!) {
                        this.emitParticles(subEmitter.emitterId, subEmitter.particlesPerEvent);
                    }
                }
            }
        }
    }

    // Sub-emitter system
    addSubEmitter(parentEmitterId: string, config: SubEmitterConfig): string {
        const subEmitterId = this.createEmitter(config.emitterConfig);

        const subEmitter: SubEmitter = {
            emitterId: subEmitterId,
            parentEmitterId,
            triggerCondition: config.triggerCondition,
            triggerTime: config.triggerTime || 0,
            particlesPerEvent: config.particlesPerEvent || 1,
            enabled: true
        };

        if (!this.subEmitters.has(parentEmitterId)) {
            this.subEmitters.set(parentEmitterId, []);
        }
        this.subEmitters.get(parentEmitterId)!.push(subEmitter);

        return subEmitterId;
    }

    // Trail system
    addTrail(emitterId: string, config: TrailConfig): string {
        const trailId = `trail_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const trail: ParticleTrail = {
            id: trailId,
            emitterId,
            positions: [],
            textureId: config.textureId || 'default_circle',
            maxLength: config.maxLength || 20,
            widths: config.width || [1, 0],
            colors: config.color || [[1, 1, 1, 1], [1, 1, 1, 0]] as any,
            age: 0,
            enabled: true
        };

        if (!this.trails.has(emitterId)) {
            this.trails.set(emitterId, []);
        }
        this.trails.get(emitterId)!.push(trail);

        return trailId;
    }

    // Force field system
    createForceField(config: ForceFieldConfig): string {
        const forceFieldId = `force_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const forceField: ForceField = {
            id: forceFieldId,
            type: config.type,
            position: Vec3.fromValues(...config.position),
            direction: Vec3.fromValues(...(config.direction || [0, 0, 0])),
            strength: config.strength || 1,
            radius: config.radius || 10,
            attraction: config.attraction || false,
            enabled: true
        };

        this.forceFields.set(forceFieldId, forceField);
        console.log(`[AdvancedParticleSystem] Created force field: ${forceFieldId}`);

        return forceFieldId;
    }

    // Rendering
    render(viewMatrix: Mat4, projectionMatrix: Mat4, cameraPosition: Vec3): void {
        const renderStartTime = performance.now();

        const gl = this.gl;
        const viewProjection = Mat4.create();
        Mat4.multiply(viewProjection, projectionMatrix, viewMatrix);

        // Set up render state
        gl.useProgram(this.particleShader);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.particleShader!, 'u_viewProjection'), false, viewProjection);
        gl.uniform3fv(gl.getUniformLocation(this.particleShader!, 'u_cameraPosition'), cameraPosition);
        gl.uniform1f(gl.getUniformLocation(this.particleShader!, 'u_time'), performance.now() / 1000);

        // Enable blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Disable depth writing for particles
        gl.depthMask(false);

        // Bind VAO
        gl.bindVertexArray(this.particleVAO);

        // Render particles by batch
        this.buildRenderBatches();

        for (const batch of this.particleBatches) {
            this.renderBatch(batch);
        }

        // Render trails
        this.renderTrails(viewProjection, cameraPosition);

        // Clean up
        gl.depthMask(true);
        gl.bindVertexArray(null);

        this.performanceStats.renderTime = performance.now() - renderStartTime;
    }

    private buildRenderBatches(): void {
        this.particleBatches.length = 0;
        this.renderGroups.clear();

        // Group particles by texture and blend mode for efficient rendering
        for (const [emitterId, emitterParticles] of this.particles) {
            const emitter = this.emitters.get(emitterId);
            if (!emitter) continue;

            const textureId = emitter.textureId;
            const blendMode = emitter.blendMode;
            const groupKey = `${textureId}_${blendMode}`;

            if (!this.renderGroups.has(groupKey)) {
                this.renderGroups.set(groupKey, {
                    textureId,
                    blendMode,
                    particles: [],
                    vertexData: [],
                    indexData: []
                });
            }

            const group = this.renderGroups.get(groupKey)!;
            group.particles.push(...emitterParticles);
        }

        // Convert groups to batches
        for (const group of this.renderGroups.values()) {
            if (group.particles.length === 0) continue;

            const batch: ParticleBatch = {
                textureId: group.textureId,
                blendMode: group.blendMode,
                particles: group.particles,
                vertexBuffer: null,
                indexBuffer: null
            };

            this.particleBatches.push(batch);
        }
    }

    private renderBatch(batch: ParticleBatch): void {
        const gl = this.gl;

        // Set blend mode
        const blendMode = this.blendModes.get(batch.blendMode) || this.blendModes.get('alpha');
        if (blendMode) {
            gl.blendFunc(blendMode.src, blendMode.dst);
        }

        // Bind texture
        const texture = this.particleTextures.get(batch.textureId);
        if (texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(gl.getUniformLocation(this.particleShader!, 'u_texture'), 0);
        }

        // Set shader uniforms
        gl.uniform1i(gl.getUniformLocation(this.particleShader!, 'u_blendMode'), this.getBlendModeIndex(batch.blendMode));
        gl.uniform1f(gl.getUniformLocation(this.particleShader!, 'u_softness'), 0.1);

        // Build vertex data for this batch
        const vertexData = new Float32Array(batch.particles.length * 6 * 11); // 6 vertices per particle, 11 floats per vertex
        const indexData = new Uint16Array(batch.particles.length * 6);

        let vertexIndex = 0;
        let indexIndex = 0;

        for (let i = 0; i < batch.particles.length; i++) {
            const particle = batch.particles[i];

            // Quad vertices (two triangles)
            const quadVertices = [
                // Bottom-left
                particle.position[0], particle.position[1], particle.position[2],
                0, 1, // texCoord
                ...particle.color, // color
                particle.size, particle.rotation,

                // Bottom-right
                particle.position[0], particle.position[1], particle.position[2],
                1, 1, // texCoord
                ...particle.color, // color
                particle.size, particle.rotation,

                // Top-right
                particle.position[0], particle.position[1], particle.position[2],
                1, 0, // texCoord
                ...particle.color, // color
                particle.size, particle.rotation,

                // Top-left
                particle.position[0], particle.position[1], particle.position[2],
                0, 0, // texCoord
                ...particle.color, // color
                particle.size, particle.rotation
            ];

            // Copy vertex data
            for (let j = 0; j < quadVertices.length; j++) {
                vertexData[vertexIndex++] = quadVertices[j];
            }

            // Indices for two triangles
            const baseIndex = i * 4;
            const indices = [
                baseIndex, baseIndex + 1, baseIndex + 2,
                baseIndex, baseIndex + 2, baseIndex + 3
            ];

            for (const index of indices) {
                indexData[indexIndex++] = index;
            }
        }

        // Upload vertex data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVBO);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

        // Upload index data
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.particleEBO);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.DYNAMIC_DRAW);

        // Draw
        gl.drawElements(gl.TRIANGLES, indexData.length, gl.UNSIGNED_SHORT, 0);
    }

    private renderTrails(_viewProjection: Mat4, _cameraPosition: Vec3): void {
        // Render particle trails as connected line strips
        const gl = this.gl;

        for (const [_emitterId, emitterTrails] of this.trails) {
            for (const trail of emitterTrails) {
                if (trail.positions.length < 2) continue;

                // Build trail geometry
                const vertexData = new Float32Array(trail.positions.length * 2 * 11); // Two vertices per position
                let vertexIndex = 0;

                for (let i = 0; i < trail.positions.length - 1; i++) {
                    const pos1 = trail.positions[i];
                    const pos2 = trail.positions[i + 1];
                    const color1 = trail.colors[i];
                    const width1 = trail.widths[i];

                    // Calculate perpendicular vectors for trail width
                    const delta = Vec3.create();
                    Vec3.subtract(delta, pos2, pos1);
                    Vec3.normalize(delta, delta);

                    const perp = Vec3.create();
                    Vec3.cross(perp, delta, Vec3.fromValues(0, 1, 0));
                    Vec3.normalize(perp, perp);

                    // Create quad vertices
                    const halfWidth1 = width1 * 0.5;

                    // Side 1
                    Vec3.scaleAndAdd(perp, pos1, perp, -halfWidth1);
                    vertexData[vertexIndex++] = perp[0];
                    vertexData[vertexIndex++] = perp[1];
                    vertexData[vertexIndex++] = perp[2];
                    vertexData[vertexIndex++] = 0; // u
                    vertexData[vertexIndex++] = 0; // v
                    vertexData[vertexIndex++] = color1[0];
                    vertexData[vertexIndex++] = color1[1];
                    vertexData[vertexIndex++] = color1[2];
                    vertexData[vertexIndex++] = color1[3];
                    vertexData[vertexIndex++] = width1;
                    vertexData[vertexIndex++] = 0; // rotation

                    // Side 2
                    Vec3.scaleAndAdd(perp, pos1, perp, halfWidth1);
                    vertexData[vertexIndex++] = perp[0];
                    vertexData[vertexIndex++] = perp[1];
                    vertexData[vertexIndex++] = perp[2];
                    vertexData[vertexIndex++] = 1; // u
                    vertexData[vertexIndex++] = 0; // v
                    vertexData[vertexIndex++] = color1[0];
                    vertexData[vertexIndex++] = color1[1];
                    vertexData[vertexIndex++] = color1[2];
                    vertexData[vertexIndex++] = color1[3];
                    vertexData[vertexIndex++] = width1;
                    vertexData[vertexIndex++] = 0; // rotation
                }

                // Upload and draw trail
                gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVBO);
                gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

                gl.drawArrays(gl.TRIANGLE_STRIP, 0, trail.positions.length * 2);
            }
        }
    }

    private getBlendModeIndex(blendMode: string): number {
        switch (blendMode) {
            case 'additive': return 1;
            case 'multiply': return 2;
            default: return 0; // alpha
        }
    }

    // Particle pool management
    private getParticleFromPool(): Particle | null {
        if (this.particlePool.length === 0) {
            // Pool exhausted, create new particle
            const particle: Particle = {
                id: this.activeParticles++,
                position: Vec3.create(),
                velocity: Vec3.create(),
                acceleration: Vec3.create(),
                color: [1, 1, 1, 1],
                size: 1,
                rotation: 0,
                life: 0,
                maxLife: 1,
                emitterId: '',
                textureId: '',
                trail: undefined,
                customData: {}
            };
            return particle;
        }

        return this.particlePool.pop()!;
    }

    private returnParticleToPool(particle: Particle): void {
        // Reset particle properties
        Vec3.set(particle.position, 0, 0, 0);
        Vec3.set(particle.velocity, 0, 0, 0);
        Vec3.set(particle.acceleration, 0, 0, 0);
        particle.color = [1, 1, 1, 1];
        particle.size = 1;
        particle.rotation = 0;
        particle.life = 0;
        particle.maxLife = 1;
        particle.emitterId = '';
        particle.textureId = '';
        particle.trail = undefined;
        particle.customData = {};

        this.particlePool.push(particle);
        this.activeParticles--;
    }

    // Configuration and control
    setSimulationPaused(paused: boolean): void {
        this.simulationPaused = paused;
    }

    setTimeScale(scale: number): void {
        this.timeScale = Math.max(0, scale);
    }

    // Performance and debugging
    private updatePerformanceStats(): void {
        this.performanceStats.activeParticles = this.activeParticles;
        this.performanceStats.emittedPerSecond = 0; // Would need to track over time
        this.performanceStats.renderedPerSecond = 0; // Would need to track over time
    }

    getPerformanceStats(): ParticlePerformanceStats {
        return { ...this.performanceStats };
    }

    // Cleanup
    dispose(): void {
        const gl = this.gl;

        // Clean up WebGL resources
        if (this.particleShader) gl.deleteProgram(this.particleShader);
        if (this.computeShader) gl.deleteProgram(this.computeShader);
        if (this.particleVAO) gl.deleteVertexArray(this.particleVAO);
        if (this.particleVBO) gl.deleteBuffer(this.particleVBO);
        if (this.particleEBO) gl.deleteBuffer(this.particleEBO);
        if (this.transformFeedback) gl.deleteTransformFeedback(this.transformFeedback);

        // Clean up textures
        for (const texture of this.particleTextures.values()) {
            gl.deleteTexture(texture);
        }

        // Clear data structures
        this.emitters.clear();
        this.particles.clear();
        this.forceFields.clear();
        this.subEmitters.clear();
        this.trails.clear();
        this.particlePool.length = 0;
        this.particleBatches.length = 0;
        this.renderGroups.clear();
        this.blendModes.clear();
        this.renderers.clear();
        this.materials.clear();

        console.log('[AdvancedParticleSystem] Disposed');
    }
}

// Type definitions
interface Particle {
    id: number;
    position: Vec3;
    velocity: Vec3;
    acceleration: Vec3;
    color: Vec4;
    size: number;
    rotation: number;
    life: number;
    maxLife: number;
    emitterId: string;
    textureId: string;
    trail?: ParticleTrail;
    customData: any;
}

interface ParticleEmitter {
    id: string;
    position: Vec3;
    direction: Vec3;
    enabled: boolean;
    emitting: boolean;
    loop: boolean;
    duration: number;
    startDelay: number;
    emissionRate: number;
    burstCount: number;
    burstTime: number;

    // Particle properties
    lifetime: [number, number];
    speed: [number, number];
    size: [number, number];
    rotation: [number, number];
    color: [Vec4, Vec4];
    textureId: string;

    // Shape and emission
    shape: 'point' | 'sphere' | 'box' | 'circle' | 'cone';
    shapeSize: [number, number, number];
    angle: [number, number];
    radius: [number, number];

    // Physics
    gravity: Vec3;
    drag: number;
    velocityInheritance: number;

    // Rendering
    blendMode: string;
    sortingMode: string;
    renderOrder: number;
    maxParticles: number;

    // Advanced features
    subEmitters: SubEmitter[];
    trails: ParticleTrail[];
    forceFields: string[];
    renderer: string;
    material: string;

    // State
    age: number;
    particlesEmitted: number;
    lastEmissionTime: number;
    paused: boolean;
}

interface ParticleEmitterConfig {
    position: [number, number, number];
    direction?: [number, number, number];
    loop?: boolean;
    duration?: number;
    startDelay?: number;
    emissionRate?: number;
    burstCount?: number;
    burstTime?: number;

    lifetime?: [number, number];
    speed?: [number, number];
    size?: [number, number];
    rotation?: [number, number];
    color?: [Vec4, Vec4];
    textureId?: string;

    shape?: 'point' | 'sphere' | 'box' | 'circle' | 'cone';
    shapeSize?: [number, number, number];
    angle?: [number, number];
    radius?: [number, number];

    gravity?: [number, number, number];
    drag?: number;
    velocityInheritance?: number;

    blendMode?: string;
    sortingMode?: string;
    renderOrder?: number;
    maxParticles?: number;

    subEmitters?: SubEmitterConfig[];
    trails?: TrailConfig[];
    renderer?: string;
    material?: string;
}

interface SubEmitter {
    emitterId: string;
    parentEmitterId: string;
    triggerCondition: 'death' | 'collision' | 'time';
    triggerTime?: number;
    particlesPerEvent: number;
    enabled: boolean;
}

interface SubEmitterConfig {
    emitterConfig: ParticleEmitterConfig;
    triggerCondition: 'death' | 'collision' | 'time';
    triggerTime?: number;
    particlesPerEvent?: number;
}

interface ParticleTrail {
    id: string;
    emitterId: string;
    positions: Vec3[];
    colors: Vec4[];
    widths: number[];
    maxLength: number;
    textureId: string;
    age: number;
    enabled: boolean;
}

interface TrailConfig {
    textureId?: string;
    maxLength?: number;
    width?: [number, number];
    color?: [Vec4, Vec4];
}

interface ForceField {
    id: string;
    type: 'radial' | 'vortex' | 'wind';
    position: Vec3;
    direction: Vec3;
    strength: number;
    radius: number;
    attraction: boolean;
    enabled: boolean;
}

interface ForceFieldConfig {
    type: 'radial' | 'vortex' | 'wind';
    position: [number, number, number];
    direction?: [number, number, number];
    strength?: number;
    radius?: number;
    attraction?: boolean;
}

interface ParticleBatch {
    textureId: string;
    blendMode: string;
    particles: Particle[];
    vertexBuffer: Float32Array | null;
    indexBuffer: Uint16Array | null;
}

interface ParticleRenderGroup {
    textureId: string;
    blendMode: string;
    particles: Particle[];
    vertexData: number[];
    indexData: number[];
}

interface BlendMode {
    src: number;
    dst: number;
}

interface ParticleRenderer {
    id: string;
    type: 'billboard' | 'stretched' | 'horizontal' | 'vertical' | 'sprite';
    settings: any;
}

interface ParticleMaterial {
    id: string;
    shader: string;
    uniforms: Map<string, any>;
    blending: boolean;
    depthTest: boolean;
    depthWrite: boolean;
}

interface ParticlePerformanceStats {
    activeParticles: number;
    emittedPerSecond: number;
    renderedPerSecond: number;
    updateTime: number;
    renderTime: number;
}

// Utility types
type Vec4 = [number, number, number, number];
