import { Vec2, Vec3, Mat4 } from '../math';

/**
 * Advanced Graphics System with advanced rendering techniques, post-processing effects,
 * GPU compute shaders, ray tracing, global illumination, and visual effects.
 */
export class AdvancedGraphicsSystem {
    private gl: WebGL2RenderingContext;
    private canvas: HTMLCanvasElement;

    // Core rendering
    private shaderPrograms: Map<string, ShaderProgram> = new Map();
    private computePrograms: Map<string, ComputeProgram> = new Map();
    private framebuffers: Map<string, Framebuffer> = new Map();
    private renderTargets: Map<string, RenderTarget> = new Map();

    // Post-processing pipeline
    private postProcessEffects: PostProcessEffect[] = [];
    private bloomEffect: BloomEffect;
    private toneMapping: ToneMappingEffect;
    private colorGrading: ColorGradingEffect;
    private ssaoEffect: SSAOEffect;
    private ssrEffect: SSREffect;
    private motionBlurEffect: MotionBlurEffect;
    private depthOfFieldEffect: DepthOfFieldEffect;

    // Advanced rendering techniques
    private rayTracer: RayTracer;
    private globalIllumination: GlobalIllumination;
    private volumetricLighting: VolumetricLighting;
    private particleRenderer: AdvancedParticleRenderer;
    private decalRenderer: DecalRenderer;

    // GPU compute
    private computeShaders: Map<string, ComputeShader> = new Map();
    private gpuBuffers: Map<string, GPUBuffer> = new Map();

    // Visual effects
    private visualEffects: Map<string, VisualEffect> = new Map();
    private effectInstances: EffectInstance[] = [];

    // Performance and optimization
    private renderStats: RenderStats = {
        drawCalls: 0,
        triangles: 0,
        frameTime: 0,
        gpuMemory: 0,
        shaderSwitches: 0,
        textureBinds: 0
    };

    // Culling and optimization
    private frustumCuller: FrustumCuller;
    private occlusionCuller: OcclusionCuller;
    private lodManager: LODManager;

    // Debug and profiling
    private debugRenderer: DebugRenderer;
    private profiler: GraphicsProfiler;

    constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
        this.gl = gl;
        this.canvas = canvas;

        // Initialize core systems
        this.initializeShaders();
        this.initializeComputeShaders();
        this.initializeFramebuffers();
        this.initializePostProcessing();
        this.initializeAdvancedRendering();

        // Initialize optimization systems
        this.frustumCuller = new FrustumCuller();
        this.occlusionCuller = new OcclusionCuller();
        this.lodManager = new LODManager();

        // Initialize debug systems
        this.debugRenderer = new DebugRenderer(gl);
        this.profiler = new GraphicsProfiler();

        console.log('[AdvancedGraphicsSystem] Advanced graphics system initialized');
    }

    private initializeShaders(): void {
        // PBR shader with advanced lighting
        const pbrVertexShader = `#version 300 es
            layout(location = 0) in vec3 a_position;
            layout(location = 1) in vec3 a_normal;
            layout(location = 2) in vec2 a_texCoord;
            layout(location = 3) in vec4 a_tangent;
            layout(location = 4) in vec4 a_color;
            layout(location = 5) in vec3 a_instancePosition;
            layout(location = 6) in vec4 a_instanceRotation;
            layout(location = 7) in vec3 a_instanceScale;

            uniform mat4 u_modelViewProjection;
            uniform mat4 u_model;
            uniform mat4 u_view;
            uniform mat3 u_normalMatrix;
            uniform vec3 u_cameraPosition;

            out vec3 v_worldPos;
            out vec3 v_viewPos;
            out vec3 v_normal;
            out vec2 v_texCoord;
            out mat3 v_tbnMatrix;
            out vec4 v_color;
            out vec3 v_cameraDir;

            vec3 rotateVector(vec4 q, vec3 v) {
                vec3 qvec = q.xyz;
                vec3 uv = cross(qvec, v);
                vec3 uuv = cross(qvec, uv);
                return v + ((uv * q.w) + uuv) * 2.0;
            }

            void main() {
                // Apply instance transformation
                vec3 position = a_position * a_instanceScale;
                position = rotateVector(a_instanceRotation, position);
                position += a_instancePosition;

                vec4 worldPos = u_model * vec4(position, 1.0);
                gl_Position = u_modelViewProjection * vec4(position, 1.0);

                v_worldPos = worldPos.xyz;
                v_viewPos = (u_view * worldPos).xyz;
                v_normal = normalize(u_normalMatrix * a_normal);
                v_texCoord = a_texCoord;
                v_color = a_color;
                v_cameraDir = normalize(u_cameraPosition - v_worldPos);

                // TBN matrix for normal mapping
                vec3 tangent = normalize(u_normalMatrix * a_tangent.xyz);
                vec3 bitangent = cross(v_normal, tangent) * a_tangent.w;
                v_tbnMatrix = mat3(tangent, bitangent, v_normal);
            }
        `;

        const pbrFragmentShader = `#version 300 es
            precision highp float;

            in vec3 v_worldPos;
            in vec3 v_viewPos;
            in vec3 v_normal;
            in vec2 v_texCoord;
            in mat3 v_tbnMatrix;
            in vec4 v_color;
            in vec3 v_cameraDir;

            uniform sampler2D u_albedoMap;
            uniform sampler2D u_normalMap;
            uniform sampler2D u_metallicRoughnessMap;
            uniform sampler2D u_emissiveMap;
            uniform sampler2D u_occlusionMap;
            uniform samplerCube u_irradianceMap;
            uniform samplerCube u_prefilterMap;
            uniform sampler2D u_brdfLUT;

            uniform vec4 u_baseColor;
            uniform float u_metallic;
            uniform float u_roughness;
            uniform vec3 u_emissive;
            uniform float u_occlusionStrength;
            uniform float u_normalScale;

            // Lighting uniforms
            uniform vec3 u_lightPositions[16];
            uniform vec3 u_lightColors[16];
            uniform float u_lightIntensities[16];
            uniform vec3 u_lightDirections[16];
            uniform float u_lightRanges[16];
            uniform int u_lightTypes[16];
            uniform int u_lightCount;

            // Environment
            uniform vec3 u_ambientColor;
            uniform float u_ambientIntensity;
            uniform float u_exposure;

            out vec4 outColor;

            const float PI = 3.14159265359;
            const float MAX_REFLECTION_LOD = 4.0;

            // PBR functions
            vec3 getNormalFromMap() {
                vec3 tangentNormal = texture(u_normalMap, v_texCoord).xyz * 2.0 - 1.0;
                tangentNormal.xy *= u_normalScale;
                return normalize(v_tbnMatrix * tangentNormal);
            }

            float DistributionGGX(vec3 N, vec3 H, float roughness) {
                float a = roughness * roughness;
                float a2 = a * a;
                float NdotH = max(dot(N, H), 0.0);
                float NdotH2 = NdotH * NdotH;

                float nom = a2;
                float denom = (NdotH2 * (a2 - 1.0) + 1.0);
                denom = PI * denom * denom;

                return nom / denom;
            }

            float GeometrySchlickGGX(float NdotV, float roughness) {
                float r = (roughness + 1.0);
                float k = (r * r) / 8.0;
                return NdotV / (NdotV * (1.0 - k) + k);
            }

            float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
                float NdotV = max(dot(N, V), 0.0);
                float NdotL = max(dot(N, L), 0.0);
                float ggx2 = GeometrySchlickGGX(NdotV, roughness);
                float ggx1 = GeometrySchlickGGX(NdotL, roughness);
                return ggx1 * ggx2;
            }

            vec3 fresnelSchlick(float cosTheta, vec3 F0) {
                return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
            }

            vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
                return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(1.0 - cosTheta, 5.0);
            }

            // IBL functions
            vec3 getIBLContribution(vec3 N, vec3 V, vec3 F0, float roughness, float metallic, vec3 albedo) {
                vec3 F = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);

                vec3 kS = F;
                vec3 kD = 1.0 - kS;
                kD *= 1.0 - metallic;

                vec3 irradiance = texture(u_irradianceMap, N).rgb;
                vec3 diffuse = irradiance * albedo;

                vec3 R = reflect(-V, N);
                vec3 prefilteredColor = textureLod(u_prefilterMap, R, roughness * MAX_REFLECTION_LOD).rgb;
                vec2 brdf = texture(u_brdfLUT, vec2(max(dot(N, V), 0.0), roughness)).rg;
                vec3 specular = prefilteredColor * (F * brdf.x + brdf.y);

                return (kD * diffuse + specular) * u_ambientIntensity;
            }

            vec3 calculateLight(int lightIndex, vec3 N, vec3 V, vec3 F0, float roughness, float metallic, vec3 albedo) {
                vec3 L;
                float attenuation = 1.0;

                if (u_lightTypes[lightIndex] == 0) { // Directional
                    L = normalize(-u_lightDirections[lightIndex]);
                } else if (u_lightTypes[lightIndex] == 1) { // Point
                    L = normalize(u_lightPositions[lightIndex] - v_worldPos);
                    float distance = length(u_lightPositions[lightIndex] - v_worldPos);
                    attenuation = 1.0 / (distance * distance);
                } else if (u_lightTypes[lightIndex] == 2) { // Spot
                    L = normalize(u_lightPositions[lightIndex] - v_worldPos);
                    float distance = length(u_lightPositions[lightIndex] - v_worldPos);
                    attenuation = 1.0 / (distance * distance);

                    // Spot attenuation
                    vec3 lightDir = normalize(u_lightDirections[lightIndex]);
                    float theta = dot(L, -lightDir);
                    float epsilon = 0.1; // inner/outer cutoff difference
                    attenuation *= clamp((theta - 0.9) / epsilon, 0.0, 1.0);
                }

                vec3 H = normalize(V + L);
                vec3 radiance = u_lightColors[lightIndex] * u_lightIntensities[lightIndex] * attenuation;

                float NDF = DistributionGGX(N, H, roughness);
                float G = GeometrySmith(N, V, L, roughness);
                vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

                vec3 kS = F;
                vec3 kD = vec3(1.0) - kS;
                kD *= 1.0 - metallic;

                float NdotL = max(dot(N, L), 0.0);
                vec3 numerator = NDF * G * F;
                float denominator = 4.0 * max(dot(N, V), 0.0) * NdotL;
                vec3 specular = numerator / max(denominator, 0.001);

                return (kD * albedo / PI + specular) * radiance * NdotL;
            }

            void main() {
                vec4 albedo = texture(u_albedoMap, v_texCoord) * u_baseColor * v_color;
                vec3 normal = getNormalFromMap();
                float metallic = texture(u_metallicRoughnessMap, v_texCoord).b * u_metallic;
                float roughness = texture(u_metallicRoughnessMap, v_texCoord).g * u_roughness;
                vec3 emissive = texture(u_emissiveMap, v_texCoord).rgb * u_emissive;
                float occlusion = texture(u_occlusionMap, v_texCoord).r;

                vec3 N = normal;
                vec3 V = normalize(v_cameraDir);

                vec3 F0 = vec3(0.04);
                F0 = mix(F0, albedo.rgb, metallic);

                // Direct lighting
                vec3 Lo = vec3(0.0);
                for (int i = 0; i < u_lightCount; i++) {
                    Lo += calculateLight(i, N, V, F0, roughness, metallic, albedo.rgb);
                }

                // Ambient lighting with IBL
                vec3 ambient = getIBLContribution(N, V, F0, roughness, metallic, albedo.rgb) * u_ambientColor;

                // Apply occlusion
                ambient *= mix(1.0, occlusion, u_occlusionStrength);

                vec3 color = ambient + Lo + emissive;

                // Tone mapping
                color = vec3(1.0) - exp(-color * u_exposure);

                // Gamma correction
                color = pow(color, vec3(1.0 / 2.2));

                outColor = vec4(color, albedo.a);
            }
        `;

        this.shaderPrograms.set('pbr', this.createShaderProgram(pbrVertexShader, pbrFragmentShader));

        // Additional shader programs would go here
        // Shadow mapping, deferred rendering, compute shaders, etc.
    }

    private initializeComputeShaders(): void {
        // Particle simulation compute shader
        const particleComputeShader = `#version 310 es
            layout(local_size_x = 128) in;

            struct Particle {
                vec3 position;
                vec3 velocity;
                vec4 color;
                float life;
                float size;
                uint flags;
            };

            layout(std430, binding = 0) buffer ParticleBuffer {
                Particle particles[];
            };

            uniform float u_deltaTime;
            uniform vec3 u_gravity;
            uniform vec3 u_windForce;

            void main() {
                uint id = gl_GlobalInvocationID.x;
                if (id >= particles.length()) return;

                Particle particle = particles[id];

                // Update physics
                particle.velocity += u_gravity * u_deltaTime;
                particle.velocity += u_windForce * u_deltaTime;
                particle.position += particle.velocity * u_deltaTime;

                // Update life
                particle.life -= u_deltaTime;
                if (particle.life <= 0.0) {
                    particle.flags |= 1u; // Mark for removal
                }

                particles[id] = particle;
            }
        `;

        // Add more compute shaders for various effects
    }

    private initializeFramebuffers(): void {
        const gl = this.gl;

        // G-Buffer for deferred rendering
        const gBuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer);

        // Position buffer
        const positionTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, positionTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, positionTexture, 0);

        // Normal buffer
        const normalTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, normalTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normalTexture, 0);

        // Albedo buffer
        const albedoTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, albedoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, albedoTexture, 0);

        // Depth buffer
        const depthTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, depthTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, gl.canvas.width, gl.canvas.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);

        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);

        this.framebuffers.set('gBuffer', gBuffer!);
        this.renderTargets.set('gBuffer', {
            framebuffer: gBuffer!,
            textures: [positionTexture!, normalTexture!, albedoTexture!],
            depthTexture: depthTexture!
        });

        // Additional framebuffers for various effects
        this.createPostProcessFramebuffers();

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private createPostProcessFramebuffers(): void {
        const gl = this.gl;

        // Create framebuffers for post-processing chain
        const effects = ['bloom', 'ssao', 'ssr', 'motionBlur', 'dof'];

        for (const effect of effects) {
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

            this.framebuffers.set(`${effect}Buffer`, fbo!);
            this.renderTargets.set(`${effect}Buffer`, {
                framebuffer: fbo!,
                textures: [texture!],
                depthTexture: null
            });
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private initializePostProcessing(): void {
        this.bloomEffect = new BloomEffect(this.gl);
        this.toneMapping = new ToneMappingEffect(this.gl);
        this.colorGrading = new ColorGradingEffect(this.gl);
        this.ssaoEffect = new SSAOEffect(this.gl);
        this.ssrEffect = new SSREffect(this.gl);
        this.motionBlurEffect = new MotionBlurEffect(this.gl);
        this.depthOfFieldEffect = new DepthOfFieldEffect(this.gl);

        // Set up post-processing pipeline
        this.postProcessEffects = [
            this.ssaoEffect,
            this.ssrEffect,
            this.bloomEffect,
            this.motionBlurEffect,
            this.depthOfFieldEffect,
            this.toneMapping,
            this.colorGrading
        ];
    }

    private initializeAdvancedRendering(): void {
        this.rayTracer = new RayTracer(this.gl);
        this.globalIllumination = new GlobalIllumination(this.gl);
        this.volumetricLighting = new VolumetricLighting(this.gl);
        this.particleRenderer = new AdvancedParticleRenderer(this.gl);
        this.decalRenderer = new DecalRenderer(this.gl);
    }

    private createShaderProgram(vertexSource: string, fragmentSource: string): ShaderProgram {
        const gl = this.gl;
        const program = gl.createProgram()!;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vertexShader, vertexSource);
        gl.compileShader(vertexShader);

        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            console.error('Vertex shader compilation error:', gl.getShaderInfoLog(vertexShader));
        }

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);

        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            console.error('Fragment shader compilation error:', gl.getShaderInfoLog(fragmentShader));
        }

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Shader program linking error:', gl.getProgramInfoLog(program));
        }

        return {
            program,
            vertexShader,
            fragmentShader,
            uniforms: new Map(),
            attributes: new Map()
        };
    }

    // Rendering pipeline
    render(scene: Scene, camera: Camera): void {
        const startTime = performance.now();

        // Reset stats
        this.renderStats.drawCalls = 0;
        this.renderStats.triangles = 0;
        this.renderStats.shaderSwitches = 0;
        this.renderStats.textureBinds = 0;

        // Update culling
        const visibleObjects = this.frustumCuller.cull(scene.objects, camera);
        const occlusionCulled = this.occlusionCuller.cull(visibleObjects, camera);

        // Update LOD
        this.lodManager.updateLOD(occlusionCulled, camera);

        // Deferred rendering pass
        this.renderDeferred(scene, camera, occlusionCulled);

        // Forward rendering for transparent objects
        this.renderForward(scene, camera, occlusionCulled);

        // Particle rendering
        this.particleRenderer.render(scene.particles, camera);

        // Decal rendering
        this.decalRenderer.render(scene.decals, camera);

        // Post-processing
        this.applyPostProcessing();

        // Debug rendering
        if (this.debugRenderer.enabled) {
            this.debugRenderer.render(scene, camera);
        }

        this.renderStats.frameTime = performance.now() - startTime;
    }

    private renderDeferred(scene: Scene, camera: Camera, objects: RenderObject[]): void {
        const gl = this.gl;
        const gBuffer = this.renderTargets.get('gBuffer')!;

        // Bind G-Buffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer.framebuffer);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Geometry pass
        const pbrProgram = this.shaderPrograms.get('pbr')!;
        gl.useProgram(pbrProgram.program);
        this.renderStats.shaderSwitches++;

        // Set camera uniforms
        this.setCameraUniforms(pbrProgram, camera);

        // Render all opaque objects
        for (const object of objects) {
            if (object.material.transparent) continue;

            this.renderObject(object, pbrProgram, camera);
        }

        // Lighting pass
        this.renderLighting(scene, camera, gBuffer);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private renderLighting(scene: Scene, camera: Camera, gBuffer: RenderTarget): void {
        const gl = this.gl;

        // Use lighting shader
        const lightingProgram = this.shaderPrograms.get('deferredLighting')!;
        gl.useProgram(lightingProgram.program);
        this.renderStats.shaderSwitches++;

        // Bind G-Buffer textures
        for (let i = 0; i < gBuffer.textures.length; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, gBuffer.textures[i]);
        }

        // Set lighting uniforms
        this.setLightingUniforms(lightingProgram, scene.lights, camera);

        // Render full-screen quad
        this.renderFullScreenQuad();

        this.renderStats.drawCalls++;
    }

    private renderForward(scene: Scene, camera: Camera, objects: RenderObject[]): void {
        const gl = this.gl;

        // Render transparent objects with forward rendering
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const pbrProgram = this.shaderPrograms.get('pbr')!;
        gl.useProgram(pbrProgram.program);
        this.renderStats.shaderSwitches++;

        // Sort transparent objects back-to-front
        const transparentObjects = objects
            .filter(obj => obj.material.transparent)
            .sort((a, b) => {
                const distA = Vec3.distance(a.position, camera.position);
                const distB = Vec3.distance(b.position, camera.position);
                return distB - distA;
            });

        for (const object of transparentObjects) {
            this.renderObject(object, pbrProgram, camera);
        }

        gl.disable(gl.BLEND);
    }

    private renderObject(object: RenderObject, program: ShaderProgram, camera: Camera): void {
        const gl = this.gl;

        // Set model uniforms
        const modelMatrix = this.calculateModelMatrix(object);
        const mvpMatrix = Mat4.create();
        Mat4.multiply(mvpMatrix, camera.viewProjectionMatrix, modelMatrix);

        gl.uniformMatrix4fv(gl.getUniformLocation(program.program, 'u_modelViewProjection'), false, mvpMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(program.program, 'u_model'), false, modelMatrix);

        // Set material uniforms
        this.setMaterialUniforms(program, object.material);

        // Bind vertex arrays
        gl.bindVertexArray(object.vao);

        // Draw
        gl.drawElements(gl.TRIANGLES, object.indexCount, gl.UNSIGNED_INT, 0);

        this.renderStats.drawCalls++;
        this.renderStats.triangles += object.indexCount / 3;
    }

    private calculateModelMatrix(object: RenderObject): Mat4 {
        const matrix = Mat4.create();
        Mat4.fromRotationTranslationScale(matrix, object.rotation, object.position, object.scale);
        return matrix;
    }

    private setCameraUniforms(program: ShaderProgram, camera: Camera): void {
        const gl = this.gl;

        gl.uniformMatrix4fv(gl.getUniformLocation(program.program, 'u_view'), false, camera.viewMatrix);
        gl.uniform3fv(gl.getUniformLocation(program.program, 'u_cameraPosition'), camera.position);
    }

    private setMaterialUniforms(program: ShaderProgram, material: Material): void {
        const gl = this.gl;

        // Bind textures
        if (material.albedoTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, material.albedoTexture);
            gl.uniform1i(gl.getUniformLocation(program.program, 'u_albedoMap'), 0);
            this.renderStats.textureBinds++;
        }

        if (material.normalTexture) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, material.normalTexture);
            gl.uniform1i(gl.getUniformLocation(program.program, 'u_normalMap'), 1);
            this.renderStats.textureBinds++;
        }

        if (material.metallicRoughnessTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, material.metallicRoughnessTexture);
            gl.uniform1i(gl.getUniformLocation(program.program, 'u_metallicRoughnessMap'), 2);
            this.renderStats.textureBinds++;
        }

        if (material.emissiveTexture) {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, material.emissiveTexture);
            gl.uniform1i(gl.getUniformLocation(program.program, 'u_emissiveMap'), 3);
            this.renderStats.textureBinds++;
        }

        if (material.occlusionTexture) {
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, material.occlusionTexture);
            gl.uniform1i(gl.getUniformLocation(program.program, 'u_occlusionMap'), 4);
            this.renderStats.textureBinds++;
        }

        // Set material properties
        gl.uniform4fv(gl.getUniformLocation(program.program, 'u_baseColor'), material.baseColor);
        gl.uniform1f(gl.getUniformLocation(program.program, 'u_metallic'), material.metallic);
        gl.uniform1f(gl.getUniformLocation(program.program, 'u_roughness'), material.roughness);
        gl.uniform3fv(gl.getUniformLocation(program.program, 'u_emissive'), material.emissive);
        gl.uniform1f(gl.getUniformLocation(program.program, 'u_occlusionStrength'), material.occlusionStrength);
        gl.uniform1f(gl.getUniformLocation(program.program, 'u_normalScale'), material.normalScale);
    }

    private setLightingUniforms(program: ShaderProgram, lights: Light[], camera: Camera): void {
        const gl = this.gl;

        // Prepare light data
        const lightPositions: number[] = [];
        const lightColors: number[] = [];
        const lightIntensities: number[] = [];
        const lightDirections: number[] = [];
        const lightRanges: number[] = [];
        const lightTypes: number[] = [];

        for (const light of lights.slice(0, 16)) { // Max 16 lights
            lightPositions.push(...light.position);
            lightColors.push(...light.color);
            lightIntensities.push(light.intensity);
            lightDirections.push(...light.direction);
            lightRanges.push(light.range);
            lightTypes.push(light.type);
        }

        // Pad arrays if needed
        while (lightPositions.length < 16 * 3) {
            lightPositions.push(0);
            lightColors.push(0);
            lightDirections.push(0);
        }
        while (lightIntensities.length < 16) {
            lightIntensities.push(0);
            lightRanges.push(0);
            lightTypes.push(0);
        }

        gl.uniform3fv(gl.getUniformLocation(program.program, 'u_lightPositions'), new Float32Array(lightPositions));
        gl.uniform3fv(gl.getUniformLocation(program.program, 'u_lightColors'), new Float32Array(lightColors));
        gl.uniform1fv(gl.getUniformLocation(program.program, 'u_lightIntensities'), new Float32Array(lightIntensities));
        gl.uniform3fv(gl.getUniformLocation(program.program, 'u_lightDirections'), new Float32Array(lightDirections));
        gl.uniform1fv(gl.getUniformLocation(program.program, 'u_lightRanges'), new Float32Array(lightRanges));
        gl.uniform1iv(gl.getUniformLocation(program.program, 'u_lightTypes'), new Int32Array(lightTypes));
        gl.uniform1i(gl.getUniformLocation(program.program, 'u_lightCount'), lights.length);

        // Environment uniforms
        gl.uniform3fv(gl.getUniformLocation(program.program, 'u_ambientColor'), [0.1, 0.1, 0.1]);
        gl.uniform1f(gl.getUniformLocation(program.program, 'u_ambientIntensity'), 1.0);
        gl.uniform1f(gl.getUniformLocation(program.program, 'u_exposure'), 1.0);
    }

    private applyPostProcessing(): void {
        const gl = this.gl;

        // Apply each effect in sequence
        for (const effect of this.postProcessEffects) {
            effect.apply(this.renderTargets);
        }

        // Final blit to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Render final result
        const finalProgram = this.shaderPrograms.get('final')!;
        gl.useProgram(finalProgram.program);

        // Bind final processed texture
        const finalTexture = this.renderTargets.get('colorGradingBuffer')?.textures[0] ||
                            this.renderTargets.get('toneMappingBuffer')?.textures[0];

        if (finalTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, finalTexture);
            gl.uniform1i(gl.getUniformLocation(finalProgram.program, 'u_texture'), 0);
        }

        this.renderFullScreenQuad();
        this.renderStats.drawCalls++;
    }

    private renderFullScreenQuad(): void {
        const gl = this.gl;

        // Create quad vertices if not cached
        const quadVertices = new Float32Array([
            -1, -1, 0, 0,
             1, -1, 1, 0,
            -1,  1, 0, 1,
             1,  1, 1, 1
        ]);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.deleteVertexArray(vao);
        gl.deleteBuffer(vbo);
    }

    // Advanced rendering features
    enableRayTracing(enabled: boolean): void {
        if (enabled) {
            this.rayTracer.enable();
        } else {
            this.rayTracer.disable();
        }
    }

    enableGlobalIllumination(enabled: boolean): void {
        if (enabled) {
            this.globalIllumination.enable();
        } else {
            this.globalIllumination.disable();
        }
    }

    enableVolumetricLighting(enabled: boolean): void {
        if (enabled) {
            this.volumetricLighting.enable();
        } else {
            this.volumetricLighting.disable();
        }
    }

    // Visual effects
    createVisualEffect(type: string, position: Vec3, config: VisualEffectConfig): string {
        const effectId = `effect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const effect: VisualEffect = {
            id: effectId,
            type,
            position: Vec3.clone(position),
            config,
            startTime: performance.now(),
            duration: config.duration || 1000,
            parameters: config.parameters || {}
        };

        this.visualEffects.set(effectId, effect);

        // Create effect instance
        const instance = this.createEffectInstance(effect);
        this.effectInstances.push(instance);

        return effectId;
    }

    private createEffectInstance(effect: VisualEffect): EffectInstance {
        // Create particles, geometry, etc. based on effect type
        return {
            effectId: effect.id,
            particles: [],
            geometry: null,
            shader: null,
            uniforms: new Map()
        };
    }

    updateVisualEffects(deltaTime: number): void {
        // Update effect instances
        for (let i = this.effectInstances.length - 1; i >= 0; i--) {
            const instance = this.effectInstances[i];
            const effect = this.visualEffects.get(instance.effectId);

            if (!effect) {
                this.effectInstances.splice(i, 1);
                continue;
            }

            // Update effect logic
            this.updateEffectInstance(instance, effect, deltaTime);

            // Remove expired effects
            if (performance.now() - effect.startTime >= effect.duration) {
                this.visualEffects.delete(effect.id);
                this.effectInstances.splice(i, 1);
            }
        }
    }

    private updateEffectInstance(instance: EffectInstance, effect: VisualEffect, deltaTime: number): void {
        // Update particles, geometry, etc.
        // Implementation depends on effect type
    }

    // GPU compute operations
    runComputeShader(shaderName: string, workGroups: Vec3, uniforms?: Map<string, any>): void {
        const gl = this.gl;
        const shader = this.computeShaders.get(shaderName);

        if (!shader) return;

        gl.useProgram(shader.program);
        this.renderStats.shaderSwitches++;

        // Set uniforms
        if (uniforms) {
            for (const [name, value] of uniforms) {
                const location = gl.getUniformLocation(shader.program, name);
                if (location) {
                    if (Array.isArray(value)) {
                        if (value.length === 2) gl.uniform2fv(location, value);
                        else if (value.length === 3) gl.uniform3fv(location, value);
                        else if (value.length === 4) gl.uniform4fv(location, value);
                        else gl.uniform1fv(location, value);
                    } else if (typeof value === 'number') {
                        gl.uniform1f(location, value);
                    }
                }
            }
        }

        // Dispatch compute
        gl.dispatchCompute(workGroups[0], workGroups[1], workGroups[2]);

        // Memory barrier if needed
        gl.memoryBarrier(gl.SHADER_IMAGE_ACCESS_BARRIER_BIT | gl.TEXTURE_FETCH_BARRIER_BIT);
    }

    // Performance monitoring
    getRenderStats(): RenderStats {
        return { ...this.renderStats };
    }

    // Debug features
    enableDebugMode(enabled: boolean): void {
        this.debugRenderer.enabled = enabled;
    }

    renderDebugInfo(): void {
        if (!this.debugRenderer.enabled) return;

        // Render performance stats, bounding boxes, etc.
        this.debugRenderer.renderStats(this.renderStats);
        this.profiler.renderGraphs();
    }

    // Resource management
    dispose(): void {
        const gl = this.gl;

        // Clean up shaders
        for (const shader of this.shaderPrograms.values()) {
            gl.deleteProgram(shader.program);
            gl.deleteShader(shader.vertexShader);
            gl.deleteShader(shader.fragmentShader);
        }

        // Clean up framebuffers and textures
        for (const target of this.renderTargets.values()) {
            gl.deleteFramebuffer(target.framebuffer);
            for (const texture of target.textures) {
                gl.deleteTexture(texture);
            }
            if (target.depthTexture) {
                gl.deleteTexture(target.depthTexture);
            }
        }

        // Clean up effects
        this.bloomEffect.dispose();
        this.toneMapping.dispose();
        this.colorGrading.dispose();
        this.ssaoEffect.dispose();
        this.ssrEffect.dispose();
        this.motionBlurEffect.dispose();
        this.depthOfFieldEffect.dispose();

        // Clean up advanced systems
        this.rayTracer.dispose();
        this.globalIllumination.dispose();
        this.volumetricLighting.dispose();
        this.particleRenderer.dispose();
        this.decalRenderer.dispose();

        console.log('[AdvancedGraphicsSystem] Disposed');
    }
}

// Supporting classes and interfaces
interface ShaderProgram {
    program: WebGLProgram;
    vertexShader: WebGLShader;
    fragmentShader: WebGLShader;
    uniforms: Map<string, WebGLUniformLocation>;
    attributes: Map<string, number>;
}

interface ComputeProgram {
    program: WebGLProgram;
    shader: WebGLShader;
}

interface ComputeShader {
    program: WebGLProgram;
    uniforms: Map<string, WebGLUniformLocation>;
}

interface Framebuffer {
    framebuffer: WebGLFramebuffer;
    attachments: number[];
}

interface RenderTarget {
    framebuffer: WebGLFramebuffer;
    textures: WebGLTexture[];
    depthTexture: WebGLTexture | null;
}

interface PostProcessEffect {
    apply(renderTargets: Map<string, RenderTarget>): void;
    dispose(): void;
}

interface Scene {
    objects: RenderObject[];
    lights: Light[];
    particles: ParticleSystem[];
    decals: Decal[];
    camera: Camera;
}

interface RenderObject {
    position: Vec3;
    rotation: Vec4; // Quaternion
    scale: Vec3;
    material: Material;
    vao: WebGLVertexArrayObject;
    indexCount: number;
    boundingBox: BoundingBox;
    lodLevel: number;
}

interface Material {
    baseColor: number[];
    metallic: number;
    roughness: number;
    emissive: number[];
    albedoTexture?: WebGLTexture;
    normalTexture?: WebGLTexture;
    metallicRoughnessTexture?: WebGLTexture;
    emissiveTexture?: WebGLTexture;
    occlusionTexture?: WebGLTexture;
    occlusionStrength: number;
    normalScale: number;
    transparent: boolean;
}

interface Light {
    position: Vec3;
    color: Vec3;
    intensity: number;
    direction: Vec3;
    range: number;
    type: number; // 0: directional, 1: point, 2: spot
}

interface Camera {
    position: Vec3;
    viewMatrix: Mat4;
    projectionMatrix: Mat4;
    viewProjectionMatrix: Mat4;
    near: number;
    far: number;
    fov: number;
}

interface BoundingBox {
    min: Vec3;
    max: Vec3;
}

interface ParticleSystem {
    particles: Particle[];
    emitter: ParticleEmitter;
    material: Material;
}

interface Particle {
    position: Vec3;
    velocity: Vec3;
    color: Vec4;
    life: number;
    size: number;
}

interface ParticleEmitter {
    position: Vec3;
    rate: number;
    lifetime: number;
    initialVelocity: Vec3;
    spread: number;
}

interface Decal {
    position: Vec3;
    rotation: Vec4;
    scale: Vec3;
    texture: WebGLTexture;
    material: Material;
}

interface VisualEffect {
    id: string;
    type: string;
    position: Vec3;
    config: VisualEffectConfig;
    startTime: number;
    duration: number;
    parameters: any;
}

interface VisualEffectConfig {
    duration?: number;
    parameters?: any;
}

interface EffectInstance {
    effectId: string;
    particles: Particle[];
    geometry: any;
    shader: ShaderProgram | null;
    uniforms: Map<string, any>;
}

interface RenderStats {
    drawCalls: number;
    triangles: number;
    frameTime: number;
    gpuMemory: number;
    shaderSwitches: number;
    textureBinds: number;
}

// Post-processing effect implementations
class BloomEffect implements PostProcessEffect {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private framebuffers: WebGLFramebuffer[];
    private textures: WebGLTexture[];

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.framebuffers = [];
        this.textures = [];
        this.initialize();
    }

    private initialize(): void {
        // Create bloom extraction shader
        const vertexShader = `#version 300 es
            layout(location = 0) in vec2 a_position;
            layout(location = 1) in vec2 a_texCoord;
            out vec2 v_texCoord;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        const fragmentShader = `#version 300 es
            precision mediump float;
            in vec2 v_texCoord;
            uniform sampler2D u_texture;
            uniform float u_threshold;
            out vec4 outColor;
            void main() {
                vec4 color = texture(u_texture, v_texCoord);
                float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
                outColor = brightness > u_threshold ? color : vec4(0.0);
            }
        `;

        this.program = this.createShaderProgram(vertexShader, fragmentShader);

        // Create blur framebuffers
        this.createBlurBuffers();
    }

    private createShaderProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
        const gl = this.gl;
        const program = gl.createProgram()!;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vertexShader, vertexSource);
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        return program;
    }

    private createBlurBuffers(): void {
        const gl = this.gl;
        const width = gl.canvas.width;
        const height = gl.canvas.height;

        for (let i = 0; i < 2; i++) {
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

            this.framebuffers.push(fbo!);
            this.textures.push(texture!);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    apply(renderTargets: Map<string, RenderTarget>): void {
        const gl = this.gl;
        const inputTarget = renderTargets.get('main') || renderTargets.get('gBuffer');

        if (!inputTarget) return;

        // Extract bright areas
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[0]);
        gl.useProgram(this.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTarget.textures[0]);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_threshold'), 0.8);

        this.renderQuad();

        // Apply gaussian blur (multiple passes)
        this.applyGaussianBlur();

        // Combine with original
        gl.bindFramebuffer(gl.FRAMEBUFFER, inputTarget.framebuffer);
        // Blend bloom with original image
    }

    private applyGaussianBlur(): void {
        // Implement gaussian blur with multiple passes
        // Horizontal and vertical blur passes
    }

    private renderQuad(): void {
        const gl = this.gl;
        const vertices = new Float32Array([
            -1, -1, 0, 0,
             1, -1, 1, 0,
            -1,  1, 0, 1,
             1,  1, 1, 1
        ]);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.deleteVertexArray(vao);
        gl.deleteBuffer(vbo);
    }

    dispose(): void {
        const gl = this.gl;
        gl.deleteProgram(this.program);
        for (const fbo of this.framebuffers) {
            gl.deleteFramebuffer(fbo);
        }
        for (const texture of this.textures) {
            gl.deleteTexture(texture);
        }
    }
}

// Placeholder classes for other effects
class ToneMappingEffect implements PostProcessEffect {
    constructor(private gl: WebGL2RenderingContext) {}
    apply(renderTargets: Map<string, RenderTarget>): void {}
    dispose(): void {}
}

class ColorGradingEffect implements PostProcessEffect {
    constructor(private gl: WebGL2RenderingContext) {}
    apply(renderTargets: Map<string, RenderTarget>): void {}
    dispose(): void {}
}

class SSAOEffect implements PostProcessEffect {
    constructor(private gl: WebGL2RenderingContext) {}
    apply(renderTargets: Map<string, RenderTarget>): void {}
    dispose(): void {}
}

class SSREffect implements PostProcessEffect {
    constructor(private gl: WebGL2RenderingContext) {}
    apply(renderTargets: Map<string, RenderTarget>): void {}
    dispose(): void {}
}

class MotionBlurEffect implements PostProcessEffect {
    constructor(private gl: WebGL2RenderingContext) {}
    apply(renderTargets: Map<string, RenderTarget>): void {}
    dispose(): void {}
}

class DepthOfFieldEffect implements PostProcessEffect {
    constructor(private gl: WebGL2RenderingContext) {}
    apply(renderTargets: Map<string, RenderTarget>): void {}
    dispose(): void {}
}

// Advanced rendering system stubs
class RayTracer {
    constructor(private gl: WebGL2RenderingContext) {}
    enable(): void {}
    disable(): void {}
    dispose(): void {}
}

class GlobalIllumination {
    constructor(private gl: WebGL2RenderingContext) {}
    enable(): void {}
    disable(): void {}
    dispose(): void {}
}

class VolumetricLighting {
    constructor(private gl: WebGL2RenderingContext) {}
    enable(): void {}
    disable(): void {}
    dispose(): void {}
}

class AdvancedParticleRenderer {
    constructor(private gl: WebGL2RenderingContext) {}
    render(particles: ParticleSystem[], camera: Camera): void {}
    dispose(): void {}
}

class DecalRenderer {
    constructor(private gl: WebGL2RenderingContext) {}
    render(decals: Decal[], camera: Camera): void {}
    dispose(): void {}
}

// Optimization systems
class FrustumCuller {
    cull(objects: RenderObject[], camera: Camera): RenderObject[] {
        // Implement frustum culling
        return objects;
    }
}

class OcclusionCuller {
    cull(objects: RenderObject[], camera: Camera): RenderObject[] {
        // Implement occlusion culling
        return objects;
    }
}

class LODManager {
    updateLOD(objects: RenderObject[], camera: Camera): void {
        // Implement LOD management
    }
}

class DebugRenderer {
    enabled: boolean = false;

    render(scene: Scene, camera: Camera): void {
        // Implement debug rendering
    }

    renderStats(stats: RenderStats): void {
        // Render performance stats
    }
}

class GraphicsProfiler {
    renderGraphs(): void {
        // Render performance graphs
    }
}
